/* global module, require, connection */

var WebSocketServer = require('websocket').server;
var WebSocketClient = require('websocket').client;
http = require('http');

module.exports = {
    master: {
        port: 5005,
        wsServer: null,
        workers: null,
        init: function (allowOriginFunc) {
            var that = this;

            this.workers = new Array();

            var server = http.createServer(function (request, response) {
                //If server http requested, then return same information about your cluster
                console.log((new Date()) + ' Received request for ' + request.url);
                var responseJSON = {
                    port: that.port,
                    worksLength: that.workers.length,
                    workers: {}
                };
                for(i in that.workers){
                    var work = that.workers[i];
                    responseJSON.workers[i] = {addres: work['remoteAddress'], state : work['state'], countTasks: work['countTasks']};
                }
                response.writeHead(200,  { 'Content-Type': 'application/json', "Access-Control-Allow-Origin":"*" });
                response.write(JSON.stringify(responseJSON));
                response.end();
            });
            server.listen(this.port, function () {
                console.log((new Date()) + ' Master is listening on port ' + that.port);
            });

            this.wsServer = new WebSocketServer({
                httpServer: server,
                // You should not use autoAcceptConnections for production
                // applications, as it defeats all standard cross-origin protection
                // facilities built into the protocol and the browser.  You should
                // *always* verify the connection's origin and decide whether or not
                // to accept it.
                autoAcceptConnections: false
            });



            this.wsServer.on('request', function (request) {

                if (!allowOriginFunc(request.origin)) {
                    // Make sure we only accept requests from an allowed origin
                    request.reject();
                    console.log((new Date()) + ' Worker from origin ' + request.origin + ' rejected.');
                    return;
                }

                var connection = request.accept('cluster-protocol', request.origin);
                connection['state'] = "sleeping";
                console.log((new Date()) + ' Worker from ' + connection.remoteAddress + ' is ready.');

                that.workers.push(connection);
                
                connection.sendUTF(JSON.stringify({order: "is_working", param: {}}));
                
                connection.on('message', function (message) {
                    if (message.type === 'utf8') {
                        var wObj = JSON.parse(message.utf8Data);
                        connection['state'] = wObj.status;
                        connection['countTasks'] = wObj.countTasks;
                        console.log((new Date()) + ' Master Received Message: ' + message.utf8Data);
                    }
                });
                
                connection.on('close', function (reasonCode, description) {
                    console.log((new Date()) + ' Worker on ' + connection.remoteAddress + ' disconnected.');
                });

            });
        },
        reloadStates: function(callback){
            for(index in this.workers){
                this.workers[index].sendUTF(JSON.stringify({order: "get", param: {"key": "state"}}));
                if(index == (this.workers.length - 1)){
                    callback();
                }
            }
        },
    },
    worker: {
        state: "sleeping",
        countTasks: 0,
        connection: null,
        init: function (ipMaster, portMaster, task) {
            var that = this;

            var client = new WebSocketClient();

            client.on('connectFailed', function (error) {
                console.log((new Date()) + ' Connect Error: ' + error.toString());
            });

            client.on('connect', function (connection) {
                console.log((new Date()) + ' Worker Connected to Master');
                connection.on('error', function (error) {
                    console.log((new Date()) + " Connection Error: " + error.toString());
                });
                connection.on('close', function () {
                    console.log((new Date()) + ' cluster-protocol Connection Closed');
                });
                connection.on('message', function (message) {
                    if (message.type === 'utf8') {

                        var obj = JSON.parse(message.utf8Data);

                        switch (obj.order) {

                            case "execute":
                                that.state = "working";
                                console.log((new Date()) + " The master ordered to perform the task");
                                task(obj.param);
                                that.countTasks++;
                                break;

                            case "is_working":
                                var response = {
                                    "status": that.state,
                                    "message": (that.state === "working"),
                                    "countTasks": that.countTasks
                                };
                                
                                connection.sendUTF(JSON.stringify(response));
                                break;

                            case "get":
                                var response = {
                                    "status": that.state,
                                    "message": that[obj.param["key"]],
                                    "countTasks": that.countTasks
                                };
                                connection.sendUTF(JSON.stringify(response));
                                break;

                            case "wait":
                                break;

                            default :
                                console.log((new Date()) + " My master ordered '" + obj.order + "' but i am a fool!");
                                break;

                        }

                    }
                });
                
                that.connection = connection;

            });

            client.connect('ws://' + ipMaster + ':' + portMaster + '/', 'cluster-protocol');
            this.state = "waiting";
        },
        notifyEnd: function(){
          this.state = "waiting";  
          this.notify();
        },
        notifyStart: function(){
          this.state = "working"; 
          this.notify();
        },
        notify: function(){
            this.connection.sendUTF(JSON.stringify({state: this.state, countTasks: this.countTasks}));
        }
    }


};