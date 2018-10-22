// This file doesn't go through babel or webpack transformation.
// Make sure the syntax and sources this file requires are compatible with the current node version you are running
// See https://github.com/zeit/next.js/issues/1245 for discussions on Universal Webpack or universal Babel
const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')
const path = require('path')

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev, dir: path.resolve(__dirname, '../client') })
const handle = app.getRequestHandler()

const wssData = require('./wssData')
const wssCursors = require('./wssCursors')

const { terminateOrCheck, createMessage } = require('./utils')
const { createDoc } = require('./shareDb')


app.prepare().then(() => {
    const server = createServer((req, res) => {
        // Be sure to pass `true` as the second argument to `url.parse`.
        // This tells it to parse the query portion of the URL.
        const parsedUrl = parse(req.url, true)
        handle(req, res, parsedUrl)
    })
    console.log('server.js: http server created')

    createDoc(() => {
        server.on('upgrade', (request, socket, head) => {
            const pathname = parse(request.url).pathname
            if (pathname === '/collab/data') {
                wssData.handleUpgrade(request, socket, head, (ws) => {
                    wssData.emit('connection', ws, request)
                    console.log('server.js: connection upgraded for data socket')
                })
            } else if (pathname === '/collab/cursors') {
                wssCursors.handleUpgrade(request, socket, head, (ws) => {
                    wssCursors.emit('connection', ws, request)
                    console.log('server.js: connection upgraded for cursors socket')
                });
            } else {
                socket.destroy()
            }
        })
        console.log('server.js: document created, ready to receive ws connections')
    })

    

    const port = process.env.PORT || 3000
    server.listen(port, err => {
        if (err) throw err
        console.log(`server.js: listening on http://localhost:${port}`)
    })

    setInterval(() => {
        wssData.clients.forEach(terminateOrCheck)
        wssCursors.clients.forEach((client) => {
            if (!client.isAlive && client.userId) {
                delete wssCursors.users[client.userId]
                delete wssCursors.cursors[client.userId]
                console.log('server.js: client deleted')
                wsCursors.clients.forEach((otherClient) => {
                    if (otherClient !== client) {
                        otherClient.send(createMessage('delete-user', { userId: client.userId }))
                        otherClient.send(createMessage('delete-cursor', { userId: client.userId }))
                        console.log('server.js: other client notified of client deletion')
                    }
                })
            }
            terminateOrCheck(client)
        })
    }, 10000)
})


