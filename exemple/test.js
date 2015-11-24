/* global require, __dirname, that, i */
master = require(__dirname + "/main.js").master;

master.init(function () {
    return true;
});



var exec = require('child_process').exec;
var cmd = '/home/ricardo/NetBeansProjects/Ant3d-Optimizer/a.out "{\"teste\":2}"';



worker1 = require(__dirname + "/main.js").worker;
worker1.init("172.30.8.48", 5005, function () {
    worker1.notifyStart();
    var execFile = require('child_process').execFile;
    execFile("/home/ricardo/NetBeansProjects/Ant3d-Optimizer/a.out", ["{\"teste\":2}"], [], function (error, stdout, stderr) {
        // command output is in stdout
        console.log(stdout);
        worker1.notifyEnd();
    });
});


setInterval(function () {
    master.reloadStates(function () {

        for (i in master.workers) {
            if (master.workers[i].state === "waiting") {
                master.workers[i].sendUTF(JSON.stringify({order: "execute", param: {}}));
                break;
            }
        }

    });

}, 3000);
