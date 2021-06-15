const express = require('express');
const redis = require('redis');
const fs = require('fs')
var constants = require('./constants');
var Message = require('./Message')
var myargs = process.argv.slice(2);   // channelName
var channelName = myargs[0];
var totalMessagesSent = 0;
var parentPath = '/tmp/pub/';

// const publisher = redis.createClient(
//   {
//     host: 'fluidloadtest.redis.cache.windows.net',
//     port: 6380
//   }
// )

const publisher = redis.createClient(6380, 'fluidloadtest.redis.cache.windows.net',
  {auth_pass: '2AOl81CmEZOOWC9HRvSaCUGRUgggg06CFRM8cLs1hJs=', tls: {servername: 'fluidloadtest.redis.cache.windows.net'}});

publisher.on('connect', function () {
  console.log('Redis client(p) connected for channel: ' + channelName);
})

publisher.on('error', function () {
  console.log('Something went wrong' + err);
})

function publishMessage(channelName) {
  var currentMessagePointer = 0;
  while (currentMessagePointer < constants.NUM_OF_MESSAGES) {   // total number of messages published at a single time
    var currentMessage = totalMessagesSent + currentMessagePointer;
    var messageObj = new Message(channelName, currentMessage);
    publisher.publish(channelName, JSON.stringify(messageObj));
    fs.appendFileSync(parentPath + channelName + "_data.txt", JSON.stringify(messageObj) + "\n")
    //console.log("message sent: " + JSON.stringify(messageObj));
    currentMessagePointer++;
  }
  totalMessagesSent += currentMessagePointer;
}


const t = setInterval(publishMessage, constants.MESSAGE_PUBLISH_INTERVAL, channelName)

setTimeout(function () {
  fs.appendFileSync(parentPath + channelName + "_data.txt", "Publisher finished publishing messages\n");
  clearInterval(t);
}, constants.TOTAL_TIME_PUBLISHER);
