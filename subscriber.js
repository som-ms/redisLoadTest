const express = require('express');
const redis = require('redis')
const fs = require('fs');
var constants = require('./constants');
var assert = require('assert');
var Message = require('./Message')
const createCSVWriter = require('csv-writer').createObjectCsvWriter;
const { AssertionError } = require('assert');
var myargs = process.argv.slice(2);
console.log('myargs', myargs);  // channelName, subscriberId
var channelName = myargs[0];
var subscriberId = myargs[1];

var logFile = channelName + "_" + subscriberId + "_log.txt";
var dataFile = channelName + "_" + subscriberId + "_data.txt";
var parentPath = '/tmp/sub/';

// const sub = redis.createClient(
//     {
//         host: 'fluidloadtest.redis.cache.windows.net',
//         port: 6380
//     }
// )

const sub = redis.createClient(6380, 'fluidloadtest.redis.cache.windows.net',
  {auth_pass: '2AOl81CmEZOOWC9HRvSaCUGRUgggg06CFRM8cLs1hJs=', tls: {servername: 'fluidloadtest.redis.cache.windows.net'}});

sub.on('connect', function () {
    var connectMessage = 'Redis client(s) connected for channel: ' + channelName + "\n";
    // console.log(connectMessage)
    writeToFile(parentPath + dataFile, connectMessage)
})

sub.on('error', function () {
    var connectFailMessage = 'Something went wrong with redis connection channel: ' + channelName + " and subscriberId: " + subscriberId + "\n";
    console.log(connectFailMessage);
})

var currentMaximum = -1;        // to make initial condition true
sub.subscribe(channelName)
sub.on("message", (channel, message) => {
    var messageObject = JSON.parse(message);
    //console.log(JSON.stringify(messageObject))

    writeToFile(parentPath + dataFile, message + "\n");

    validateMessage(message);

})

function writeToFile(path, message) {
    fs.appendFileSync(path, message);
}
function validateMessage(message) {
    // message should be in order
    try {
        var messageObject = JSON.parse(message);
        if (currentMaximum < messageObject.content) {
            currentMaximum = messageObject.content;
        } else {
            var errorMessage = "Message is out of order.\n" + "Current Maximum:" + currentMaximum + " Message: " + message + "\n";
            writeToFile(parentPath + logFile, errorMessage);
            currentMaximum = messageObject.content;     //so that difference with the next number must be 1
        }
        //console.log("currentMaximum is: " + currentMaximum)

    } catch (err) {
        console.log(err);
    }
}

function validateTotalMessage() {
    var expectedCount = (constants.NUM_OF_MESSAGES * constants.TOTAL_TIME_PUBLISHER_IN_MINUTE) - 1;         // starting from index 0
    //console.log("expectedCount: " + expectedCount)
    //console.log("currentMaximum : " + currentMaximum)
    if (expectedCount > currentMaximum) {
        writeToFile(parentPath + logFile, "Data lost..!!\n" + "Expected count: " + expectedCount + " Actual count: " + currentMaximum + "\n");
    } else if (expectedCount < currentMaximum) {
        writeToFile(parentPath + logFile, "Data duplication..!!\n" + "Expected count: " + expectedCount + " Actual count: " + currentMaximum + "\n");
    } else {
        writeToFile(parentPath + dataFile, "Subscriber finished receiving");
    }
}

setTimeout(function () {
    console.log("Subscriber finished\n")
    validateTotalMessage();
}, 30000);