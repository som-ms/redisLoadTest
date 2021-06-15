module.exports = Object.freeze({
    NUM_OF_MESSAGES : 5,        // total number of messages published in a single go
    TOTAL_TIME_PUBLISHER : 1*21*1000,    // Test running time(x + y + MESSAGE_PUBLISH_INTERVAL ) README.md
    TOTAL_TIME_SUBSCRIBER: 1*21*1000 + 10,
    MESSAGE_PUBLISH_INTERVAL : 1000,     // Messages publishing interval i.e. every x milliseconds messages will be published to redis
    TOTAL_TIME_PUBLISHER_IN_MINUTE : 20
});