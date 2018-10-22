import React, { PureComponent } from 'react'
import Editor from './Editor'
import Quill from 'quill'
import QuillCursors from 'quill-cursors'
import sharedb from 'sharedb/lib/client'
import richText from 'rich-text'
import ReconnectingWebSocket from 'reconnecting-websocket'

Quill.register('modules/cursors', QuillCursors)
sharedb.types.register(richText.type)

export default class EditorContainer extends PureComponent {
    constructor (props) {
        super(props)
        // generate fake user data that we are going to send along with the cursor range
        const id = Date.now()
        this.state = {
            user: {
                id,
                name: `Username_${id}`
            },
            users: {}
        }
    }

    componentDidMount () {
        // open connection to ShareDB websocket
        let socket = this.socket = new ReconnectingWebSocket(`ws://${location.host}/collab/data`)
        const connection = new sharedb.Connection(socket)
        // open connection to cursors websocket
        let cursorsSocket = this.cursorsSocket = new ReconnectingWebSocket(`ws://${location.host}/collab/cursors`)


        
        // Create local Doc instance mapped to 'examples' collection document with id 'richtext'
        var doc = connection.get('garbage', 'testDocumentId');

        doc.subscribe((err) => {
            if (err) {
                throw err
            };

            // initialize Quill editor with the cursors module
            const quill = this.quill = new Quill('#editor', {
                theme: 'snow',
                modules: {
                    cursors: true
                }
            })

            // send user-made operations to ShareDB
            quill.on('text-change', (delta, oldDelta, source) => {
                if (source !== 'user') {
                    return
                };
                doc.submitOp(delta, { source: quill });
            });

            // update editor contents with operations sent by ShareDB
            doc.on('op', (op, source) => {
                if (source === quill) {
                    return
                };
                quill.updateContents(op);
            });

            // update cursors positions in response to messages sent by cursors websocket
            const cursors = quill.getModule('cursors')

            if (cursorsSocket.readyState === WebSocket.OPEN) {
                cursorsSocket.send(createMessage('greet', { user: this.state.user }))
            } else {
                cursorsSocket.addEventListener('open', () => {
                    cursorsSocket.send(createMessage('greet', { user: this.state.user }))
                })
            }

            // send cursor data changes to cursors websocket
            quill.on('selection-change', (range, oldRange, source) => {
                if (range) {
                    const { id: userId, name } = this.state.user
                    const message = createMessage('update-cursor', { cursor: { userId, range, name } })
                    cursorsSocket.send(message)
                }
            });



            cursorsSocket.addEventListener('message', (event) => {
                const message = JSON.parse(event.data)
                switch (message.type) {
                    case 'init-users':
                        this.setState({ users: message.data.users })
                        console.log('received init-users', { users: message.data.users })
                        break
                    case 'init-cursors':
                        Object.values(message.data.cursors).forEach((cursor) => {
                            const { userId, range, name, color } = cursor
                            cursors.setCursor(userId, range, name, color)
                        })
                        console.log('received init-cursors', { cursors: message.data.cursors })
                        break
                    case 'update-user':
                        const { user } = message.data
                        this.setState({ users: { ...this.state.users, [user.id]: user } })
                        console.log('received update-user', { user })
                        break
                    case 'update-cursor':
                        const { userId, range, name, color } = message.data.cursor
                        cursors.setCursor(userId, range, name, color)
                        console.log('received update-cursor', { cursor: message.data.cursor })
                        break
                    case 'delete-user':
                        const users = { ...this.state.users }
                        delete users[message.data.userId]
                        this.setState({ users })
                        console.log('received delete-user', { userId: message.data.userId })
                        break
                    case 'delete-cursor':
                        cursors.removeCursor(message.data.userId)
                        console.log('received delete-cursor', { userId: message.data.userId })
                        break
                    default:
                        throw new Error(`Unknown message type ${data.type}`)
                        
                }
            })

            // set initial editor contents
            quill.setContents(doc.data);
        });
    }

    componentWillUnmount () {
        this.socket.close()
        this.cursorsSocket.close()
        this.socket = null
        this.cursorsSocket = null
    }

    render () {
        return <Editor users={this.state.users} />
    }
}

function createMessage(type, data) {
    return JSON.stringify({ type, data })
}