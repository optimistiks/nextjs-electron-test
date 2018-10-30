import React, { PureComponent } from 'react'
import Editor from './PMEditor'
import { EditorState, Plugin, PluginKey } from "prosemirror-state"
import { EditorView, DecorationSet, Decoration } from "prosemirror-view"
import { exampleSetup } from "prosemirror-example-setup"
import * as collab from "prosemirror-collab"
import schema from '../../universal/schema'
import ReconnectingWebSocket from 'reconnecting-websocket'
import { Step } from 'prosemirror-transform'

const cursorsPluginKey = new PluginKey('cursorsPlugin')

let cursorsPlugin = new Plugin({
    key: cursorsPluginKey,
    state: {
        init() {
            return { cursors: {} }
        },
        apply(transaction, pluginState) {
            const meta = transaction.getMeta(this)
            if (meta == null) {
                return pluginState
            }
            const newPluginState = {
                ...pluginState,
                cursors: meta.cursors
            }
            return newPluginState
        }
    },
    props: {
        decorations(pluginState) {
            const { cursors } = pluginState[this.key]
            const decorations = Object.keys(cursors).filter((userId) => cursors[userId].selection).map((userId) => {
                const cursor = cursors[userId]
                const { selection } = cursor
                if (selection.anchor === selection.head) {
                    return Decoration.widget(selection.head, () => {
                        const el = document.createElement('span')
                        el.style.width = '2px'
                        el.style.height = '20px'
                        el.style.background = cursor.color
                        el.style.position = 'absolute'
                        return el
                    })
                } else {
                    return Decoration.inline(selection.anchor, selection.head, { style: "background: green; opacity: 0.5" })
                }
            })
            return DecorationSet.create(pluginState.doc, decorations)
        }
    }
})

export default class EditorContainer extends PureComponent {
    constructor(props) {
        super(props)
        this.state = {
            userId: Date.now(),
            users: {}
        }
        this.dispatchTransaction = this.dispatchTransaction.bind(this)
    }

    componentDidMount () {
        const socket = this.socket = window.socket = new ReconnectingWebSocket(`ws://${location.host}/collab`)

        socket.addEventListener('open', () => {
            const greetMessage = createGreetMessage(this.state.userId, window.view ? window.view.state : null)
            this.socket.send(JSON.stringify(greetMessage))
            console.log('client-greet sent', greetMessage)
        })

        socket.addEventListener('message', (event) => {
            const message = JSON.parse(event.data)
            console.log(message.type, 'received', message)
            switch (message.type) {
                case 'server-greet':
                    this.handleGreetMessage(message)
                    break
                case 'server-user-join':
                    this.handleUserJoinMessage(message)
                    break
                case 'server-user-leave':
                    this.handleUserLeaveMessage(message)
                    break
                case 'server-selection-change':
                    if (!window.view) {
                        return
                    }
                    this.handleSelectionChangeMessage(message)
                    break
                case 'server-document-change':
                    if (!window.view) {
                        return
                    }
                    this.handleDocumentChangeMessage(message)
                    break
                default:
                    throw new Error('Unknown message type', message.type, message)
            }
        })
    }

    handleGreetMessage (message) {
        if (window.view && message.steps) {
            // handle reconnect case
            // decode steps into the Step objects
            const steps = message.steps.map((stepJSON) => Step.fromJSON(schema, stepJSON))
            // create transaction that applies steps and sets initial cursors
            const transaction = collab
                .receiveTransaction(window.view.state, steps, message.userIds, { mapSelectionBackward: true })
                .setMeta(cursorsPluginKey, { cursors: message.cursors })
            // dispatch the transaction
            window.view.dispatch(transaction)
        } else if (message.document) {
            // handle first time connection case
            // create document instance using JSON provided by the server
            const doc = schema.nodeFromJSON(message.document)
            // create editor state using the document and plugins that we need
            const editorState = EditorState.create({
                doc,
                plugins: [
                    ...exampleSetup({ schema }),
                    collab.collab({ version: message.version, clientID: this.state.userId }),
                    cursorsPlugin
                ]
            })
            // instantiate editor on a document node
            window.view = new EditorView(document.querySelector("#editor"), {
                state: editorState,
                // handles every editor content change
                // updates editor contents and also sends changes to the collaboration server
                // http://prosemirror.net/docs/ref/#view.DirectEditorProps.dispatchTransaction
                dispatchTransaction: this.dispatchTransaction
            })
            // set initial cursors
            const cursorsTr = view.state.tr.setMeta(cursorsPluginKey, { cursors: message.cursors })
            window.view.dispatch(cursorsTr)
        } else {
            throw new Error('Could not handle greet event', message)
        }
        // handle initial set of users
        this.setState({ users: message.users })
    }

    dispatchTransaction(transaction) {
        // update editor contents
        // calling view.dispatch here will cause an infinite loop
        const newState = view.state.apply(transaction)
        const isSelectionChanged = view.state.selection !== newState.selection
        view.updateState(newState)
        console.log('selection', view.state.selection)
        // send update steps to the collaboration server, if needed
        // http://prosemirror.net/docs/ref/#collab.sendableSteps
        const sendable = collab.sendableSteps(window.view.state)
        if (sendable) {
            const clientDocumentChangeMessage = createDocumentChangeMessage(
                this.state.userId,
                view.state,
                sendable
            )
            this.socket.send(JSON.stringify(clientDocumentChangeMessage))
            console.log('client-document-change sent', clientDocumentChangeMessage)
        } else if (isSelectionChanged) {
            const clientSelectionChangeMessage = createSelectionChangeMessage(
                this.state.userId,
                window.view.state,
            )
            this.socket.send(JSON.stringify(clientSelectionChangeMessage))
            console.log('client-selection-change sent', clientSelectionChangeMessage)
        }
    }

        
    handleUserJoinMessage (message) {
        this.setState({
            users: {
                ...this.state.users,
                [message.userId]: message.user
            }
        })
    }

    handleUserLeaveMessage (message) {
        // remove user from the list of users
        const users = { ...this.state.users }
        delete users[message.userId]
        this.setState({
            users
        })
        // remove user cursor from the list of cursors
        const pluginState = cursorsPluginKey.getState(window.view.state)
        const newCursors = {
            ...pluginState.cursors,
        }
        delete newCursors[message.userId]
        const selectionTr = view.state.tr.setMeta(cursorsPluginKey, { cursors: newCursors })
        window.view.dispatch(selectionTr)
    }

    handleSelectionChangeMessage (message) {
        // update user cursor, or it could be multiple cursors
        const pluginState = cursorsPluginKey.getState(window.view.state)
        const selectionTr = view.state.tr.setMeta(cursorsPluginKey, { cursors: {
            ...pluginState.cursors,
            ...message.cursors
        } })
        window.view.dispatch(selectionTr)
    }

    handleDocumentChangeMessage (message) {
        const steps = message.steps.map((stepJSON) => Step.fromJSON(schema, stepJSON))
        let transaction = collab
            .receiveTransaction(window.view.state, steps, message.userIds, { mapSelectionBackward: true })
        // update user cursor, or it could be multiple cursors
        const pluginState = cursorsPluginKey.getState(window.view.state)
        transaction = transaction.setMeta(cursorsPluginKey, { cursors: {
            ...pluginState.cursors,
            ...message.cursors
        } })
        window.view.dispatch(transaction)
        console.log('selection', view.state.selection)
    }

    componentWillUnmount() {
        this.socket.close()
    }

    render() {
        return <Editor users={this.state.users} />
    }
}

function createGreetMessage (userId, editorState = null) {
    return {
        type: 'client-greet',
        userId,
        version: editorState ? collab.getVersion(editorState) : null
    }
}

function createSelectionChangeMessage (userId, editorState) {
    return {
        type: 'client-selection-change',
        userId,
        version: collab.getVersion(editorState),
        selection: editorState.selection.toJSON()
    }
}

function createDocumentChangeMessage (userId, editorState, sendable) {
    return {
        type: 'client-document-change',
        userId,
        // the version here is the version of the document _before_ the change
        // it will be compared on the server with the server version of the document
        // if versions are not equal, steps wont be applied (it means someone applied his steps
        // ahead of us, and we need to apply his steps first, they will come with a different 
        // message from the socket)
        version: sendable.version,
        steps: sendable.steps.map((step) => step.toJSON()),
        selection: editorState.selection.toJSON()
    }
}

/*
user sends
    client-greet
        when? when connected first time, or reconnected after a disconnect
        payload? userId, and optional version
        server reaction? send server-greet to sender, send server-user-join to all users
    client-selection-change
        when? when transaction dispatched, but there are no sendable steps
        payload? userId, version, selection
        server reaction? send server-selection-change to all users
    client-document-change
        when? when transaction dispatched, and there are sendable steps
        payload? userId, version, steps, selection
        server reaction? send server-document-change to all users
    disconnect* (happens automatically)
        server reaction? send server-user-leave to all users
server sends
    server-greet
        when? in response to client-greet
        to whom? to the client-greet sender
        payload? if there was a version in a client-greet payload, then send steps from that version to the most recent version
                 if there wasn't, send the whole document
                 also, send all cursors and send all users
        client reaction? initialize the editor with the document, or apply steps to the existing document
                         also, set users and set cursors
    server-user-join
        when? in response to client-greet
        to whom? to all users
        payload? the joined user
        client reaction? add user to the list of active users
    server-user-leave
        when? in response to disconnect
        to whom? to all users
        payload? the disconnected user
        client reaction? remove user from the list of active users, remove user's cursor
    server-selection-change
        when? in response to client-selection-update
        to whom? to all users
        payload? selection
        client reaction? change user's cursor position, or add the cursor at that position
    server-document-change
        when? in response to client-document-change
        to whom? to all users
        payload? steps and selection
        client reaction? apply steps to the document, change cursors positions and/or add them
*/

// things to keep in mind
// when changing cursor positions, document versions should match
// steps could be from multiple users in certain cases
// when user first connects, or reconnects, he should fully replace his cursors and users maps
// however, on consequent updates, cursors and users should only be updated, not replaced
// user also should ignore all messages that came from the server until editor is initialized in DOM

// client version 10, server version 10
// client sends step 11
// server applies step, server version 11 (step 11 is in flight to client)
// client sends step 11 and 12
// server version 11, but client version still 10
// step 11 and 12 are rejected, server sends step 11 to client
// 
// проблема возникает если клиент сначала отправил шаг 1, не дождался получения шага 1 и отправил шаг 1 и 2
// в итоге он получает ответ по шагу 1