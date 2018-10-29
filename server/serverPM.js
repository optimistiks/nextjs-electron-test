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
let users = {}
let cursors = {}
const colors = [
    '#001f3f',
    '#0074D9',
    '#39CCCC',
    '#3D9970',
    '#2ECC40',
    '#01FF70',
    '#FFDC00'
]
let colorCursor = 0

// server takes whatever changes are incoming,
// and applies it to the document (only if changes were made on the same document version)
// and then sends those changes to all clients

wssData.on('connection', function (client) {
    client.color = colors[colorCursor]
    colorCursor += 1
    if (colorCursor === colors.length) {
        colorCursor = 0
    }

    client.on('message', (data) => {
        const message = JSON.parse(data)
        console.log(message.type, 'received', message)
        switch (message.type) {
            case 'client-greet':
                // save userId to ws instance and to the map of active users
                client.userId = message.userId
                users[message.userId] = {
                    color: client.color
                } 
                cursors[message.userId] = {
                    color: client.color
                }

                // create response greet message
                const serverGreetMessage = {
                    type: 'server-greet',
                    users,
                    cursors,
                    version: documentVersion
                }

                if (message.version && message.version < documentVersion) {
                    // if client provided a version, we provide him steps to update to the latest version
                    const greetUpdateSlice = documentSteps.slice(message.version)
                    serverGreetMessage.userIds = greetUpdateSlice.map((step) => step.userId)
                    serverGreetMessage.steps = greetUpdateSlice.map((step) => step.toJSON())
                } else if (message.version == null) {
                    // otherwise we send him the whole document
                    serverGreetMessage.document = document.toJSON()
                } else {
                    throw new Error('Could not handle client-greet message', { documentVersion, message })
                }

                client.send(JSON.stringify(serverGreetMessage))
                console.log('server-greet sent', serverGreetMessage)

                // notify all users about new user
                const userJoinMessage = {
                    type: 'server-user-join',
                    userId: message.userId,
                    user: users[message.userId]
                }
                wssData.clients.forEach((client) => {
                    client.send(JSON.stringify(userJoinMessage))
                    console.log('server-user-join sent', userJoinMessage)
                })
                break
            case 'client-document-change':
                if (message.version > documentVersion) {
                    console.log('client version greater than server version', { clientVersion: message.version, serverVersion: documentVersion })
                    throw new Error('client version cannot be greater than server version')
                }
                if (message.version < documentVersion) {
                    console.log('client version lower than server version', { clientVersion: message.version, serverVersion: documentVersion })
                    return
                }

                // decode steps, apply steps to the document
                const steps = message.steps.map((stepJSON) => {
                    const step = Step.fromJSON(schema, stepJSON)
                    step.userId = message.userId
                    return step
                })
                const doc = steps.reduce((doc, step) => {
                    const result = step.apply(doc)
                    return result.doc
                }, document)

                // update document
                documentVersion += steps.length
                documentSteps = documentSteps.concat(steps)
                document = doc
                console.log('document version after applying steps', documentVersion)

                const documentChangeNewCursor = {
                    ...(cursors[message.userId] || {}),
                    selection: message.selection,
                    version: documentVersion
                }
                cursors[message.userId] = documentChangeNewCursor

                // send user steps to all other users
                const serverDocumentChangeMessage = {
                    type: 'server-document-change',
                    version: documentVersion,
                    steps: message.steps,
                    userIds: steps.map(step => step.userId),
                    cursors: { [message.userId]: cursors[message.userId] }
                }
                wssData.clients.forEach((client) => {
                    client.send(JSON.stringify(serverDocumentChangeMessage))
                    console.log('server-document-change sent', serverDocumentChangeMessage)
                })
                break
            case 'client-selection-change': 
                const selectionChangeNewCursor = {
                    ...(cursors[message.userId] || {}),
                    selection: message.selection,
                    version: message.version
                }
                
                cursors[message.userId] = selectionChangeNewCursor

                const serverSelectionChangeMessage = {
                    type: 'server-selection-change',
                    userId: message.userId,
                    version: documentVersion,
                    cursors: { [message.userId]: selectionChangeNewCursor }
                }
                wssData.clients.forEach((client) => {
                    client.send(JSON.stringify(serverSelectionChangeMessage))
                    console.log('server-selection-change sent', serverSelectionChangeMessage)
                })
                break
            default:
                break
        }
    })

    client.on('close', () => {
        if (client.userId) {
            delete users[client.userId]
            delete cursors[client.userId]

            const userLeaveMessage = {
                type: 'server-user-leave',
                userId: client.userId
            }
            wssData.clients.forEach((client) => {
                client.send(JSON.stringify(userLeaveMessage))
                console.log('server-user-leave sent', userLeaveMessage)
            })
        }
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


