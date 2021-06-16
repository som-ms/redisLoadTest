const express = require('express');
const Redis = require('ioredis');
const fs = require('fs')
var constants = require('./constants');
var Message = require('./Message')
var myargs = process.argv.slice(2);   // channelName
var channelName = myargs[0];
var totalMessagesSent = 0;
var parentPath = '/tmp/pub/';
const appInsights = require('applicationinsights');
appInsights.setup('e500e906-a83a-4cc2-af5f-fbe3d4b4fcd8').start();
var client = appInsights.defaultClient;

// const publisher = redis.createClient(6380, 'fluidloadtest.redis.cache.windows.net',
//   { auth_pass: '2AOl81CmEZOOWC9HRvSaCUGRUgggg06CFRM8cLs1hJs=', tls: { servername: 'fluidloadtest.redis.cache.windows.net' } });

  const publisher = new Redis({
    port: 6380,
    host: "fluidloadtest.redis.cache.windows.net",
    family: 4,
    password: "2AOl81CmEZOOWC9HRvSaCUGRUgggg06CFRM8cLs1hJs=",
    connectTimeout: 20000,
    tls:{
      servername: "fluidloadtest.redis.cache.windows.net"
    }
});

publisher.on('connect', function () {
  var connectMessage = 'Redis client(p) connected for channel: ' + channelName;
  console.log(connectMessage);
  client.trackEvent("redisPubConMsg", connectMessage);
})

publisher.on('error', function () {
  var connectFailMessage = 'Something went wrong with redis connection channel: ' + channelName + "\n";
  client.trackEvent({name: "redisPubConnError", value: connectFailMessage});
})

function publishMessage(channelName) {
  var currentMessagePointer = 0;
  while (currentMessagePointer < constants.NUM_OF_MESSAGES) {   // total number of messages published at a single time
    var currentMessage = totalMessagesSent + currentMessagePointer;
    var messageObj = new Message(channelName, currentMessage,"false");
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
  publisher.publish(channelName, JSON.stringify(new Message(channelName,(totalMessagesSent-1),"true")));  // send signal to subscriber to finish
  process.exit();
}, constants.TOTAL_TIME_PUBLISHER);
