/*

    ___ usage: en_US ___
    usage: server/server < config.json

    Launch an amalgamated server configured and monitored by a wrapper process.

    description:

    Launch a single process that runs all of the server's services. The services
    will listen on different ports, but all services will share the same network
    interface and public IP address.

    Configuration is read from standard input. It is a JSON configuration file
    that is created by invoking the `server.js` process with sundry options
    specified on the command line or through environment variables.
    ___ usage ___

*/

var cadence = require('cadence/redux')

require('cadence/loops')


module.exports = cadence(function (async, config) {
    var http     = require('http')
      , logger   = require('prolific').createLogger('nsp.process.server')
      , url      = require('url')
      , Listener = require('../listener/http')
      , Homespun = require('../homespun/homespun')

    require('prolific').setLevel('debug')

    async(function () {
        var servers = [], services = {}

        logger.info('startup', { event  : 'initialization', config : config })
        async(function () {
            config.start.split(/,/).forEach(function (service) {
                switch (service) {
                    case 'homespun':
                        services[service] = new Homespun(config)
                        break

                    case 'listener':
                        services[service] = new Listener(config)
                        break

                    default:
                        throw new Error('unknown service: ' + service)
                }
            })

            config.start.split(/,/).forEach(function (service) {
                var module, server

                module = services[service]
                async(function () {
                    if (!!module.initialize) module.initialize(services, async())
                }, function () {
                    var parsed

                    if (!module.dispatcher) return

                    server = http.createServer(module.dispatcher.createDispatcher().server())
                    servers.push(server)
                    parsed = url.parse(config[service])
                    server.listen(parsed.port, parsed.hostname, async())
                })
            })
        }, function () {
            logger.info('startup', { services : config.start })
        })
    })
})

Error.stackTraceLimit = Infinity
