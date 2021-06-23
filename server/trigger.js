const { spawn } = require('child_process');
var os = require("os");
var hostname=os.hostname();
console.log("Pod HostName is " + hostname);
const randomString= Math.random().toString(36).substring(7);
var channelName = hostname +"-" +randomString;
console.log("channel Name: " + channelName)
for (let i = 0; i < 10; i++) {
 const node=spawn('node', ['./server/subscriber.js', channelName, i]);
	node.stdout.on('data', (data) => {
    console.log(`stdout: ${data}`);
});

node.stderr.on('data', (data) => {
  console.error(`stderr: ${data}`);
});

node.on('close', (code) => {
  console.log(`child process exited with code ${code}`);
});
    console.log("subscriber started" + i)
}


setTimeout(startPublisher, 40000);

function startPublisher(){
   const pub= spawn('node', ['./server/publisher.js', channelName]);

     
   
	pub.stdout.on('data', (data) => {
  console.log(`stdout: ${data}`);
});

pub.stderr.on('data', (data) => {
  console.error(`stderr: ${data}`);
});

pub.on('close', (code) => {
  console.log(`child process exited with code ${code}`);
});

	 // time to publish
    console.log("publisher started")
}