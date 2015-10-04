var cadence     = require('cadence/redux')
  , path        = require('path')
  , underscore  = require('underscore')
  , util        = require('util')
  , Cloud       = require(path.join(__dirname, 'prototype-cloud.js'))

require('cadence/loops')


// jscs:disable requireMultipleVarDecl
var Numerous = function (config, services) {
    Cloud.call(this, config, services)
}
// jscs:enable requireMultipleVarDecl
util.inherits(Numerous, Cloud);


Numerous.prototype.initialize = cadence(function (async) {
return
    var loop = async(function () {
        if (this.stopP) return [ loop ]

        if (!!this.config.api_key) {
            this.props.status = 'idle'
            this.readyP = true
            return [ loop ]
        }

        setTimeout(async(), 15 * 1000)
    })()
})

Numerous.prototype.finalize = cadence(function (async) {/* jshint unused: false */
    this.props.status = 'finishing'
    this.stopP = true
})


Numerous.prototype.register = cadence(function (async, instance, name, uuid, capabilities) {
console.log('register ' + instance.config.driver + ':' + instance.config.id + ' ' + name + ' '
+ uuid + ' ' + JSON.stringify(capabilities, null, 2) + '\n')
    var stmt
      , deviceID = instance.config.driver + ':' + uuid

    if (!this.readyP) return false

    if (!!this.config.devices[deviceID]) return deviceID

    stmt = async(function () {
        var device

        device = { deviceID : deviceID, entries : {}, capabilities : capabilities }
        async.forEach(function (field) {
            var key = field.field

            async(function () {
                // TBD: boolean, quad
                var kind      =  { float      : 'number'
                                 , percentage : 'percent'
                                 }[field.type]
                  , precision = -1
                  , units     = field.units

                if (units === 'celcius') {
                    kind = 'temperature'
                    precision = 1
                    units = 'fahrenheit'
                } else if (units == 'sigmas') precision = 3
                if (!kind) return

                this.ua.fetch(
                    { method                      : 'POST'
                    , url                         : this.config.server + '/v2/metrics'
                    , headers                     :
                      { authorization             : 'Bearer ' + this.config.api_key
                      , 'user-agent'              : this.version
                      }
                    , payload                     :
                      { label                     : name + ' ' + key
                      , description               : 'reported by ' + instance.config.driver + ' ' + uuid
                      , kind                      : kind
                      , units                     : units
                      , precision                 : precision
                      , visibility                : 'unlisted'
                      }
                    }, async())
            }, function (body, response) {
                if ((!response.okay) || (!body.data)) {
                    this.loser('register', 'POST /v2/metrics', body, response)
                    deviceID = undefined
                    return [ stmt ]
                }

                device.entries[key] = { metric : body, field : field }
            })
        })(capabilities.fields)

        this.config.devices[deviceID] = device
        this.persist(this.config, async())
    }, function () {
        return [ stmt, deviceID ]
    })()
})

Numerous.prototype.unregister = cadence(function (async, instance, sensorID) {/* jshint unused: false */
    var device

    if (!this.readyP) return

    device = this.config.devices[sensorID]
    if (!device) return this.logger.error('unregister', { event : 'lookup', sensorID : sensorID })

    async(function () {
        device.entries.forEach(function (entry) {
            async(function () {
                this.ua.fetch(
                    { method                      : 'DELETE'
                    , url                         : this.config.server + '/v2/metrics/' + entry.metric.id
                    , headers                     :
                      { authorization             : 'Bearer ' + this.config.api_key
                      , 'user-agent'              : this.version
                      }
                    }, async())
            }, function (body, response) {
                if (!response.okay) this.loser('unregister', 'DELETE', body, response)
            })
        })
    }, function () {
        delete(this.config.devices[sensorID])
        this.persist(this.config, async())
    })
})

Numerous.prototype.upsync = cadence(function (async, instance, sensorID, lastReading) {/* jshint unused: false */
console.log('\nupsync ' + instance.config.driver + ':' + instance.config.id + ' ' + sensorID + ' '
+ JSON.stringify(lastReading, null, 2) + '\n')
    var device

    if (!this.readyP) return

    device = this.config.devices[sensorID]
    if (!device) return this.logger.error('upsync', { event : 'lookup', sensorID : sensorID })

    async.forEach(function (key) {
        var entry = device.entries[key]
          , value = lastReading[key]

        if (!entry) return
        if (entry.field.units === 'celcius') value = (value * 1.8) + 32

        async(function () {
            this.ua.fetch(
                { method                      : 'POST'
                , url                         : this.config.server + '/v2/metrics/'
                                                    + entry.metric.id + '/events'
                , headers                     :
                  { authorization             : 'Bearer ' + this.config.api_key
                  , 'user-agent'              : this.version
                  }
                , payload                     : { value : value }
                }, async())
        }, function (body, response) {
            if (!response.okay) this.loser('upsync', 'POST', body, response)
        })
    })(underscore.keys(lastReading))
})

Numerous.prototype.loser = function (where, event, body, response) {
    if (Buffer.isBuffer(body)) body = body.toString()
    this.logger.error(where, { event : event, headers : response.headers, body : body })
}


module.exports = Numerous
