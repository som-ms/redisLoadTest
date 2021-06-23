const Redis = require('ioredis');
var constants = require('./constants');
var Message = require('./Message')
var myargs = process.argv.slice(2);   // channelName
var channelName = myargs[0];
const appInsights = require('applicationinsights');
const { port, pwd, appInsightKey } = require('./config');
appInsights.setup(appInsightKey).start();
var client = appInsights.defaultClient;
//client.commonProperties.channelId = channelName
var currentBatchCount = 0;
var totalMessagesSent = 0;
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

publisher.on('reconnecting', function () {
  var propertySet = { "errorMessage": "Reconnecting redis", "descriptiveMessage": "Redis reconnection event called", "channelId": channelName };
  client.trackEvent({ name: "redisPubConnMsg", properties: propertySet });
  client.trackMetric({ name: "redisPubReconnect", value: 1.0 });
})

publisher.on('connect', function () {
  var propertySet = { "errorMessage": "null", "descriptiveMessage": "Redis Connection established", "channelId": channelName };
  client.trackEvent({ name: "redisPubConnMsg", properties: propertySet });
})


publisher.on('error', (err) => {
  var propertySet = { "errorMessage": "Something went wrong connecting redis", "descriptiveMessage": err.message, "channelId": channelName };
  client.trackEvent({ name: "redisPubConnError", properties: propertySet });
})


function publishMessage(channelName) {
  // console.log("publishing message")
  var messageObj = new Message(channelName, totalMessagesSent);     // content is same as totalMessageSent
  publisher.publish(channelName, JSON.stringify(messageObj));

  totalMessagesSent++;
  currentBatchCount++;
}

function sendMetric() {
  var propertySet = {"TotalMessagesSent": totalMessagesSent}
  var metric = {"MessageBatchSent" : currentBatchCount}
  client.trackEvent({name : "PubMetric", properties : propertySet, measurements : metric});
  
  currentBatchCount=0;

}

function startExecution() {
  const t = setInterval(publishMessage, constants.MESSAGE_PUBLISH_INTERVAL, channelName);
  setInterval(sendMetric, constants.METRIC_SENT_INTERVAL); // send metric after every 1 minute
}

process.on('SIGTERM', () => {
  sendMetric();
  client.trackEvent({ name: "TotalMessageSentCount", value: totalMessagesSent });
  process.exit();
})

process.on('SIGINT', () => {
  sendMetric();
  client.trackEvent({ name: "TotalMessageSentCount", value: totalMessagesSent });
  process.exit();
})

process.on('SIGQUIT', () => {
  sendMetric();
  client.trackEvent({ name: "TotalMessageSentCount", value: totalMessagesSent });
  process.exit();
})


process.on('SIGKILL', () => {
  sendMetric();
  client.trackEvent({ name: "TotalMessageSentCount", value: totalMessagesSent });
  process.exit();
})

process.on('SIGHUP', () => {
  sendMetric();
  client.trackEvent({ name: "TotalMessageSentCount", value: totalMessagesSent });
  process.exit();
})