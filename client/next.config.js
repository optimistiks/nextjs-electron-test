const withCSS = require('@zeit/next-css')

module.exports = () => {
    const config = {
        webpack(config) {
            console.log('NEXTJS_WEBPACK_TARGET', process.env.NEXTJS_WEBPACK_TARGET)
            if (process.env.NEXTJS_WEBPACK_TARGET) {
                config.target = process.env.NEXTJS_WEBPACK_TARGET
            }
            return config
        },
        exportPathMap() {
            return {
                '/': { page: '/index' }
            }
        },
        serverRuntimeConfig: { // Will be available on both server and client
            FIREBASE_KEY: process.env.FIREBASE_KEY // Pass through env variables
        }
    }
    return withCSS(config)
}
