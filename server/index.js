var ShareDB = require('sharedb');
var richText = require('rich-text');
var WebSocket = require('ws');
var WebSocketJSONStream = require('websocket-json-stream');

const admin = require('firebase-admin');

var serviceAccount = require('../service-account.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

var db = admin.firestore();
db.settings({ timestampsInSnapshots: true })

// there is a naming confusion, because Firestore has snapshots, and ShareDB has snapshots
// as a convention, we only use "snapshot" word to name ShareDB snapshots, for Firestore  we use "result" instead

class FirestoreAdapter extends ShareDB.DB {
    constructor ({ db }) {
        super()
        this.db = db
        this.closed = false
    }

    close(callback) {
        this.closed = true
        if (callback) callback()
    };

    // thoughts on cursor colors
    // the best way is to assign unique color to every user,
    // the disadvantage is that some colors may not look good, hardly visible on the editor background, 
    // or hardly different from each other
    // so another way is to have a pool of good-looking colors
    // add assign them to users permanently on a per-document basis
    // it means each user has his own color in every document he collaborates on
    // helps to identify users just by glancing on a users bar
    // for example, John writes a book "My First Book". He invites Ivan and Sarah to collaborate.
    // Ivan and Sarah always see John as "red" (he's a collaborator). Ivan gets green, Sarah gets blue,
    // so now John always sees Ivan as "green" and Sarah as "blue" when collaborating on the "My First Book" book.

    // conventions
    // database naming = singular
    // use "id" for identifiers. Examples: id, userId

    // I want each operation to be a separate document
    // I want document snapshot to be a separate document
    // I want document metadata to be a separate document
    // I want to minimize the number of subcollections

    // document [] (collection)
    //    documentId: document {} (document) (metadata - title, userId, createdAt, etc)

    // documentSnapshot [] (collection)
    //    documentId: snapshot {} (document) (access control by querying /document/documentKey)

    // documentOperation [] (collection)
    //    documentKey: {} (document)
    //      operation: [] (subcollection)

    async commit(collection, id, op, snapshot, options, callback) {
        console.log('commit start', { id, op, snapshot })
        // get last operation version
        // if snapshot version not equals operation version + 1 then return callback(null, false)
        const opCollectionRef = db.collection(`documentOperation`).doc(id).collection('operation')
        const lastOpQuery = await opCollectionRef
            .orderBy('version', 'desc').limit(1)
            .get()

        if (!lastOpQuery.empty) {
            const lastOpResult = lastOpQuery.docs[0]
            const lastOp = lastOpResult.data()
            const versionsToLog = { snapshotVersion: snapshot.v, lastOpVersion: lastOp.v }
            console.log('commit versions', versionsToLog)
            if (snapshot.v !== lastOp.v + 1) {
                console.error('commit wrong snapshot version', versionsToLog)
                return callback(null, false)
            } 
        }
    
        const snapshotRef = db.collection('documentSnapshot').doc(id)

        // convert snapshot and op to object since Firestore does not support objects with altered prototypes
        const snapshotObject = JSON.parse(JSON.stringify(snapshot))
        const opObject = JSON.parse(JSON.stringify(op))

        console.log('commit ready to commit', { snapshotObject, opObject })

        const batch = db.batch()
        batch.set(snapshotRef, snapshotObject)
        batch.set(opCollectionRef.doc(), opObject)
        await batch.commit()
        console.log('commit done')
        callback(null, true)
    }

    async getSnapshot (collectionName, id, fields, options, callback) {
        console.log('getSnapshot start', { id })
        const snapshotResult = await db.collection('documentSnapshot').doc(id).get()
        if (!snapshotResult.exists) {
            const nullSnapshot = {
                id,
                v: 0,
                type: null,
                data: undefined
            }
            console.log('getSnapshot snapshot not found, returning null snapshot')
            return callback(null, nullSnapshot)
        }
        const snapshot = snapshotResult.data()
        console.log('getSnapshot found snapshot', { snapshot })
        return callback(null, snapshot)
    }

    async query (collection, query, fields, options, callback) {
        console.log('query', { collection, query, fields, options, callback })
    }

    async getOps (collection, id, from, to, options, callback) {
        console.log('getOps', { collection, id, from, to, options, callback })
    }
}

ShareDB.types.register(richText.type)
var backend = new ShareDB({ db: new FirestoreAdapter({ db }) })

createDoc(startServer);

// Create initial document then fire callback
function createDoc(callback) {
    var connection = backend.connect();
    var doc = connection.get('documents', 'testDocumentId');
    doc.fetch(function (err) {
        console.log('doc fetch err', err)
        if (err) throw err;
        if (doc.type === null) {
            doc.create([{ insert: 'Hi!' }], 'rich-text', callback);
            console.log('document not found, default document created')
            return;
        }
        console.log('document found')
        callback();
    });
}

function startServer() {
    var wss = new WebSocket.Server({ port: 8080 });

    // Connect any incoming WebSocket connection to ShareDB
    wss.on('connection', function (ws) {
        console.log('data connected, total clients', wss.clients.size)
        ws.isAlive = true
        ws.on('pong', () => { ws.isAlive = true; console.log('set isAlive=true') })

        var stream = new WebSocketJSONStream(ws)
        backend.listen(stream);

        ws.on('close', () => {
            console.log('data close')
        })
    });
    console.log('Listening for data on http://localhost:8080');

    const users = {}
    const cursors = {}

    var wsCursors = new WebSocket.Server({ port: 8081 });

    wsCursors.on('connection', function (ws) {
        console.log('cursors connected, total cursor connections', wsCursors.clients.size)
        ws.isAlive = true
        ws.on('pong', () => { ws.isAlive = true; console.log('set isAlive=true') })

        ws.on('message', (data) => {
            console.log('cursors message', data)
            const incomingMessage = JSON.parse(data)

            switch (incomingMessage.type) {
                case 'greet':
                    console.log('incoming "greet" message', incomingMessage)
                    const { user } = incomingMessage.data

                    // set user color in case its not set
                    if (!users[user.id]) {
                        users[user.id] = user
                    }
                    if (!users[user.id].color) {
                        setUserColor(users[user.id])
                    }

                    ws.userId = user.id

                    ws.send(createMessage('init-users', { users }))
                    ws.send(createMessage('init-cursors', { cursors }))

                    const updateUserMessage = createMessage('update-user', { user })
                    wsCursors.clients.forEach((client) => {
                        if (client !== ws) {
                            client.send(updateUserMessage)
                        }
                    })
                    break
                case 'update-cursor':
                    // some user changed his cursor position
                    const { cursor } = incomingMessage.data

                    // set user color in case it's not set
                    if (!users[cursor.userId]) {
                        users[cursor.userId] = {}
                    }
                    if (!users[cursor.userId].color) {
                        setUserColor(users[cursor.userId])
                    }

                    // set cursor data and user color as cursor color
                    cursors[cursor.userId] = {
                        ...cursor,
                        color: users[cursor.userId].color
                    }

                    ws.userId = cursor.userId

                    const updateCursorMessage = createMessage('update-cursor', { cursor: cursors[cursor.userId] })
                    wsCursors.clients.forEach((client) => {
                        if (client !== ws) {
                            client.send(updateCursorMessage)
                        }
                    })
                    break
                default:
                    throw new Error(`Unknown message type ${incomingMessage.type}`)
            }
        })

        ws.on('close', () => {
            console.log('cursors close')
            if (ws.userId) {
                delete users[ws.userId]
                delete cursors[ws.userId]
                wsCursors.clients.forEach((client) => {
                    if (client !== ws) {
                        client.send(createMessage('delete-user', { userId: ws.userId }))
                        client.send(createMessage('delete-cursor', { userId: ws.userId }))
                    }
                })
                console.log('user cleared')
            }
        })
    });

    console.log('Listening for cursors on http://localhost:8081');

    setInterval(() => {
        wss.clients.forEach(terminateOrCheck)
        wsCursors.clients.forEach((ws) => {
            if (!ws.isAlive && ws.userId) {
                delete users[ws.userId]
                delete cursors[ws.userId]
                wsCursors.clients.forEach((client) => {
                    if (client !== ws) {
                        client.send(createMessage('delete-user', { userId: ws.userId }))
                        client.send(createMessage('delete-cursor', { userId: ws.userId }))
                    }
                })
            }
            terminateOrCheck(ws)
        })
    }, 10000)
}

const colors = [
    'red',
    'green',
    'blue'
]
let colorIndex = 0
function setUserColor (user = {}) {
    if (!user.color) {
        user.color = colors[colorIndex]
        colorIndex = colorIndex === 3 ? 0 : colorIndex + 1
    }
    return user
}

function terminateOrCheck (client) {
    if (!client.isAlive) {
        console.log('isAlive=false, terminating')
        return client.terminate()
    }
    client.isAlive = false
    client.ping()
    console.log('pinged')
}

function createMessage (type, data) {
    return JSON.stringify({ type, data })
}

// todo: manage dead connections (ping/pong)