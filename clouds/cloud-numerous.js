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
    var loop = async(function () {
        if (this.stopP) return [ loop ]

        if (!!this.config.api_key) {
            this.token = 'Basic ' + new Buffer(this.config.api_key + ':').toString('base64')
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
    var description, device, id, stmt
      , deviceID = uuid

    if (!this.readyP) return false

    if (!!this.config.devices[deviceID]) return true

    id = uuid.split(':')
    description = 'reporting by homespun'
    if (!!this.npminfo) description += ' v' + this.npminfo.version
    description += ' for ' + underscore.first(id) + ' ' + underscore.rest(id).join(':')

    stmt = async(function () {
        device = { deviceID : deviceID, entries : {}, capabilities : capabilities }
        async.forEach(function (field) {
            var key = field.field

            async(function () {
                // TBD: boolean, quad
                var kind      =  { float      : 'number'
                                 , percentage : 'percent'
                                 }[field.type]
                  , label     = name + ' ' + (field.name || key)
                  , precision = -1
                  , units     = field.abbrev || field.units

                if (units === 'celcius') {
                    kind = 'temperature'
                    units = '°F'
                } else if (kind === 'percent') {
                    label = name
                    units = field.name || key
                } else if (units === 'sigmas') {
                    label = name
                    units = field.name || key
                    precision = 3
                }
                if (!kind) return

                this.ua.fetch(
                    { method                      : 'POST'
                    , url                         : this.config.server + '/v2/metrics'
                    , headers                     :
                      { authorization             : this.token
                      , 'user-agent'              : this.version
                      }
                    , payload                     :
                      { label                     : label
                      , description               : description
                      , kind                      : kind
                      , units                     : units
                      , precision                 : precision
                      , visibility                : 'unlisted'
                      }
                    }, async())
            }, function (body, response) {
// TODO: TSRP driver seems to duplicate, not sure why...
                if (!response) return console.log('\ngot a TSRP duplicate\n')

                if ((!response.okay) || (!body.id)) {
                    this.loser('register', 'POST /v2/metrics', body, response)
                    deviceID = undefined
                    return [ stmt ]
                }

                device.entries[key] = { metric : body, field : field }
            })
        })(capabilities.fields)
    }, function () {
        this.config.devices[deviceID] = device
        this.persist(this.config, async())
    }, function () {
        async.forEach(function (key) {
            var payload
              , entry = device.entries[key]
              , domain = entry.field.domain

            if (!domain) return

            payload = { notificationsEnabled : true }
            underscore.keys(domain).forEach(function (d) {
                var value = domain[d]

                if (entry.field.units === 'celcius') value = (value * 1.8) + 32
                underscore.extend(payload
                                 , { lower : { notifyWhenBelow : value, notifyWhenBelowSet : true }
                                   , upper : { notifyWhenAbove : value, notifyWhenAboveSet : true }
                                   }[d] || {})
            }.bind(this))
            if (underscore.keys(payload).length < 2) return

            async(function () {
                this.ua.fetch(
                    { method                      : 'PUT'
                    , url                         : this.config.server + '/v2/metrics/' + entry.metric.id
                                                        + '/subscriptions/me'
                    , headers                     :
                      { authorization             : this.token
                      , 'user-agent'              : this.version
                      }
                    , payload                     : payload
                    }, async())
            }, function (body, response) {
                if (!response.okay) this.loser('subscription', 'POST', body, response)
            })
        })(underscore.keys(device.entries))
    }, function () {
        return [ stmt, true ]
    })()
})

Numerous.prototype.unregister = cadence(function (async, instance, sensorID) {/* jshint unused: false */
    var device

    if (!this.readyP) return

    device = this.config.devices[sensorID]
    if (!device) return this.logger.error('unregister', { event : 'lookup', sensorID : sensorID })
try {
console.log('unregister: ' + JSON.stringify(JSON.parse(require('json-stringify-safe')(device)), null, 2))
} catch (ex) {
console.log(require('json-stringify-safe')(device))
}

    async(function () {
        device.entries.forEach(function (entry) {
            async(function () {
                this.ua.fetch(
                    { method                      : 'DELETE'
                    , url                         : this.config.server + '/v2/metrics/' + entry.metric.id
                    , headers                     :
                      { authorization             : this.token
                      , 'user-agent'              : this.version
                      }
                    }, async())
            }, function (body, response) {
                if (!response.okay) this.loser('unregister', 'DELETE', body, response)
            })
        }.bind(this))
    }, function () {
        delete(this.config.devices[sensorID])
        this.persist(this.config, async())
    })
})

Numerous.prototype.upsync = cadence(function (async, instance, sensorID, lastReading) {/* jshint unused: false */
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
                  { authorization             : this.token
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
