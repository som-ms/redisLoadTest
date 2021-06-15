All the subscribers will be started before any publisher.
After that publishers will be started one by one.
As soon as publisher starts, it will start sending messages.
Let total time to start all publishers = x  (need to be verified for the first time, apprx)
    then total time to run this exercise will be x + y, where y will be time when 9000(say) connections are active to a single redis server
After total duration of test, publishers processes will exit but subscribers will still be running, can kill those manually