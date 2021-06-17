const { spawn } = require('child_process');

const channelName = Math.random().toString(36).substring(7);
console.log("channel Name: " + channelName)
for (let i = 0; i < 10; i++) {
    spawn('node', ['./server/subscriber.js', channelName, i]);
    console.log("subscriber started" + i)
}


setTimeout(startPublisher, 20000);

function startPublisher(){
    spawn('node', ['./server/publisher.js', channelName, 30]);  // time to publish
    console.log("publisher started")
}