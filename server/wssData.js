var WebSocket = require('ws');
var WebSocketJSONStream = require('websocket-json-stream');
const { backend } = require('./shareDb')

var wssData = new WebSocket.Server({ noServer: true });

wssData.on('connection', function (client) {
    console.log('wssData.js: client connected, total clients', wssData.clients.size)

    client.isAlive = true
    client.on('pong', () => { 
        client.isAlive = true; 
        console.log('wssData.js: client pong, set isAlive=true') 
    })

    var stream = new WebSocketJSONStream(client)
    backend.listen(stream);

    client.on('close', () => {
        console.log('wssData.js: client close')
    })
});

module.exports = wssData
