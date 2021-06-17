const Redis = require('ioredis');
var constants = require('./constants');
var Message = require('./Message');
var fs = require('fs');
var myargs = process.argv.slice(2);     // channelName, subscriberId
var channelName = myargs[0];
var subscriberId = myargs[1];
const { port, pwd, appInsightKey } = require('./config');

const appInsights = require('applicationinsights');
appInsights.setup(appInsightKey).start();
appInsights.defaultClient.context.tags[appInsights.defaultClient.context.keys.cloudRole] = "Role1";
var client = appInsights.defaultClient;
var parentPath = "/tmp/sub/";
var logFile = parentPath + channelName + "_" + subscriberId + "_log.txt";
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

    fs.appendFileSync(logFile, "redisSubConnMsg\n");
    fs.appendFileSync(logFile,JSON.stringify(propertySet));
    fs.appendFileSync(logFile,"\n");
    executeAfterReady();
});

sub.on('connect', function () {
    var propertySet = { "errorMessage": "null", "descriptiveMessage": "Redis Connection established", "channelId": channelName, "subscriberId": subscriberId };
    client.trackEvent({ name: "redisSubConnMsg", properties: propertySet });

    fs.appendFileSync(logFile, "redisSubConnMsg\n");
    fs.appendFileSync(logFile,JSON.stringify(propertySet));
    fs.appendFileSync(logFile,"\n");
})

sub.on("error", (err) => {
    var propertySet = { "errorMessage": "Something went wrong connecting redis", "descriptiveMessage": err.message, "channelId": channelName, "subscriberId": subscriberId };
    client.trackEvent({ name: "redisSubConnError", properties: propertySet });

    fs.appendFileSync(logFile, "redisSubConnError\n");
    fs.appendFileSync(logFile,JSON.stringify(propertySet));
    fs.appendFileSync(logFile,"\n");
})

function executeAfterReady() {
    sub.subscribe(channelName, (err, count) => {
        if (err) {
            var propertySet = { "errorMessage": "couldn't subscribe to channel", "descriptiveMessage": err.message, "channelId": channelName };
            client.trackEvent({ name: "redisSubConnError", properties: propertySet });

            fs.appendFileSync(logFile, "redisSubConnError\n");
            fs.appendFileSync(logFile,JSON.stringify(propertySet));
            fs.appendFileSync(logFile,"\n");
        } else {
            var propertySet = { "errorMessage": "null", "descriptiveMessage": "subscribed to channel", "channelId": channelName, "subscriberId": subscriberId };
            client.trackEvent({ name: "redisSubConn", properties: propertySet });

            fs.appendFileSync(logFile, "redisSubConn\n");
            fs.appendFileSync(logFile,JSON.stringify(propertySet));
            fs.appendFileSync(logFile,"\n");
        }
    });
}

process.on('unhandledRejection', error => {
    var propertySet = { "errorMessage": error.message, "channelId": channelName, "subscriberId": subscriberId };
    client.trackEvent({ name: "unHandledErrorSub", properties: propertySet });

    fs.appendFileSync(logFile, "unHandledErrorSub\n");
    fs.appendFileSync(logFile,JSON.stringify(propertySet));
    fs.appendFileSync(logFile,"\n");
});

var currentMaximum = -1;        // to make initial condition true
var totalMessageReceived = 0;   // count of total messages received

sub.on("message", (channel, message) => {
    var messageObject = JSON.parse(message);
    validateLastMessageSignal(messageObject);   // if last message, exit
    totalMessageReceived++;                         // else increase totalMessageReceived count
    sendMetric(currentMaximum, totalMessageReceived);
    validateMessageOrder(messageObject);
   
})

function sendMetric(currentMaximum, totalMessageReceived) {
    if (totalMessageReceived % 100 == 0) {
        currentMaximum++;
        var propertySet = { "currentMaximum": currentMaximum, "MessageBatchReceived": 100, "totalMessageReceived": totalMessageReceived, "channelId": channelName, "subscriberId": subscriberId };
        var metrics = { "MessageBatchReceived": 100, "totalMessageReceived": totalMessageReceived };
        client.trackEvent({ name: "InProgressSub", properties: propertySet, measurements: metrics });

        fs.appendFileSync(logFile, "InProgressSub\n");
        fs.appendFileSync(logFile,JSON.stringify(propertySet));
        fs.appendFileSync(logFile,"\n");
        fs.appendFileSync(logFile,JSON.stringify(metrics));
        fs.appendFileSync(logFile,"\n");
    }
}
function validateMessageOrder(messageObject) {
    // message should be in order
        var outOfOrder = false;
        var messageReceived = messageObject.content;
        var propertySet;
        // if message received is smaller than currentMaximum - OUT OF ORDER  ( current maximum won't be changed)
        // if message received and currentMaximum has diff greater than 1 - OUT OF ORDER (currentMaximum = message.content)
        if(messageReceived < currentMaximum){
            outOfOrder = true;
            propertySet = { "errorMessage": "Message is out of order", "currentMaximum": currentMaximum, "expectedNextInOrder": currentMaximum+1,"totalMessageReceived": totalMessageReceived,"content": messageObject, "channelId": channelName, "subscriberId": subscriberId };
        } else if(Math.abs(messageReceived-currentMaximum) > 1){
            outOfOrder = true;
            propertySet = { "errorMessage": "Message is out of order", "currentMaximum": currentMaximum, "expectedNextInOrder": currentMaximum+1,"totalMessageReceived": totalMessageReceived, "content": messageObject, "channelId": channelName, "subscriberId": subscriberId };
            currentMaximum = messageReceived;
        }

        if(outOfOrder){
            client.trackEvent({ name: "messageOrder", properties: propertySet });
            fs.appendFileSync(logFile, "messageOrder\n");
            fs.appendFileSync(logFile,JSON.stringify(propertySet));
            fs.appendFileSync(logFile,"\n");
        }else {
            currentMaximum = messageReceived;
        }

}

function validateLastMessageSignal(messageObject) {
    if (messageObject.signal == "kill") {
        validateTotalMessage(messageObject.content);
        var messageBatchReceived = totalMessageReceived % 100;
        var propertySet = { "message": "Subscriber finished", "currentMaximum": currentMaximum, "MessageBatchReceived": messageBatchReceived, "totalMessageReceived": totalMessageReceived, "channelId": channelName, "subscriberId": subscriberId };
        var metrics = { "MessageBatchReceived": messageBatchReceived, "totalMessageReceived": totalMessageReceived };
        client.trackEvent({ name: "subEventCompletion", properties: propertySet, measurements: metrics });

        fs.appendFileSync(logFile, "subEventCompletion\n");
        fs.appendFileSync(logFile,JSON.stringify(propertySet));
        fs.appendFileSync(logFile,"\n");
        fs.appendFileSync(logFile,JSON.stringify(metrics));
        fs.appendFileSync(logFile,"\n");
        process.exit();
    }
}

function validateTotalMessage(expectedCount) {
    if (expectedCount > totalMessageReceived) {
        var propertySet = { "errorMessage": "Data Lost", "currentMaximum": currentMaximum, "ExpectedCount": expectedCount, "totalMessageReceived": totalMessageReceived, "channelId": channelName, "subscriberId": subscriberId };
        client.trackEvent({ name: "totalDataValidation", properties: propertySet });

        fs.appendFileSync(logFile, "totalDataValidation\n");
        fs.appendFileSync(logFile,JSON.stringify(propertySet));
        fs.appendFileSync(logFile,"\n");
    } else if (expectedCount < totalMessageReceived) {
        var propertySet = { "errorMessage": "Data Duplication", "currentMaximum": currentMaximum, "ExpectedCount": expectedCount, "totalMessageReceived": totalMessageReceived, "channelId": channelName, "subscriberId": subscriberId };
        client.trackEvent({ name: "totalDataValidation", properties: propertySet });

        fs.appendFileSync(logFile, "totalDataValidation\n");
        fs.appendFileSync(logFile,JSON.stringify(propertySet));
        fs.appendFileSync(logFile,"\n");
    } else {
        var propertySet = { "errorMessage": "null", "currentMaximum": currentMaximum, "ExpectedCount": expectedCount, "totalMessageReceived": totalMessageReceived, "channelId": channelName, "subscriberId": subscriberId };
        client.trackEvent({ name: "totalDataValidation", properties: propertySet });

        fs.appendFileSync(logFile, "totalDataValidation\n");
        fs.appendFileSync(logFile,JSON.stringify(propertySet));
        fs.appendFileSync(logFile,"\n");
    }
}
