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
const {port,pwd,appInsightKey} = require('./config');
appInsights.setup(appInsightKey).start();
var client = appInsights.defaultClient;


const nodes = [
  {
    port: port,
    host: "fluidloadtest.redis.cache.windows.net"
  }
]


const publisher = new Redis.Cluster(
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

publisher.on('connect', function () {
  var connectMessage = 'Redis client(p) connected for channel: ' + channelName;
  // console.log(connectMessage);
  var propertySet = { "errorMessage": "null", "descriptiveMessage": "Redis Connection established", "channelId": channelName };
  client.trackEvent({ name: "redisPubConnMsg", properties: propertySet });
})

// publisher.on('ready', function(){
//   console.log("ready")
// })

publisher.on('error', (err) => {
  var connectFailMessage = 'Something went wrong with redis connection channel: ' + channelName + "\n";
  // console.log(connectFailMessage);
  // client.trackEvent({name: "redisPubConnError", value: connectFailMessage});
  var propertySet = { "errorMessage": "Something went wrong connecting redis", "descriptiveMessage": err.message, "channelId": channelName };
  client.trackEvent({ name: "redisPubConnError", properties: propertySet });
})

process.on('unhandledRejection', error => {
  var propertySet = { "errorMessage": error.message, "channelId": channelName };
  client.trackEvent({ name: "unHandledErrorPub", properties: propertySet });
});

function publishMessage(channelName) {
  var currentMessagePointer = 0;
  while (currentMessagePointer < constants.NUM_OF_MESSAGES) {   // total number of messages published at a single time
    var currentMessage = totalMessagesSent + currentMessagePointer;
    var messageObj = new Message(channelName, currentMessage, "leave");
    // publishData(channelName,messageObj);
    // try {
      publisher.publish(channelName, JSON.stringify(messageObj));
    // } catch (err) {
    //   new Promise((_, reject) => reject(new Error('woops'))).
    //     catch(error => { console.log('caught', error.message); });
    // }
    //fs.appendFileSync(parentPath + channelName + "_data.txt", JSON.stringify(messageObj) + "\n")
    //console.log("message sent: " + JSON.stringify(messageObj));
    currentMessagePointer++;
  }
  totalMessagesSent += currentMessagePointer;
  sendMetric(totalMessagesSent);
}

function sendMetric(totalMessagesSent) {
  if (totalMessagesSent % 100 == 0) {
    var propertySet = { "channelId": channelName };
    var metrics = { "MessagesCount": totalMessagesSent };
    client.trackEvent({ name: "InProgressPub", properties: propertySet, measurements: metrics });
  }
}


setTimeout(executeAfterDelay, 40000);

function executeAfterDelay(){
  const t = setInterval(publishMessage, constants.MESSAGE_PUBLISH_INTERVAL, channelName)

  setTimeout(function () {
    // fs.appendFileSync(parentPath + channelName + "_data.txt", "Publisher finished publishing messages\n");
    // publishData(channelName,new Message(channelName,(totalMessagesSent-1),"true"));
    publisher.publish(channelName, JSON.stringify(new Message(channelName, (totalMessagesSent - 1), "kill")));  // send signal to subscriber to finish
    // send completion event
    var remainingMessages = totalMessagesSent % 100;
    // console.log(remainingMessages)
    var propertySet = { "channelId": channelName };
    var metrics = { "MessagesCount": remainingMessages };
    client.trackEvent({ name: "InProgressPub", properties: propertySet, measurements: metrics });
    client.trackEvent({ name: "pubEventCompletion", properties: propertySet });
    clearInterval(t);
    var exitTime = constants.TOTAL_TIME_PUBLISHER*2;
    setTimeout(exitProcess,exitTime)
  }, constants.TOTAL_TIME_PUBLISHER)
}


function exitProcess(){
  process.exit()
}


