const Redis = require("ioredis");
var constants = require("./constants");
var Message = require("./Message");
var myargs = process.argv.slice(2); // channelName, subscriberId
var channelName = myargs[0];
var subscriberId = myargs[1];
const { port, pwd, appInsightKey } = require("./config");

const appInsights = require("applicationinsights");
const MessageReceived = require("./MessageReceived");
appInsights.setup(appInsightKey).start();
// appInsights.defaultClient.context.tags[appInsights.defaultClient.context.keys.cloudRole] = "Role1";
var client = appInsights.defaultClient;

const sub = new Redis({
  port: port,
  host: "p4redis.redis.cache.windows.net",
  family: 4,
  password: pwd,
  connectTimeout: 20000,
  tls: {
    servername: "p4redis.redis.cache.windows.net",
  },
});

process.on("unhandledRejection", (error) => {
  var propertySet = {
    errorMessage: error.message,
    channelId: channelName,
    subscriberId: subscriberId,
  };
  client.trackEvent({ name: "unHandledErrorSub", properties: propertySet });
});

sub.on("reconnecting", function () {
  var propertySet = {
    errorMessage: "Reconnecting redis",
    descriptiveMessage: "Redis reconnection event called",
    channelId: channelName,
    subscriberId: subscriberId,
  };
  client.trackEvent({ name: "redisSubConnMsg", properties: propertySet });
  client.trackMetric({ name: "redisSubReconnect", value: 1.0 });
  // console.log("reconnecting")
});

sub.on("ready", function () {
  var propertySet = {
    errorMessage: "null",
    descriptiveMessage: "Redis Connection ready. Starting execution",
    channelId: channelName,
    subscriberId: subscriberId,
  };
  client.trackEvent({ name: "redisSubConnMsg", properties: propertySet });
});

sub.on("connect", function () {
  var propertySet = {
    errorMessage: "null",
    descriptiveMessage: "Redis Connection established",
    channelId: channelName,
    subscriberId: subscriberId,
  };
  client.trackEvent({ name: "redisSubConnMsg", properties: propertySet });
});

sub.on("error", (err) => {
  var propertySet = {
    errorMessage: "Something went wrong connecting redis",
    descriptiveMessage: err.message,
    channelId: channelName,
    subscriberId: subscriberId,
  };
  client.trackEvent({ name: "redisSubConnError", properties: propertySet });
});

sub.on("close", function () {
  var propertySet = {
    errorMessage: "Redis server connection closed",
    channelId: channelName,
    subscriberId: subscriberId,
  };
  client.trackEvent({ name: "redisSubConnClosed", properties: propertySet });
  client.trackMetric({ name: "redisSubConnClosed", value: 1.0 });
});

sub.subscribe(channelName, (err, count) => {
  if (err) {
    var propertySet = {
      errorMessage: "couldn't subscribe to channel",
      descriptiveMessage: err.message,
      channelId: channelName,
    };
    client.trackEvent({ name: "redisSubConnError", properties: propertySet });
  } else {
    var propertySet = {
      errorMessage: "null",
      descriptiveMessage: "subscribed to channel",
      channelId: channelName,
      subscriberId: subscriberId,
    };
    client.trackEvent({ name: "redisSubConn", properties: propertySet });
  }
});

var totalMessageReceived = 0; // count of total messages received

var messageBatchReceived = 0;
var messageReceiveStarted = false;
var lostMessages = 0;

var mySet = new Set();
let myMap = new Map();
sub.on("message", (channel, message) => {
  var messageObject = JSON.parse(message);
  processMessage(messageObject);
  totalMessageReceived++;
  messageBatchReceived++;
  messageReceiveStarted = true;
});

function isNumberInSequence(content) {
  if (content - sequence == 1) {
    return true;
  }
  return false;
}

function processMessage(messageObject) {
  if (isNumberInSequence(messageObject.content)) {
    sequence++;
  } else {
    if (messageObject.content < sequence) {
      // it is present in set
      var storedMessage = myMap.get(messageObject.content);
      var currentTime = Date.now();
      if (
        currentTime - storedMessage.timestamp >
        constants.MESSAGE_EXPIRY_INTERVAL
      ) {
        // currentTimestamp -
        lostMessages++;
      }
      mySet.delete(storedMessage);
      myMap.delete(storedMessage.content);
    } else {
      sequence = messageObject.content;         // update sequence
      for (var i = sequence + 1; i <= messageObject.content; i++) {     // add all missing elements in set and map
        var receivedMessage = new MessageReceived(i, messageObject.timestamp);
        mySet.add(receivedMessage);
        myMap.set(receivedMessage.content, receivedMessage);
      }
    }
  }
}

setInterval(sendMetric, constants.METRIC_SENT_INTERVAL);

function sendMetric() {
  if (messageReceiveStarted) {
    var currentTime = Date.now();
    processStoredElements(currentTime);
    var propertySet = {
      totalMessageReceived: totalMessageReceived,
      lostMessages: lostMessages,
      messageBatchReceived: messageBatchReceived,
      channelId: channelName,
      subscriberId: subscriberId,
    };
    var metrics = {
      lostMessages: lostMessages,
      MessageBatchReceived: messageBatchReceived,
    };
    client.trackEvent({
      name: "subEvents",
      properties: propertySet,
      measurements: metrics,
    });
    resetValues();
  }
}

function processStoredElements(currentTime) {
  let arr = Array.from(mySet);
  // sort by timestamp
  arr.sort(function (x, y) {
    return x.timestamp - y.timestamp;
  });
  for (let item of arr) {
    if (item.timestamp - currentTime > constants.MESSAGE_EXPIRY_INTERVAL) {
      lostMessages++;
      var messageSaved = myMap.get(item.content);
      mySet.delete(messageSaved);
      myMap.delete(item.content);
    } else {
      break; // since elements are sorted by timestamp
    }
  }
}

function resetValues() {
  lostMessages = 0;
  messageBatchReceived = 0;
}
