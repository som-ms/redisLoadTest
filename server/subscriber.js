const Redis = require('ioredis');
var constants = require('./constants');
var Message = require('./Message');
var myargs = process.argv.slice(2);     // channelName, subscriberId
var channelName = myargs[0];
var subscriberId = myargs[1];
const { port, pwd, appInsightKey } = require('./config');

const appInsights = require('applicationinsights');
const MessageReceived = require('./MessageReceived');
appInsights.setup(appInsightKey).start();
// appInsights.defaultClient.context.tags[appInsights.defaultClient.context.keys.cloudRole] = "Role1";
var client = appInsights.defaultClient;

const sub = new Redis({
    port: port,
    host: "redisclusterdisablep5.redis.cache.windows.net",
    family: 4,
    password: pwd,
    connectTimeout: 20000,
    tls: {
        servername: "redisclusterdisablep5.redis.cache.windows.net"
    }
});


process.on('unhandledRejection', error => {
    var propertySet = { "errorMessage": error.message, "channelId": channelName, "subscriberId": subscriberId };
    client.trackEvent({ name: "unHandledErrorSub", properties: propertySet });
});

sub.on('reconnecting', function () {
    var propertySet = { "errorMessage": "Reconnecting redis", "descriptiveMessage": "Redis reconnection event called", "channelId": channelName, "subscriberId": subscriberId };
    client.trackEvent({ name: "redisSubConnMsg", properties: propertySet });
    client.trackMetric({ name: "redisSubReconnect", value: 1.0 });
    // console.log("reconnecting")
})

sub.on('ready', function () {
    var propertySet = { "errorMessage": "null", "descriptiveMessage": "Redis Connection ready. Starting execution", "channelId": channelName, "subscriberId": subscriberId };
    client.trackEvent({ name: "redisSubConnMsg", properties: propertySet });
});

sub.on('connect', function () {
    var propertySet = { "errorMessage": "null", "descriptiveMessage": "Redis Connection established", "channelId": channelName, "subscriberId": subscriberId };
    client.trackEvent({ name: "redisSubConnMsg", properties: propertySet });
})

sub.on("error", (err) => {
    var propertySet = { "errorMessage": "Something went wrong connecting redis", "descriptiveMessage": err.message, "channelId": channelName, "subscriberId": subscriberId };
    client.trackEvent({ name: "redisSubConnError", properties: propertySet });
})

sub.on('close', function () {
    var propertySet = { "errorMessage": "Redis server connection closed", "channelId": channelName, "subscriberId": subscriberId };
    client.trackEvent({ name: "redisSubConnClosed", properties: propertySet });
    client.trackMetric({ name: "redisSubConnClosed", value: 1.0 })
})




sub.subscribe(channelName, (err, count) => {
    if (err) {
        var propertySet = { "errorMessage": "couldn't subscribe to channel", "descriptiveMessage": err.message, "channelId": channelName };
        client.trackEvent({ name: "redisSubConnError", properties: propertySet });
    } else {
        var propertySet = { "errorMessage": "null", "descriptiveMessage": "subscribed to channel", "channelId": channelName, "subscriberId": subscriberId };
        client.trackEvent({ name: "redisSubConn", properties: propertySet });
    }
});


var totalMessageReceived = 0;   // count of total messages received

var messageBatchReceived = 0;
var messageReceiveStarted = false;
var totalExpected = 0, lostMessages = 0;

var sequence = -1;
var mySet = new Set();
let myMap = new Map();
sub.on("message", (channel, message) => {
    var messageObject = JSON.parse(message);
    processMessage(messageObject);
    totalMessageReceived++;
    messageBatchReceived++;
    messageReceiveStarted = true;
})

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
        var receivedMessage = new MessageReceived(messageObject.content, messageObject.timestamp);
        mySet.add(receivedMessage);
        myMap.set(receivedMessage.content, receivedMessage);
    }
}

function processWindow(leftlimit, rightLimit) {
    let arr = Array.from(mySet);
    // sort by timestamp
    arr.sort(function (x, y) {
        return x.timestamp - y.timestamp;
    })

    var currentBatch = 0;
    var sequencePointerUpdated = false;
    var max = -1;
    for (let item of arr) {                   // for each item in set (contains messages out of sequence)
        if (item.timestamp <= rightLimit && item.timestamp > leftlimit) {        // all elements where timestamp is smaller. it is an ordered set by insertion
            if (item.content > sequence) {
                currentBatch++;                     // find all numbers greater than current sequence pointer
                if (item.content > max) {           // increase the max to create a new sequence pointer
                    max = item.content;
                    sequencePointerUpdated = true;
                }
            }
            myMap.delete(item.content);             // content having values less than current sequence pointer
            mySet.delete(item);                     // OR values which have been processed
        } else {
            break;
        }
    }

    if (sequencePointerUpdated) {
        totalExpected = max - sequence;
        lostMessages = totalExpected - currentBatch;
        sequence = max;         // update sequence to max consecutive value available
    }
    myMap.clear();
    mySet.clear();

}


setInterval(sendMetric, constants.METRIC_SENT_INTERVAL);

function sendMetric() {

    if (messageReceiveStarted) {
        var currentTime = Date.now();
        var previousTime = currentTime - constants.METRIC_SENT_INTERVAL;
        processWindow(previousTime, currentTime);
        var propertySet = { "totalMessageReceived": totalMessageReceived, "lostMessages": lostMessages, "messageBatchReceived": messageBatchReceived, "channelId": channelName, "subscriberId": subscriberId };
        var metrics = { "lostMessages": lostMessages, "MessageBatchReceived": messageBatchReceived }
        client.trackEvent({ name: "subEvents", properties: propertySet, measurements: metrics })
        console.log("tracked event")
        resetValues();
    }

}

function resetValues() {
    totalExpected = 0;
    lostMessages = 0;
    messageBatchReceived = 0;
}