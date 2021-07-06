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





const publisher = new Redis({
  port: port,
  host: "redisclusterdisablep5.redis.cache.windows.net",
  family: 4,
  password: pwd,
  connectTimeout: 20000,
  tls: {
    servername: "redisclusterdisablep5.redis.cache.windows.net"
  }
});


// once redis is ready to take commands, we start execution else it pops up an error saying "Cluster isn't ready and enableOfflineQueue options is false"
publisher.on('ready', function () {
  var propertySet = { "errorMessage": "null", "descriptiveMessage": "Redis Connection ready. Starting execution", "channelId": channelName };
  client.trackEvent({ name: "redisPubConnMsg", properties: propertySet });
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

publisher.on('close', function () {
  var propertySet = { "errorMessage": "Redis server connection closed", "channelId": channelName };
  client.trackEvent({ name: "redisPubConnClosed", properties: propertySet });
  client.trackMetric({ name: "redisPubConnClosed", value: 1.0 })
})

process.on('unhandledRejection', error => {
  var propertySet = { "errorMessage": error.message, "channelId": channelName };
  client.trackEvent({ name: "unHandledErrorPub", properties: propertySet });
});

function publishMessage(channelName) {
  var messageObj = new Message(channelName, totalMessagesSent);     // content is same as totalMessageSent
  publisher.publish(channelName, JSON.stringify(messageObj));
  totalMessagesSent++;
  currentBatchCount++;
}

function sendMetric() {
  var propertySet = { "TotalMessagesSent": totalMessagesSent, "channelId": channelName }
  var metric = { "MessageBatchSent": currentBatchCount }
  client.trackEvent({ name: "PubMetric", properties: propertySet, measurements: metric });
  currentBatchCount = 0;
}

setInterval(publishMessage, constants.MESSAGE_PUBLISH_INTERVAL, channelName);
setInterval(sendMetric, constants.METRIC_SENT_INTERVAL); // send metric after every 1 minute
