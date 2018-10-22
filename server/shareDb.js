var ShareDB = require('sharedb');
var richText = require('rich-text');

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
        console.log('shareDb.js: commit start', { id, op, snapshot })
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
            console.log('shareDb.js: commit versions', versionsToLog)
            if (snapshot.v !== lastOp.v + 1) {
                console.error('shareDb.js: commit wrong snapshot version', versionsToLog)
                return callback(null, false)
            } 
        }
    
        const snapshotRef = db.collection('documentSnapshot').doc(id)

        // convert snapshot and op to object since Firestore does not support objects with altered prototypes
        const snapshotObject = JSON.parse(JSON.stringify(snapshot))
        const opObject = JSON.parse(JSON.stringify(op))

        console.log('shareDb.js: commit ready to commit', { snapshotObject, opObject })

        const batch = db.batch()
        batch.set(snapshotRef, snapshotObject)
        batch.set(opCollectionRef.doc(), opObject)
        await batch.commit()
        console.log('shareDb.js: commit done')
        callback(null, true)
    }

    async getSnapshot (collectionName, id, fields, options, callback) {
        console.log('shareDb.js: getSnapshot start', { id })
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
        console.log('shareDb.js: getSnapshot found snapshot', { snapshot })
        return callback(null, snapshot)
    }

    async query (collection, query, fields, options, callback) {
        console.log('shareDb.js: query', { collection, query, fields, options, callback })
    }

    async getOps (collection, id, from, to, options, callback) {
        console.log('shareDb.js: getOps', { collection, id, from, to, options, callback })
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
