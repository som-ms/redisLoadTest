module.exports = Object.freeze({
    NUM_OF_MESSAGES : 5,        // total number of messages published in a single go
    TOTAL_TIME_PUBLISHER : 2*60*1000,    // Duration for which messages will be published ( please include buffer time to start publisher sending message(1 minute))
    MESSAGE_PUBLISH_INTERVAL : 1000     // Messages publishing interval i.e. every x milliseconds messages will be published to redis
});