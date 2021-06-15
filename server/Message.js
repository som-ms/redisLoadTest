function Message(channel,content){
        this.channel = channel;
        this.content = content;

        function getContent(){
            return this.content;
        }
}


module.exports = Message;