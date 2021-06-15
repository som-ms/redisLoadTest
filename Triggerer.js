const trigger = require('./publisher')
const messageTracker = {
    i: 0
  }
trigger.publish1("ch1",messageTracker);