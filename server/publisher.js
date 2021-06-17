const Redis = require('ioredis');
var constants = require('./constants');
var Message = require('./Message')
var myargs = process.argv.slice(2);   // channelName
var channelName = myargs[0];
var timeInMinutes = myargs[1];
var totalMessagesSent = 0;
const appInsights = require('applicationinsights');
const { port, pwd, appInsightKey } = require('./config');
appInsights.setup(appInsightKey).start();
var client = appInsights.defaultClient;
const nodes = [
  {
    port: port,
    host: "fluidloadtest.redis.cache.windows.net"
  }
]

const publisher = new Redis.Cluster(
  nodes,
  {
    enableOfflineQueue: false,
    enableReadyCheck: true,
    slotsRefreshTimeout: 1000,
    dnsLookup: (address, callback) => callback(null, address),
    redisOptions: {
      family: 4,
      tls: {
        servername: "fluidloadtest.redis.cache.windows.net"
      },
      showFriendlyErrorStack: true,
      enableAutoPipelining: true,
      connectTimeout: 20000,
      password: pwd
    }
  }
);

// once redis is ready to take commands, we start execution else it pops up an error saying "Cluster isn't ready and enableOfflineQueue options is false"
publisher.on('ready', function () {
  var propertySet = { "errorMessage": "null", "descriptiveMessage": "Redis Connection ready. Starting execution", "channelId": channelName };
  client.trackEvent({ name: "redisPubConnMsg", properties: propertySet });
  startExecution();
});


publisher.on('connect', function () {
  var connectMessage = 'Redis client(p) connected for channel: ' + channelName;
  var propertySet = { "errorMessage": "null", "descriptiveMessage": "Redis Connection established", "channelId": channelName };
  client.trackEvent({ name: "redisPubConnMsg", properties: propertySet });
})


publisher.on('error', (err) => {
  var propertySet = { "errorMessage": "Something went wrong connecting redis", "descriptiveMessage": err.message, "channelId": channelName };
  client.trackEvent({ name: "redisPubConnError", properties: propertySet });
})

process.on('unhandledRejection', error => {
  var propertySet = { "errorMessage": error.message, "channelId": channelName };
  client.trackEvent({ name: "unHandledErrorPub", properties: propertySet });
});

function publishMessage(channelName) {
  var currentMessagePointer = 0;
  while (currentMessagePointer < constants.NUM_OF_MESSAGES) {   // total number of messages published at a single time
    var currentMessage = totalMessagesSent + currentMessagePointer;
    var messageObj = new Message(channelName, currentMessage, "leave");
    publisher.publish(channelName, JSON.stringify(messageObj));
    currentMessagePointer++;
  }
  totalMessagesSent += currentMessagePointer;
  sendMetric(totalMessagesSent);
}

function sendMetric(totalMessagesSent) {
  if (totalMessagesSent % 100 == 0) {
    var propertySet = { "channelId": channelName };
    var metrics = { "MessageBatchCount": 100, "totalMessageCount": totalMessagesSent };
    client.trackEvent({ name: "InProgressPub", properties: propertySet, measurements: metrics });
  }
}


function startExecution() {
  const t = setInterval(publishMessage, constants.MESSAGE_PUBLISH_INTERVAL, channelName)
  var TotalRunTimePublisherInSeconds = timeInMinutes * 60 * 1000;
  setTimeout(function () {
    clearInterval(t);
    publisher.publish(channelName, JSON.stringify(new Message(channelName, (totalMessagesSent - 1), "kill")));  // send signal to subscriber to finish
    // send completion event
    var remainingMessages = totalMessagesSent % 100;
    var propertySet = { "channelId": channelName };
    var metrics = { "MessageBatchCount": remainingMessages, "totalMessageCount": totalMessagesSent };
    client.trackEvent({ name: "InProgressPub", properties: propertySet, measurements: metrics });
    client.trackEvent({ name: "pubEventCompletion", properties: propertySet });

    var exitTime = TotalRunTimePublisherInSeconds * 2;
    setTimeout(exitProcess, exitTime)
  }, constants.TotalRunTimePublisherInSeconds)
}

function exitProcess() {
  process.exit()
}