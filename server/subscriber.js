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


const appInsights = require('applicationinsights');
appInsights.setup('e500e906-a83a-4cc2-af5f-fbe3d4b4fcd8').start();
appInsights.defaultClient.context.tags[appInsights.defaultClient.context.keys.cloudRole] = "Role1";
var logFile = channelName + "_" + subscriberId + "_log.txt";
var dataFile = channelName + "_" + subscriberId + "_data.txt";
var parentPath = '/tmp/sub/';

var client = appInsights.defaultClient;
// var context = appInsights.getCorrelationContext();

// const sub = redis.createClient(6380, 'fluidloadtest.redis.cache.windows.net',
//   {auth_pass: '2AOl81CmEZOOWC9HRvSaCUGRUgggg06CFRM8cLs1hJs=', tls: {servername: 'fluidloadtest.redis.cache.windows.net'}});
const sub = new Redis({
    port: 6380,
    host: "fluidloadtest.redis.cache.windows.net",
    family: 4,
    password: "2AOl81CmEZOOWC9HRvSaCUGRUgggg06CFRM8cLs1hJs=",
    connectTimeout: 20000,
    tls:{
        servername: "fluidloadtest.redis.cache.windows.net"
      }
});
sub.on('connect', function () {
    var connectMessage = 'Redis client(s) connected for channel: ' + channelName + "\n";
    console.log(connectMessage)
    client.trackEvent("redisSubConMsg", connectMessage);
    writeToFile(parentPath + dataFile, connectMessage)
})

sub.on('error', function () {
    var connectFailMessage = 'Something went wrong with redis connection channel: ' + channelName + " and subscriberId: " + subscriberId + "\n";
    // console.log(connectFailMessage);
    client.trackEvent({name: "redisSubConnError", value: connectFailMessage});
})

var currentMaximum = -1;        // to make initial condition true
sub.subscribe(channelName)
sub.on("message", (channel, message) => {
    var messageObject = JSON.parse(message);
    //console.log(JSON.stringify(messageObject))
    validateLastMessageSignal(messageObject);
    writeToFile(parentPath + dataFile, message + "\n");

    validateMessage(message);

})

function validateLastMessageSignal(messageObject){
    if(messageObject.signal == "true"){
        validateTotalMessage(messageObject.content);
        writeToFile(parentPath+dataFile, "Subscriber finished listening\n")
        process.exit();
    }
}
function writeToFile(path, message) {
    fs.appendFileSync(path, message);
}
function validateMessage(message) {
    // message should be in order
    try {
        var messageObject = JSON.parse(message);
        var actualContent = currentMaximum + 1;
        if (actualContent == messageObject.content ) {
            currentMaximum = messageObject.content;
        } else {
            var errorMessage = "Message is out of order.\n" + "Current Maximum:" + currentMaximum + " Message: " + message + "\n";
            client.trackEvent({name: "messageOrder", value: errorMessage});
            writeToFile(parentPath + logFile, errorMessage);
            currentMaximum = messageObject.content;     //so that difference with the next number must be 1
        }
        //console.log("currentMaximum is: " + currentMaximum)

    } catch (err) {
        console.log(err);
        client.trackEvent({name: "validationError", value: err});
    }
}

function validateTotalMessage(lastMessageDelivered) {
    var expectedCount = lastMessageDelivered;
    console.log("expectedCount: " + expectedCount)
    console.log("currentMaximum : " + currentMaximum)
    if (expectedCount > currentMaximum) {
        var dataLostMessage = "Data lost..!!\n" + "Expected count: " + expectedCount + " Actual count: " + currentMaximum + "\n";
        client.trackEvent({name: "totalDataValidation", value: dataLostMessage});
        writeToFile(parentPath + logFile, "Data lost..!!\n" + "Expected count: " + expectedCount + " Actual count: " + currentMaximum + "\n");
    } else if (expectedCount < currentMaximum) {
        var dataDuplicationMessage = "Data duplication..!!\n" + "Expected count: " + expectedCount + " Actual count: " + currentMaximum + "\n";
        client.trackEvent({name: "totalDataValidation", value: dataDuplicationMessage});
        writeToFile(parentPath + logFile, "Data duplication..!!\n" + "Expected count: " + expectedCount + " Actual count: " + currentMaximum + "\n");
    } else {
        var dataSuccessMessage = "No data lost for subscriber: " + subscriberId;
        client.trackEvent({name: "totalDataValidation", value: dataSuccessMessage});
        writeToFile(parentPath + dataFile, "Subscriber finished receiving\n");
    }
}
