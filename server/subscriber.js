const Redis = require('ioredis');
var constants = require('./constants');
var Message = require('./Message')
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

sub.on('ready', function () {
    var propertySet = { "errorMessage": "null", "descriptiveMessage": "Redis Connection ready. Starting execution", "channelId": channelName, "subscriberId": subscriberId };
    client.trackEvent({ name: "redisSubConnMsg", properties: propertySet });
    executeAfterReady();
});

sub.on('connect', function () {
    var connectMessage = 'Redis client(s) connected for channel: ' + channelName + "\n";
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

process.on('unhandledRejection', error => {
    var propertySet = { "errorMessage": error.message, "channelId": channelName, "subscriberId": subscriberId };
    client.trackEvent({ name: "unHandledErrorSub", properties: propertySet });
});

var currentMaximum = -1;        // to make initial condition true

sub.on("message", (channel, message) => {
    var messageObject = JSON.parse(message);
    sendMetric(currentMaximum);
    validateMessage(messageObject);
    validateLastMessageSignal(messageObject);
})

function sendMetric(currentMaximum) {
    if (currentMaximum >= 0 && currentMaximum % 100 == 1) {
        var totalReceived = currentMaximum + 1;
        var propertySet = { "currentMaximum": currentMaximum, "MessageReceived": 100, "channelId": channelName, "subscriberId": subscriberId };
        var metrics = { "MessageBatchCount": 100, "totalReceived": totalReceived };
        client.trackEvent({ name: "InProgressSub", properties: propertySet, measurements: metrics });
    }
}
function validateMessage(messageObject) {
    // message should be in order
    if (messageObject.signal != "kill") {
        var actualContent = currentMaximum + 1;
        if (actualContent == messageObject.content) {
            currentMaximum = messageObject.content;
        } else {
            var propertySet = { "errorMessage": "Message is out of order", "currentMaximum": currentMaximum, "content": messageObject, "channelId": channelName, "subscriberId": subscriberId };
            var errorMessage = "Message is out of order.\n" + "Current Maximum:" + currentMaximum + " Message: " + messageObject + "\n";
            client.trackEvent({ name: "messageOrder", properties: propertySet });
            currentMaximum = messageObject.content;     //if a bigger number comes, set currentMaximum to that number so that we can be optimistic of next number to be in order
        }
    }
}

function validateLastMessageSignal(messageObject) {
    if (messageObject.signal == "kill") {
        validateTotalMessage(messageObject.content);
        var messageBatchReceived = (currentMaximum % 100) + 1;
        var propertySet = { "message": "Subscriber finished", "currentMaximum": currentMaximum, "MessageReceived": messageBatchReceived, "channelId": channelName, "subscriberId": subscriberId };
        var metrics = { "MessageBatchCount": messageBatchReceived, "totalReceived": totalReceived };
        client.trackEvent({ name: "subEventCompletion", properties: propertySet, measurements: metrics });
        process.exit();
    }
}

function validateTotalMessage(lastMessageDelivered) {
    var expectedCount = lastMessageDelivered;
    if (expectedCount > currentMaximum) {
        var propertySet = { "errorMessage": "Data Lost", "currentMaximum": currentMaximum, "ExpectedCount": expectedCount, "channelId": channelName, "subscriberId": subscriberId };
        client.trackEvent({ name: "totalDataValidation", properties: propertySet });
    } else if (expectedCount < currentMaximum) {
        var propertySet = { "errorMessage": "Data Duplication", "currentMaximum": currentMaximum, "ExpectedCount": expectedCount, "channelId": channelName, "subscriberId": subscriberId };
        client.trackEvent({ name: "totalDataValidation", properties: propertySet });
    } else {
        var propertySet = { "errorMessage": "null", "currentMaximum": currentMaximum, "ExpectedCount": expectedCount, "channelId": channelName, "subscriberId": subscriberId };
        client.trackEvent({ name: "totalDataValidation", properties: propertySet });
    }
}
