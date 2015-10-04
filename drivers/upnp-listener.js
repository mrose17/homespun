/*
 * based on sonos 0.6.1's lib/events/listener.js
 */

var cadence     = require('cadence/redux')
  , underscore  = require('underscore')
  , UserAgent   = require('vizsla')

require('cadence/loops')


// jscs:disable requireMultipleVarDecl
var Listener = function (invoker, device) {
    this.event = invoker.event.bind(invoker)
    this.device = device

    this.services = {}
    this.stopP = false
    this.ua = new UserAgent()
}
// jscs:enable requireMultipleVarDecl


Listener.prototype.initialize = cadence(function (async, location) {
    this.location = location
    this.stopP = false

    var loop = async(function () {
        var now = new Date().getTime()

        async.forEach(function (sid) {
            var service = this.services[sid]

            if (now < service.renew) return

            async(function () {
                this.ua.fetch(
                    { url       : 'http://' + this.device.host + ':' + this.device.port + service.endpoint
                    , method    : 'SUBSCRIBE'
                    , headers   :
                      { SID     : sid
                      , Timeout : 'Second-3600'
                      }
                    }, async())
            }, function (body, response) {
                if (response.statusCode === 200) {
                    this.services[sid].renew = this._renew_at(response.headers.timeout)
                    return
                }

                delete this.services[sid]
                this.event('close', this.device
                  , { statusCode : response.statusCode
                    , body       : body
                    }, async())
            })
        })(underscore.keys(this.services))
    }, function () {
        if (this.stopP) return [ loop ]

        setTimeout(async(), 1 * 1000)
    })()
})

Listener.prototype.finalize = cadence(function (async) {
    this.stopP = true

    async.forEach(function (sid) {
        this.removeService(sid, async())
    })(underscore.keys(this.services))
})


Listener.prototype.downcall = cadence(function (async, request) {
    var items, service

    if (!this.services[request.headers.sid]) return

    service = this.services[request.headers.sid]

    async(function () {
        items = {}
        underscore.each(request.body['e:propertyset']['e:property'], function (element) {
            underscore.each(underscore.keys(element), function (key) { items[key] = element[key][0] })
        })

        this.event('update', this.device
          , { endpoint : service.endpoint
            , sid      : request.headers.sid
            , items    : items
            }, async())
    })
})

Listener.prototype.addService = cadence(function (async, serviceEndpoint) {
    if (!this.location) throw 'Service is not initialized'

    async(function () {
        this.ua.fetch(
            { url        : 'http://' + this.device.host + ':' + this.device.port + serviceEndpoint
            , method     : 'SUBSCRIBE'
            , headers    :
              { callback : '<' + this.location + '>'
              , NT       : 'upnp:event'
              , Timeout  : 'Second-3600'
              }
            }, async())
    }, function (body, response) {
        if (response.statusCode !== 200) return { statusCode : response.statusCode
                                                , body       : body
                                                }
        this.services[response.headers.sid] =
            { renew    : this._renew_at(response.headers.timeout)
            , endpoint : serviceEndpoint
            }

        return response.headers.sid
    })
})

Listener.prototype.removeService = cadence(function (async, sid) {
    if (!this.services[sid]) throw 'Service with sid ' + sid + ' is not registered'

    async(function () {
        this.ua.fetch(
            { url     : 'http://' + this.device.host + ':' + this.device.port
                            + this.services[sid].endpoint
            , method  : 'UNSUBSCRIBE'
            , headers :
              { sid   : sid
              }
            }, async())
    }, function (body, response) {
        if (response.statusCode !== 200) return { statusCode : response.statusCode
                                                , body       : body
                                                }
    })
})


Listener.prototype._renew_at = function (timeout) {
  var seconds

  if ((!!timeout) && (timeout.indexOf('Second-') === 0)) timeout = timeout.substr(7)
  seconds = (((!!timeout) && (!isNaN(timeout))) ? parseInt(timeout, 10) : 3600) - 15
       if (seconds <   0) seconds =  15
  else if (seconds > 300) seconds = 300

  return (new Date().getTime() + (seconds * 1000))
};


module.exports = Listener
