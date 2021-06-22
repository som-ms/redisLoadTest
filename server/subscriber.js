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
var logFile = "/tmp/sub/" + channelName + "_" + subscriberId + "_log.txt";
const fs = require('fs');
function writeToFile(message) {
    fs.appendFileSync(logFile, JSON.stringify(message));
    fs.appendFileSync(logFile, "\n");
}

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
    console.log("reconnecting")
    var propertySet = { "errorMessage": "Reconnecting redis", "descriptiveMessage": "Redis reconnection event called", "channelId": channelName, "subscriberId": subscriberId };
    client.trackEvent({ name: "redisSubConnMsg", properties: propertySet });
    client.trackMetric({ name: "redisSubReconnect", value: 1.0 });
    writeToFile(propertySet);
})

sub.on('ready', function () {
    console.log("ready")
    var propertySet = { "errorMessage": "null", "descriptiveMessage": "Redis Connection ready. Starting execution", "channelId": channelName, "subscriberId": subscriberId };
    client.trackEvent({ name: "redisSubConnMsg", properties: propertySet });
    writeToFile(propertySet);
    executeAfterReady();
});

sub.on('connect', function () {
    console.log("connect")
    var propertySet = { "errorMessage": "null", "descriptiveMessage": "Redis Connection established", "channelId": channelName, "subscriberId": subscriberId };
    client.trackEvent({ name: "redisSubConnMsg", properties: propertySet });
    writeToFile(propertySet);
})

sub.on("error", (err) => {
    console.log("error")
    var propertySet = { "errorMessage": "Something went wrong connecting redis", "descriptiveMessage": err.message, "channelId": channelName, "subscriberId": subscriberId };
    client.trackEvent({ name: "redisSubConnError", properties: propertySet });
    writeToFile(propertySet);
})




function executeAfterReady() {
    sub.subscribe(channelName, (err, count) => {
        if (err) {
            console.log("error subscribing")
            var propertySet = { "errorMessage": "couldn't subscribe to channel", "descriptiveMessage": err.message, "channelId": channelName };
            client.trackEvent({ name: "redisSubConnError", properties: propertySet });
            writeToFile(propertySet);
        } else {
            console.log("subscribed")
            var propertySet = { "errorMessage": "null", "descriptiveMessage": "subscribed to channel", "channelId": channelName, "subscriberId": subscriberId };
            client.trackEvent({ name: "redisSubConn", properties: propertySet });
            writeToFile(propertySet);
        }
    });
}


var totalMessageReceived = 0;   // count of total messages received

var min = -1, max = 0;
var currentElements = [];
var duplicates = 0, lostMessages = 0;
var currentSet = new Set();
var messageBatchReceived = 0;
var messageReceiveStarted = false;

sub.on("message", (channel, message) => {
    var messageObject = JSON.parse(message);
    totalMessageReceived++;
    messageBatchReceived++;
    checkDuplicates(messageObject.content); // check duplicate message
    checkIfLost(messageObject.content);     // check lost message
    updateMax(messageObject.content);   // update min,max
    messageReceiveStarted = true;
})

setInterval(sendMetric, constants.METRIC_SENT_INTERVAL);

function checkDuplicates(content) {
    if (currentSet.has(content)) {
        duplicates++;
    } else {
        currentSet.add(content);
    }
}

function checkIfLost(content) {
    if (content < min) {
        lostMessages++;
    }
}

function updateMax(content) {

    if (content > max) {
        max = content;
    }

}

function sendMetric() {

    if (messageReceiveStarted) {

        var propertySet = { "totalMessageReceived": totalMessageReceived, "lostMessages": lostMessages, "duplicateMessages": duplicates, "messageBatchReceived" : messageBatchReceived };
        client.trackMetric({ name: "lostMessages", value: lostMessages });
        client.trackMetric({ name: "duplicateMessages", value: duplicates });
        client.trackMetric({ name: "MessageBatchReceived", messageBatchReceived });

        writeToFile(propertySet);
        resetValues();      // this event can be sent separately
    }

}

function resetValues() {
    duplicates = 0;
    lostMessages = 0;
    min = max;
    max = min;
    messageBatchReceived = 0;
    currentSet.clear();
}

process.on('SIGTERM', () => {
    console.log("terminating gracefully sigterm");
    sendMetric();
    client.trackEvent({ name: "TotalMessageReceivedCount", value: totalMessageReceived });
    console.log("totalMessageReceived" + totalMessageReceived);
    writeToFile("TotalMessageReceived: " + totalMessageReceived);
})

process.on('SIGINT', () => {
    console.log("terminating gracefully sigint");
    sendMetric();
    client.trackEvent({ name: "totalMessageReceivedCount", value: totalMessageReceived });
    console.log("totalMessageReceived" + totalMessageReceived);
    writeToFile("TotalMessageReceived: " + totalMessageReceived);
})

process.on('SIGQUIT', () => {
    console.log("terminating gracefully sigquit");
    sendMetric();
    client.trackEvent({ name: "TotalMessageReceivedCount", value: totalMessageReceived });
    console.log("totalMessageReceived" + totalMessageReceived);
    writeToFile("TotalMessageReceived: " + totalMessageReceived);
})


process.on('SIGKILL', () => {
    console.log("terminating gracefully sigkill");
    sendMetric();
    client.trackEvent({ name: "TotalMessageReceivedCount", value: totalMessageReceived });
    console.log("totalMessageReceived" + totalMessageReceived);
    writeToFile("TotalMessageReceived: " + totalMessageReceived);
})

process.on('SIGHUP', () => {
    console.log("terminating gracefully sigHUP");
    sendMetric();
    client.trackEvent({ name: "TotalMessageReceivedCount", value: totalMessageReceived });
    console.log("totalMessageReceived" + totalMessageReceived);
    writeToFile("TotalMessageReceived: " + totalMessageReceived);
})


