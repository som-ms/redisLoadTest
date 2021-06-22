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
const fs = require('fs')
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


function writeToFile(message) {
  fs.appendFileSync("/tmp/pub/" + channelName + "_log.txt", JSON.stringify(message));
  fs.appendFileSync("/tmp/pub/" + channelName + "_log.txt", "\n");
}
// once redis is ready to take commands, we start execution else it pops up an error saying "Cluster isn't ready and enableOfflineQueue options is false"
publisher.on('ready', function () {
  var propertySet = { "errorMessage": "null", "descriptiveMessage": "Redis Connection ready. Starting execution", "channelId": channelName };
  client.trackEvent({ name: "redisPubConnMsg", properties: propertySet });
  writeToFile(propertySet)
  startExecution();
});

publisher.on('reconnecting', function () {
  var propertySet = { "errorMessage": "Reconnecting redis", "descriptiveMessage": "Redis reconnection event called", "channelId": channelName };
  client.trackEvent({ name: "redisPubConnMsg", properties: propertySet });
  client.trackMetric({ name: "redisPubReconnect", value: 1.0 });
  writeToFile(propertySet);
})

publisher.on('connect', function () {
  var propertySet = { "errorMessage": "null", "descriptiveMessage": "Redis Connection established", "channelId": channelName };
  client.trackEvent({ name: "redisPubConnMsg", properties: propertySet });
  writeToFile(propertySet);
})


publisher.on('error', (err) => {
  var propertySet = { "errorMessage": "Something went wrong connecting redis", "descriptiveMessage": err.message, "channelId": channelName };
  client.trackEvent({ name: "redisPubConnError", properties: propertySet });
  writeToFile(propertySet);
})


function publishMessage(channelName) {
  // console.log("publishing message")
  var messageObj = new Message(channelName, totalMessagesSent);     // content is same as totalMessageSent
  publisher.publish(channelName, JSON.stringify(messageObj));
  totalMessagesSent++;
  currentBatchCount++;

  // sendMetric(totalMessagesSent);
}

function sendMetric() {
  console.log("diff is: " + currentBatchCount);
  client.trackMetric({ name: "MessageBatchSent", value: currentBatchCount });
  
  writeToFile("MessageBatchSent:" + currentBatchCount );
  writeToFile("TotalMessagesSent: " + totalMessagesSent);
  currentBatchCount=0;

}

// var TotalRunTimePublisherInSeconds = timeInMinutes * 60 * 1000;
function startExecution() {
  const t = setInterval(publishMessage, constants.MESSAGE_PUBLISH_INTERVAL, channelName);
  setInterval(sendMetric, constants.METRIC_SENT_INTERVAL); // send metric after every 1 minute
}

process.on('SIGTERM', () => {
  console.log("terminating gracefully sigterm");
  sendMetric();
  client.trackEvent({ name: "TotalMessageSentCount", value: totalMessagesSent });
  console.log("totalmessagesentcount" + totalMessagesSent);
  writeToFile("TotalMessagesSent: " + totalMessagesSent + "\n");
})

process.on('SIGINT', () => {
  console.log("terminating gracefully sigint");
  sendMetric();
  client.trackEvent({ name: "TotalMessageSentCount", value: totalMessagesSent });
  console.log("totalmessagesentcount" + totalMessagesSent);
  writeToFile("TotalMessagesSent: " + totalMessagesSent + "\n");
})

process.on('SIGQUIT', () => {
  console.log("terminating gracefully sigquit");
  sendMetric();
  client.trackEvent({ name: "TotalMessageSentCount", value: totalMessagesSent });
  console.log("totalmessagesentcount" + totalMessagesSent);
  writeToFile("TotalMessagesSent: " + totalMessagesSent + "\n");
})


process.on('SIGKILL', () => {
  console.log("terminating gracefully sigkill");
  sendMetric();
  client.trackEvent({ name: "TotalMessageSentCount", value: totalMessagesSent });
  console.log("totalmessagesentcount" + totalMessagesSent);
  writeToFile("TotalMessagesSent: " + totalMessagesSent + "\n");
})

process.on('SIGHUP', () => {
  console.log("terminating gracefully sigHUP");
  sendMetric();
  client.trackEvent({ name: "TotalMessageSentCount", value: totalMessagesSent });
  console.log("totalmessagesentcount" + totalMessagesSent);
  writeToFile("TotalMessagesSent: " + totalMessagesSent + "\n");
})