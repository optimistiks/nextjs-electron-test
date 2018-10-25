var ShareDB = require('sharedb');
var richText = require('rich-text');

const getConfig = require('next/config')
const { serverRuntimeConfig } = getConfig()

const serviceAccount = serverRuntimeConfig.FIREBASE_KEY;

const admin = require('firebase-admin');

const util = require('util')

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
        const commitLog = { 
            id, 
            opV: op.v, 
            snapshotV: snapshot.v, 
            op: util.inspect(op, { showHidden: false, depth: null }), 
            snapshot: util.inspect(snapshot, { showHidden: false, depth: null }) 
        }
        console.log('shareDb.js: commit start', commitLog)
        try {
            await db.runTransaction(async function (transaction) {
                const opCollectionRef = db.collection(`documentOperation`).doc(id).collection('operation')

                // lets say our op.v is 10
                // we try to get operation/10 with a transaction
                // if no one writes into that location (exists=false), then transaction will succeed
                // but if someone writes into that location (exists=true), transaction will abort, and commit will re-run
                // this way the race condition will be eliminated 
                // (when someone saves a v=10 operation before you, and then yours is saved, 
                // resulting in two v=10 operations, breaking the document)
                const opDocRef = opCollectionRef.doc(op.v.toString())
                const opDocResult = await transaction.get(opDocRef)

                if (opDocResult.exists) {
                    // someone wrote to that location, we need to abort commit, 
                    // but first we manually abort the transaction
                    console.log('shareDb.js: aborting transaction', commitLog)
                    return new Promise((resolve, reject) => reject())
                }

                const snapshotRef = db.collection('documentSnapshot').doc(id)

                // convert snapshot and op to object since Firestore does not support objects with altered prototypes
                const snapshotObject = JSON.parse(JSON.stringify(snapshot))
                const opObject = JSON.parse(JSON.stringify(op))

                transaction.set(snapshotRef, snapshotObject).set(opDocRef, opObject)
            })
            console.log('shareDb.js: transaction succeeded, commit done', commitLog)
            callback(null, true)
        } catch (err) {
            console.log('shareDb.js: transaction failed, aborting commit', { err, ...commitLog })
            callback(null, false)
        }
    }

    async getSnapshot (collectionName, id, fields, options, callback) {
        console.log('shareDb.js: getSnapshot start', { id, fields, options })
        const snapshotResult = await db.collection('documentSnapshot').doc(id).get()
        if (!snapshotResult.exists) {
            const nullSnapshot = {
                id,
                v: 0,
                type: null,
                data: undefined
            }
            console.log('shareDb.js: getSnapshot snapshot not found, returning null snapshot')
            return callback(null, nullSnapshot)
        }
        const snapshot = snapshotResult.data()
        console.log('shareDb.js: getSnapshot found snapshot', { snapshotV: snapshot.v })
        return callback(null, snapshot)
    }

    async getOps (collection, id, from, to, options, callback) {
        console.log('shareDb.js: getOps', { id, from, to, options })

        let opsQuery = db.collection(`documentOperation`).doc(id).collection('operation').orderBy('v', 'asc')

        if (from) {
            opsQuery = opsQuery.where('v', '>=', from)
        }

        if (to) {
            opsQuery = opsQuery.where('v', '<', to)
        }

        const opsQueryResult = await opsQuery.get()

        const ops = []

        opsQueryResult.forEach((snapshot) => {
            ops.push(snapshot.data())
        })

        console.log('shareDb.js: getOps result', { ops: util.inspect(ops, { showHidden: false, depth: null }) })

        callback(null, ops)
    }
}

ShareDB.types.register(richText.type)
var backend = exports.backend = new ShareDB({ db: new FirestoreAdapter({ db }) })

// Create initial document then fire callback
exports.createDoc = (callback) => {
    var connection = backend.connect();
    var doc = connection.get('documents', 'testDocumentId');
    doc.fetch(function (err) {
        console.log('shareDb.js: doc fetch err', err)
        if (err) throw err;
        if (doc.type === null) {
            doc.create([{ insert: 'Hi!' }], 'rich-text', callback);
            console.log('shareDb.js: document not found, default document created')
            return;
        }
        console.log('shareDb.js: document found')
        callback();
    });
}
