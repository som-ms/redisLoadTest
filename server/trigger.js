const { spawn } = require('child_process');

const channelName = Math.random().toString(36).substring(7);
console.log("channel Name: " + channelName)
for (let i = 0; i < 10; i++) {
    spawn('node', ['./subscriber.js', channelName, i]);
    //console.log("subscriber started" + i)
}


setTimeout(startPublisher, 20000);

function startPublisher(){
    spawn('node', ['./publisher.js', channelName, 35]);  // time to publish
    //console.log("publisher started")
}