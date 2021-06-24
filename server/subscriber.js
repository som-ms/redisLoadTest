const Redis = require('ioredis');
var constants = require('./constants');
var Message = require('./Message');
var myargs = process.argv.slice(2);     // channelName, subscriberId
var channelName = myargs[0];
var subscriberId = myargs[1];
const { port, pwd, appInsightKey } = require('./config');

const appInsights = require('applicationinsights');
appInsights.setup(appInsightKey).start();
appInsights.defaultClient.context.tags[appInsights.defaultClient.context.keys.cloudRole] = "Role1";
var client = appInsights.defaultClient;

const nodes = [
    {
        port: port,
        host: "fluidloadtest.redis.cache.windows.net"
    }
]
const sub = new Redis.Cluster(
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

sub.on('reconnecting', function () {
    var propertySet = { "errorMessage": "Reconnecting redis", "descriptiveMessage": "Redis reconnection event called", "channelId": channelName, "subscriberId": subscriberId };
    client.trackEvent({ name: "redisSubConnMsg", properties: propertySet });
    client.trackMetric({ name: "redisSubReconnect", value: 1.0 });
})

sub.on('ready', function () {
    var propertySet = { "errorMessage": "null", "descriptiveMessage": "Redis Connection ready. Starting execution", "channelId": channelName, "subscriberId": subscriberId };
    client.trackEvent({ name: "redisSubConnMsg", properties: propertySet });
    executeAfterReady();
});

sub.on('connect', function () {
    var propertySet = { "errorMessage": "null", "descriptiveMessage": "Redis Connection established", "channelId": channelName, "subscriberId": subscriberId };
    client.trackEvent({ name: "redisSubConnMsg", properties: propertySet });
})

sub.on("error", (err) => {
    var propertySet = { "errorMessage": "Something went wrong connecting redis", "descriptiveMessage": err.message, "channelId": channelName, "subscriberId": subscriberId };
    client.trackEvent({ name: "redisSubConnError", properties: propertySet });
})




function executeAfterReady() {
    sub.subscribe(channelName, (err, count) => {
        if (err) {
            var propertySet = { "errorMessage": "couldn't subscribe to channel", "descriptiveMessage": err.message, "channelId": channelName };
            client.trackEvent({ name: "redisSubConnError", properties: propertySet });
        } else {
            var propertySet = { "errorMessage": "null", "descriptiveMessage": "subscribed to channel", "channelId": channelName, "subscriberId": subscriberId };
            client.trackEvent({ name: "redisSubConn", properties: propertySet });
        }
    });
}


var totalMessageReceived = 0;   // count of total messages received

var min = -1, max = 0;
var duplicates = 0, lostMessages = 0;
var prevDuplicates = 0, prevLostMessages = 0;
var prevMessageBatchReceived = 0;
var currentSet = new Set();
var messageBatchReceived = 0;
var messageReceiveStarted = false;

sub.on("message", (channel, message) => {
    var messageObject = JSON.parse(message);
    totalMessageReceived++;
    messageBatchReceived++;
    checkDuplicates(messageObject.content); // check duplicate message
    messageReceiveStarted = true;
})

setInterval(sendMetric, constants.METRIC_SENT_INTERVAL);
// setInterval(resetValues, constants.MESSAGE_ACCEPTANCE_TIME_WINDOW);

function checkDuplicates(content) {
    if (content <= min) {            // old message received, consider as lost/out of order
       client.trackMetric({name: "OutOfOrder" , value : 1.0})
    } else {
        if (currentSet.has(content)) {  // same message within the time window, consider as  duplicate
            duplicates++;
        } else {
            currentSet.add(content);
        }
        if (content > max) {            // update max to stretch right boundary
            max = content;
        }
    }

}

function updateLostMessages() {         // after a metric window expires, considering messages from publisher are in sequence calculate lost messages count
    var totalPresent = currentSet.size;
    var totalExpected = max - min;
    if (totalPresent > 0 && totalExpected > totalPresent) {
        lostMessages += (totalExpected - totalPresent);
    }

}

function sendMetric() {

    if (messageReceiveStarted) {
        updateLostMessages();

        var currentWindowLost = lostMessages - prevLostMessages;
        var currentWindowDuplicates = duplicates - prevDuplicates;
        var currentMessageBatchReceived = messageBatchReceived - prevMessageBatchReceived;
        prevLostMessages = lostMessages;
        prevDuplicates = duplicates;
        prevMessageBatchReceived = messageBatchReceived;
        var propertySet = { "totalMessageReceived": totalMessageReceived, "lostMessages": currentWindowLost, "duplicateMessages": currentWindowDuplicates, "messageBatchReceived": currentMessageBatchReceived, "min": min, "max": max };
        var metrics = { "lostMessages": currentWindowLost, "duplicateMessages": currentWindowDuplicates, "MessageBatchReceived": currentMessageBatchReceived }
        client.trackEvent({ name: "subEvents", properties: propertySet, measurements: metrics })
        resetValues();      // this event can be sent separately
    }

}

function resetValues() {
    // sendMetric();
    duplicates = 0;
    lostMessages = 0;
    min = max;          // setting up left boundary after metric time window expired
    // max = min;
    messageBatchReceived = 0;
    currentSet.clear();
    prevDuplicates = 0;
    prevLostMessages = 0;
    prevMessageBatchReceived = 0;
}

process.on('SIGTERM', () => {
    sendMetric();
    client.trackEvent({ name: "TotalMessageReceivedCount", value: totalMessageReceived });
    process.exit();
})

process.on('SIGINT', () => {
    sendMetric();
    client.trackEvent({ name: "totalMessageReceivedCount", value: totalMessageReceived });
    process.exit();
})

process.on('SIGQUIT', () => {
    sendMetric();
    client.trackEvent({ name: "TotalMessageReceivedCount", value: totalMessageReceived });
    process.exit();
})


process.on('SIGKILL', () => {
    sendMetric();
    client.trackEvent({ name: "TotalMessageReceivedCount", value: totalMessageReceived });
    process.exit();
})

process.on('SIGHUP', () => {
    sendMetric();
    client.trackEvent({ name: "TotalMessageReceivedCount", value: totalMessageReceived });
    process.exit();
})


