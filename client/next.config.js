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
        }
    }
    return withCSS(config)
}
