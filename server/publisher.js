const Redis = require('ioredis');
var constants = require('./constants');
var Message = require('./Message')
var fs = require('fs');
var myargs = process.argv.slice(2);   // channelName
var channelName = myargs[0];
var timeInMinutes = myargs[1];
var totalMessagesSent = 0;
const appInsights = require('applicationinsights');
const { port, pwd, appInsightKey } = require('./config');
appInsights.setup(appInsightKey).start();
var client = appInsights.defaultClient;
var parentPath = "/tmp/pub/";
var logFile = parentPath + channelName + "_log.txt";
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
  // fs.appendFileSync(logFile, "redisPubConnMsg\n");
  // fs.appendFileSync(logFile, JSON.stringify(propertySet));
  // fs.appendFileSync(logFile, "\n");
  startExecution();
});


publisher.on('connect', function () {
  var propertySet = { "errorMessage": "null", "descriptiveMessage": "Redis Connection established", "channelId": channelName };
  client.trackEvent({ name: "redisPubConnMsg", properties: propertySet });
  fs.appendFileSync(logFile, "redisPubConnMsg\n");
  fs.appendFileSync(logFile, JSON.stringify(propertySet));
  fs.appendFileSync(logFile, "\n");
})


publisher.on('error', (err) => {
  var propertySet = { "errorMessage": "Something went wrong connecting redis", "descriptiveMessage": err.message, "channelId": channelName };
  client.trackEvent({ name: "redisPubConnError", properties: propertySet });
  fs.appendFileSync(logFile, "redisPubConnError\n");
  fs.appendFileSync(logFile, JSON.stringify(propertySet));
  fs.appendFileSync(logFile, "\n");
})

process.on('unhandledRejection', error => {
  var propertySet = { "errorMessage": error.message, "channelId": channelName };
  client.trackEvent({ name: "unHandledErrorPub", properties: propertySet });
  fs.appendFileSync(logFile, "unHandledErrorPub\n");
  fs.appendFileSync(logFile, JSON.stringify(propertySet));
  fs.appendFileSync(logFile, "\n");
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
    var metrics = { "MessageBatchSent": 100, "totalMessageSent": totalMessagesSent };
    client.trackEvent({ name: "InProgressPub", properties: propertySet, measurements: metrics });
    fs.appendFileSync(logFile, "InProgressPub\n");
    fs.appendFileSync(logFile, JSON.stringify(propertySet));
    fs.appendFileSync(logFile, "\n");
    fs.appendFileSync(logFile, JSON.stringify(metrics));
    fs.appendFileSync(logFile, "\n");
  }
}

var TotalRunTimePublisherInSeconds = timeInMinutes * 60 * 1000;
function startExecution() {
  const t = setInterval(publishMessage, constants.MESSAGE_PUBLISH_INTERVAL, channelName);
  setTimeout(lastExecution, TotalRunTimePublisherInSeconds, t);
}

function lastExecution(t) {
  clearInterval(t);
  publisher.publish(channelName, JSON.stringify(new Message(channelName, totalMessagesSent, "kill")));  // send signal to subscriber to finish
  // send completion event
  var remainingMessages = totalMessagesSent % 100;
  var propertySet = { "channelId": channelName, "totalMessageSent" : totalMessagesSent };
  var metrics = { "MessageBatchSent": remainingMessages, "totalMessageSent": totalMessagesSent };
  client.trackEvent({ name: "InProgressPub", properties: propertySet, measurements: metrics });
  client.trackEvent({ name: "pubEventCompletion", properties: propertySet });

  fs.appendFileSync(logFile, "pubEventCompletion\n")
  fs.appendFileSync(logFile, JSON.stringify(propertySet));
  fs.appendFileSync(logFile, "\n");
  fs.appendFileSync(logFile, JSON.stringify(metrics));
  fs.appendFileSync(logFile, "\n");

  var exitTime = TotalRunTimePublisherInSeconds * 2;
  setTimeout(exitProcess, exitTime)
}

function exitProcess() {
  client.trackEvent({ name: "Publisher exit", "totalMessageSent": totalMessagesSent })
  process.exit()
}