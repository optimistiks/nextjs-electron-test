import React, { PureComponent } from 'react'
import Editor from './PMEditor'
import { EditorState } from "prosemirror-state"
import { EditorView } from "prosemirror-view"
import { exampleSetup } from "prosemirror-example-setup"
import * as collab from "prosemirror-collab"
import schema from '../../universal/schema'
import ReconnectingWebSocket from 'reconnecting-websocket'
import { Step } from 'prosemirror-transform'

export default class EditorContainer extends PureComponent {
    constructor(props) {
        super(props)
    }

    componentDidMount() {
        const socket = this.socket = new ReconnectingWebSocket(`ws://${location.host}/collab`)

        socket.addEventListener('message', (event) => {
            const message = JSON.parse(event.data)
            console.log('message received', message)
            switch (message.type) {
                case 'document':
                    // create document instance using JSON provided by the server
                    const doc = schema.nodeFromJSON(message.document)
                    // create editor state using the document and plugins that we need
                    const state = EditorState.create({
                        doc,
                        plugins: [...exampleSetup({ schema }), collab.collab({ version: message.version })]
                    })
                    // instantiate editor on a document node
                    window.view = new EditorView(document.querySelector("#editor"), {
                        state,
                        // handles every editor content change
                        // updates editor contents and also sends changes to the collaboration server
                        // http://prosemirror.net/docs/ref/#view.DirectEditorProps.dispatchTransaction
                        dispatchTransaction(transaction) {
                            // update editor contents
                            const state = view.state.apply(transaction)
                            view.updateState(state)
                            // send update steps to the collaboration server, if needed
                            // http://prosemirror.net/docs/ref/#collab.sendableSteps
                            const sendable = collab.sendableSteps(state)
                            if (sendable) {
                                // the version here is the version of the document _before_ the change
                                // it will be compared on the server with the server version of the document
                                // if versions are not equal, steps wont be applied (it means someone applied his steps
                                // ahead of us, and we need to apply his steps first, they will come with a different 
                                // message from the socket)
                                const { version, steps, clientID } = sendable
                                const message = {
                                    type: 'steps-from-client',
                                    steps: steps.map((step) => step.toJSON()),
                                    version,
                                    clientID
                                }
                                socket.send(JSON.stringify(message))
                                console.log('message sent', message)
                            }

                        }
                    })
                    break
                case 'steps-from-server':
                    const { clientIDs } = message
                    const steps = message.steps.map((stepJSON) => Step.fromJSON(schema, stepJSON))
                    const transaction = collab.receiveTransaction(window.view.state, steps, clientIDs)
                    window.view.dispatch(transaction)
                    break
                default:
                    break
            }
        })
    }

    componentWillUnmount() {
    }

    render() {
        return <Editor />
    }
}
