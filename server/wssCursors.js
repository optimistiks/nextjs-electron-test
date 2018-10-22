var WebSocket = require('ws');

const { createMessage } = require('./utils')

var wssCursors = new WebSocket.Server({ noServer: true });

const users = wssCursors.users = {}
const cursors = wssCursors.cursors = {}

wssCursors.on('connection', function (client) {
    console.log('wssCursors.js: client connected, total cursor clients', wssCursors.clients.size)

    client.isAlive = true
    client.on('pong', () => { client.isAlive = true; console.log('wssCursors.js: client pong, set isAlive=true') })

    client.on('message', (data) => {
        console.log('wssCursors.js: incoming message', data)
        const incomingMessage = JSON.parse(data)

        switch (incomingMessage.type) {
            case 'greet':
                console.log('wssCursors.js: "greet" message', incomingMessage)
                const { user } = incomingMessage.data

                // set user color in case its not set
                if (!users[user.id]) {
                    users[user.id] = user
                }
                if (!users[user.id].color) {
                    setUserColor(users[user.id])
                }

                client.userId = user.id

                client.send(createMessage('init-users', { users }))
                client.send(createMessage('init-cursors', { cursors }))

                const updateUserMessage = createMessage('update-user', { user })
                wssCursors.clients.forEach((otherClient) => {
                    if (otherClient !== client) {
                        otherClient.send(updateUserMessage)
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

                client.userId = cursor.userId

                const updateCursorMessage = createMessage('update-cursor', { cursor: cursors[cursor.userId] })
                wssCursors.clients.forEach((otherClient) => {
                    if (otherClient !== client) {
                        otherClient.send(updateCursorMessage)
                    }
                })
                break
            default:
                throw new Error(`Unknown message type ${incomingMessage.type}`)
        }
    })

    client.on('close', () => {
        console.log('wssCursors.js: client close')
        if (client.userId) {
            delete users[client.userId]
            delete cursors[client.userId]
            wssCursors.clients.forEach((otherClient) => {
                if (otherClient !== client) {
                    otherClient.send(createMessage('delete-user', { userId: client.userId }))
                    otherClient.send(createMessage('delete-cursor', { userId: client.userId }))
                }
            })
            console.log('wssCursors.js: client deleted')
        }
    })
});

module.exports = wssCursors

const colors = [
    'red',
    'green',
    'blue'
]
let colorIndex = 0
function setUserColor(user = {}) {
    if (!user.color) {
        user.color = colors[colorIndex]
        colorIndex = colorIndex === 3 ? 0 : colorIndex + 1
    }
    return user
}
