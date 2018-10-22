exports.terminateOrCheck = (client) => {
    if (!client.isAlive) {
        console.log('utils.js: isAlive=false, client terminating')
        return client.terminate()
    }
    client.isAlive = false
    client.ping()
    console.log('utils.js: client pinged')
}

exports.createMessage = (type, data) => {
    return JSON.stringify({ type, data })
}
