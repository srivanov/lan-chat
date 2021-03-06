var zmq = require('zmq');
var ip = require('ip');
var config = require('../../config/default.json');
var routerPort = process.env.ROUTER_PORT || config['router-port'];
var pubPort = process.env.PUB_PORT || config['pub-port'];

module.exports = Messenger;

function Messenger() {
    var self = this;
    var address = 'tcp://' + ip.address();
    var subnet = address.split('.').splice(0, 3).join('.');
    var pub = zmq.socket('pub');
    var router = zmq.socket('router');

    var peers = {};

    self.start = function(cb) {
        router.bindSync(address + ':' + routerPort);
        console.log('router started on: ' + address + ':' +  routerPort);
        router.on('message', function(envelope, data) {
            data = JSON.parse(data.toString('utf8'));
            if (data.type === 'pub-request') {
                console.log('pub-request received');
                self.subscribe(data.ip, data.port);
            }

            if (data.type === 'sub-request') {
                router.send([
                    envelope,
                    JSON.stringify({port: pubPort, ip: address})
                ]);
                console.log('sub-request received');
                // tell the guy what are my ip and port for pub sub
            }
        });

        pub.bind(address + ':' + pubPort, function(err) {
            if (err) {
                console.log('ERROR:[pub] ' + err);
                process.exit(0);
            }

            cb();
        });

    };

    self.send = function(message) {
        pub.send(message);
    };

    self.scan = function() {
        for (var i = 1; i < 255; i++) {
            if (i === parseInt(address.split('.')[3]) &&
                    !process.env.TARGET_ROUTER_PORT) {
                continue;
            }
            var targetAddress = subnet + '.' + i + ':' +
                (process.env.TARGET_ROUTER_PORT || routerPort);
            // console.log('target: ', targetAddress);
            attempt(targetAddress);
        }

        function attempt(uri) {
            var dealer = zmq.socket('dealer');

            dealer.connect(uri);

            // console.log('BINGO: ', uri);
            dealer.send(JSON.stringify({type: 'pub-request',
                                            port: pubPort, ip: address}));
            dealer.send(JSON.stringify({type: 'sub-request'}));

            dealer.on('message', function(data) {
                // sub to given data.ip + data.port
                data = JSON.parse(data);
                console.log('I should sub this too: ', data.ip, data.port);
            });

        }
    };

    self.subscribe = function(ip, port) {
        var peerId = ip + ':' + port;

        if (!peers[peerId]) {
            var sub = zmq.socket('sub');
            sub.connect(peerId);
            sub.subscribe('');
            sub.on('message', self.print);
            peers[peerId] = sub;
        } else {
            // already had subscribed to this one
        }
    };

    self.print = function(text) {
        console.log(text.toString('utf8'));
    };
}
