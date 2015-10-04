var cadence     = require('cadence/redux')
  , crypto      = require('crypto')
  , logger      = require('prolific').createLogger('listener.service')
  , os          = require('os')
  , underscore  = require('underscore')
  , url         = require('url')
  , uuid        = require('node-uuid')
  , Dispatcher  = require('inlet/dispatcher')

require('cadence/loops')


// jscs:disable requireMultipleVarDecl
var Listener = function (config) {
    logger.debug('listener', { location : config.listener })

    this.config = config

    this.parts = url.parse(this.config.listener)

    this.locations = {}
    this.downcalls = {}
}
// jscs:enable requireMultipleVarDecl


Listener.prototype.initialize = cadence(function (async, services) {
    var dispatcher
      , ifaces = os.networkInterfaces()

    this.services = services

    this.dispatcher = new Dispatcher(this)    // no logger here...
    this.dispatcher.dispatch('POST   /:path', 'downcall')
    this.dispatcher.dispatch('NOTIFY /:path', 'downcall')

    dispatcher = this.dispatcher.createDispatcher()
    dispatcher.server = function () {
        return require('connect')()
            .use(require('express-xml-bodyparser')())
            .use(require('body-parser').json())
            .use(dispatcher)
    }
    this.dispatcher.createDispatcher = function () {
        return dispatcher
    }

    async(function () {
        async.forEach(function (ifName) {
            async.forEach(function (ifEntry) {
                if ((ifEntry.family !== 'IPv4') || (!!this.locations[ifName])) return

                ifEntry.location = this.parts.protocol + '//' + ifEntry.address + ':' + this.parts.port
                this.locations[ifName] = ifEntry
            })(ifaces[ifName])
        })(underscore.keys(ifaces))
    }, function () {
        this.locations = underscore.defaults({ lo0 : this.locations.lo0 }, this.locations)
    })
})


Listener.prototype.downcall = cadence(function (async, request) {
    if ((!this.downcalls[request.method]) || (!this.downcalls[request.method][request.url])) {
        return function (response) {
            response.statusCode = 404
            response.end()
        }
        request.raise(404)
    }

    async(function () {
        this.downcalls[request.method][request.url](request, async())
    }, function () {
        return 'OK'
    })
})


Listener.prototype.callback = cadence(function (async, remote, method, downcall) {
    async(function () {
        crypto.randomBytes(16, async())
    }, function (bytes) {
        var iface
          , path = '/' + uuid.v4(bytes)

        if (!this.downcalls[method]) this.downcalls[method] = {}
        this.downcalls[method][path] = downcall

/*
 * this doesn't handle true multihoming...
 */
        iface = (remote === '127.0.0.1') ? 'lo0' : underscore.keys(this.locations)[1]

        return (this.locations[iface].location + path)
    })
})


module.exports = Listener
