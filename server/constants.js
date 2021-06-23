module.exports = Object.freeze({
    NUM_OF_MESSAGES : 5,        // total number of messages published in a single go
    MESSAGE_PUBLISH_INTERVAL : 180,     // Messages publishing interval i.e. every x milliseconds messages will be published to redis
    METRIC_SENT_INTERVAL: 10000,        // ideal to be 1 minute
    MESSAGE_ACCEPTANCE_TIME_WINDOW : 30000  // time window for which we can consider a message received is valid else consider it as lost
});