const express = require('express');
const Redis = require('ioredis');
const fs = require('fs');
var constants = require('./constants');
var assert = require('assert');
var Message = require('./Message')
const { AssertionError } = require('assert');
var myargs = process.argv.slice(2);     // channelName, subscriberId
var channelName = myargs[0];
var subscriberId = myargs[1];
const {port,pwd,appInsightKey} = require('./config');

const appInsights = require('applicationinsights');
appInsights.setup(appInsightKey).start();
appInsights.defaultClient.context.tags[appInsights.defaultClient.context.keys.cloudRole] = "Role1";
var logFile = channelName + "_" + subscriberId + "_log.txt";
var dataFile = channelName + "_" + subscriberId + "_data.txt";
var parentPath = '/tmp/sub/';

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


sub.on('connect', function () {
    var connectMessage = 'Redis client(s) connected for channel: ' + channelName + "\n";
    // console.log("connect")
    var propertySet = { "errorMessage": "null", "descriptiveMessage": "Redis Connection established", "channelId": channelName, "subscriberId": subscriberId };
    client.trackEvent({ name: "redisSubConnMsg", properties: propertySet });
    // writeToFile(parentPath + dataFile, connectMessage)
})
sub.on("error", (err) => {
    var propertySet = { "errorMessage": "Something went wrong connecting redis", "descriptiveMessage": err.message, "channelId": channelName, "subscriberId": subscriberId };
    client.trackEvent({ name: "redisSubConnError", properties: propertySet });
})

// sub.on('ready', function(){
//     console.log("readY")
// });

function executeAfterDelay(){
    sub.subscribe(channelName, (err,count) =>{
        if(err){
            var propertySet = {"errorMessage" : "couldn't subscribe to channel" , "descriptiveMessage" : err.message, "channelId": channelName};
            client.trackEvent({name: "redisSubConnError", properties: propertySet});
            // console.error("Failed to subscribe to channel " + channelName);
            // console.log(err.message);
        } else {
            // console.log("Subscribed successfully to channel " + count);
            var propertySet = {"errorMessage" : "null" , "descriptiveMessage" : "subscribed to channel", "channelId": channelName};
            client.trackEvent({name: "redisSubConn", properties: propertySet});
        }
    });
}

setTimeout(executeAfterDelay, 30000);


process.on('unhandledRejection', error => {
    var propertySet = {"errorMessage" : error.message, "channelId": channelName, "subscriberId":subscriberId};
    client.trackEvent({name: "unHandledErrorSub", properties: propertySet});
});

var currentMaximum = -1;        // to make initial condition true

sub.on("message", (channel, message) => {
    var messageObject = JSON.parse(message);
    sendMetric(currentMaximum);
    validateLastMessageSignal(messageObject);
    // writeToFile(parentPath + dataFile, message + "\n");
    validateMessage(messageObject);

})

function sendMetric(currentMaximum) {
    if (currentMaximum >= 0 && currentMaximum % 100 == 1) {
        var messageReceived = 100;
        var propertySet = { "currentMaximum": currentMaximum, "MessageReceived": messageReceived, "channelId": channelName, "subscriberId": subscriberId };
        var metrics = { "MessagesCount": messageReceived };
        client.trackEvent({ name: "InProgressSub", properties: propertySet, measurements: metrics });
    }
}
function validateLastMessageSignal(messageObject) {
    // console.log("signal: " + messageObject.signal);
    if (messageObject.signal == "kill") {
        // console.log(messageObject)
        validateTotalMessage(messageObject.content);
        var propertySet = { "message":"Subscriber finished","currentMaximum": currentMaximum, "MessageReceived": messageObject, "channelId": channelName, "subscriberId": subscriberId };
        client.trackEvent({name: "subEventCompletion", properties: propertySet});
        // writeToFile(parentPath + dataFile, "Subscriber finished listening\n")
        process.exit();
    }
}
function writeToFile(path, message) {
    fs.appendFileSync(path, message);
}
function validateMessage(messageObject) {
    // message should be in order

    var actualContent = currentMaximum + 1;
    if (actualContent == messageObject.content) {
        currentMaximum = messageObject.content;
    } else {
        var propertySet = { "errorMessage": "Message is out of order", "currentMaximum": currentMaximum, "content": messageObject, "channelId": channelName, "subscriberId": subscriberId };
        var errorMessage = "Message is out of order.\n" + "Current Maximum:" + currentMaximum + " Message: " + messageObject + "\n";
        client.trackEvent({ name: "messageOrder", properties: propertySet });
        // writeToFile(parentPath + logFile, errorMessage);
        currentMaximum = messageObject.content;     //so that difference with the next number must be 1
    }

}

function validateTotalMessage(lastMessageDelivered) {
    var expectedCount = lastMessageDelivered;
    // console.log("expectedCount: " + expectedCount)
    // console.log("currentMaximum : " + currentMaximum)
    if (expectedCount > currentMaximum) {
        var propertySet = { "errorMessage": "Data Lost", "currentMaximum": currentMaximum, "ExpectedCount": expectedCount, "channelId": channelName, "subscriberId": subscriberId };
        // var dataLostMessage = "Data lost..!!\n" + "Expected count: " + expectedCount + " Actual count: " + currentMaximum + "\n";
        client.trackEvent({ name: "totalDataValidation", properties: propertySet });
        // writeToFile(parentPath + logFile, "Data lost..!!\n" + "Expected count: " + expectedCount + " Actual count: " + currentMaximum + "\n");
    } else if (expectedCount < currentMaximum) {
        var propertySet = { "errorMessage": "Data Duplication", "currentMaximum": currentMaximum, "ExpectedCount": expectedCount, "channelId": channelName, "subscriberId": subscriberId };
        // var dataDuplicationMessage = "Data duplication..!!\n" + "Expected count: " + expectedCount + " Actual count: " + currentMaximum + "\n";
        client.trackEvent({ name: "totalDataValidation", properties: propertySet });
        // writeToFile(parentPath + logFile, "Data duplication..!!\n" + "Expected count: " + expectedCount + " Actual count: " + currentMaximum + "\n");
    } else {
        var propertySet = { "errorMessage": "null", "currentMaximum": currentMaximum, "ExpectedCount": expectedCount, "channelId": channelName, "subscriberId": subscriberId };
        var dataSuccessMessage = "No data lost for subscriber: " + subscriberId;
        client.trackEvent({ name: "totalDataValidation", properties: propertySet });
        // writeToFile(parentPath + dataFile, "Subscriber finished receiving\n");
    }
}
