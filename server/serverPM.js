// This file doesn't go through babel or webpack transformation.
// Make sure the syntax and sources this file requires are compatible with the current node version you are running
// See https://github.com/zeit/next.js/issues/1245 for discussions on Universal Webpack or universal Babel
const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')
const path = require('path')
const { Step } = require("prosemirror-transform")

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev, dir: path.resolve(__dirname, '../client') })
const handle = app.getRequestHandler()

var WebSocket = require('ws');
var wssData = new WebSocket.Server({ noServer: true });

const schema = require('../universal/schema')

const getConfig = require('next/config').default
const { serverRuntimeConfig } = getConfig()

console.log('firebase key', serverRuntimeConfig.FIREBASE_KEY)

const serviceAccount = JSON.parse(serverRuntimeConfig.FIREBASE_KEY);
const admin = require('firebase-admin');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
db.settings({ timestampsInSnapshots: true })

// db structure
// 

const documentJSON = '{"type":"doc","content":[{"type":"heading","attrs":{"level":3},"content":[{"type":"text","text":"Hello ProseMirror"}]},{"type":"paragraph","content":[{"type":"text","text":"This is editable text. You can focus it and start typing."}]},{"type":"paragraph","content":[{"type":"text","text":"To apply styling, you can select a piece of text and manipulate its styling from the menu. The basic schema supports "},{"type":"text","marks":[{"type":"em"}],"text":"emphasis"},{"type":"text","text":", "},{"type":"text","marks":[{"type":"strong"}],"text":"strong text"},{"type":"text","text":", "},{"type":"text","marks":[{"type":"link","attrs":{"href":"http://marijnhaverbeke.nl/blog","title":null}}],"text":"links"},{"type":"text","text":", "},{"type":"text","marks":[{"type":"code"}],"text":"code font"},{"type":"text","text":", and "},{"type":"image","attrs":{"src":"/img/smiley.png","alt":null,"title":null}},{"type":"text","text":"> images."}]},{"type":"paragraph","content":[{"type":"text","text":"Block-level structure can be manipulated with key bindings (try ctrl-shift-2 to create a level 2 heading, or enter in an empty textblock to exit the parent block), or through the menu."}]},{"type":"paragraph","content":[{"type":"text","text":"Try using the “list” item in the menu to wrap this paragraph in a numbered list."}]}]}'
let document = schema.nodeFromJSON(JSON.parse(documentJSON))
let documentVersion = 0
let documentSteps = []

// server takes whatever changes are incoming,
// and applies it to the document (only if changes were made on the same document version)
// and then sends those changes to all clients

wssData.on('connection', function (client) {
    console.log('socket connected')
    const message = { type: 'document', document: document.toJSON(), version: documentVersion }
    client.send(JSON.stringify(message))
    console.log('message sent', message)
    client.on('message', (data) => {
        const message = JSON.parse(data)
        console.log('message received', message)
        switch (message.type) {
            case 'steps-from-client':
                const { version, clientID } = message
                if (version !== documentVersion) {
                    return
                }

                const steps = message.steps.map((stepJSON) => {
                    const step = Step.fromJSON(schema, stepJSON)
                    step.clientID = clientID
                    return step
                })

                const doc = steps.reduce((doc, step) => {
                    const result = step.apply(doc)
                    return result.doc
                }, document)

                documentVersion += steps.length
                documentSteps = documentSteps.concat(steps)
                document = doc

                console.log('applied client steps', { documentVersion, documentSteps, document })

                const stepsFromServerMessage = {
                    type: 'steps-from-server',
                    steps: message.steps,
                    clientIDs: steps.map(step => step.clientID)
                }
                wssData.clients.forEach((client) => {
                    client.send(JSON.stringify(stepsFromServerMessage))
                    console.log('message sent', stepsFromServerMessage)
                })
                break
            default:
                break
        }
    })

    client.on('close', () => {
        console.log('socket client closed')
    })
});

app.prepare().then(() => {
    const server = createServer((req, res) => {
        // Be sure to pass `true` as the second argument to `url.parse`.
        // This tells it to parse the query portion of the URL.
        const parsedUrl = parse(req.url, true)
        handle(req, res, parsedUrl)
    })

    server.on('upgrade', (request, socket, head) => {
        const pathname = parse(request.url).pathname
        if (pathname === '/collab') {
            wssData.handleUpgrade(request, socket, head, (ws) => {
                wssData.emit('connection', ws, request)
            })
        } else {
            socket.destroy()
        }
    })

    const port = process.env.PORT || 3000
    server.listen(port, err => {
        if (err) throw err
        console.log(`server listening on http://localhost:${port}`)
    })
})


