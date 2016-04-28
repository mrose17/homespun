var cadence     = require('cadence/redux')
  , path        = require('path')
  , underscore  = require('underscore')
  , util        = require('util')
  , Driver      = require(path.join(__dirname, 'prototype-driver.js'))

require('cadence/loops')


// jscs:disable requireMultipleVarDecl
var Foobot = function (config, services) {
    Driver.call(this, config, services)

    this.timestamps = {}
}
// jscs:enable requireMultipleVarDecl
util.inherits(Foobot, Driver);


/*
   cf., http://foobot.io/faq2/ or http://foobot.io/support/#fordev
 */
Foobot.prototype.initialize = cadence(function (async) {
    var outer = async(function () {
        var inner, timestamp

        if (this.stopP) return [ outer ]

        timestamp = 0
        inner = async(function () {
            if ((!this.config.xauth) || (!this.config.xauth.token)) {
/* if this.config.xauth.key, then POST '/v2/user/' + this.config.xauth.user + '/login/' with { password: ... }
   on response 200, body='true', then set this.config.xauth.token to the x-auth-token header.
 */

                this.props.status = 'configuration'
                return [ inner, 15 ]
            }

            this.props.status = 'network'
            this.ua.fetch(
                { method : 'GET'
                , url    : this.config.server + '/v2/owner/' + this.config.xauth.user + '/device/'
                , headers : { 'X-AUTH-TOKEN' : this.config.xauth.token }
                }, async())
        }, function (body, response) {
            var devices

            if ((!response.okay) || (!body) || (typeof body !== 'object')) {
                this.logger.error('initialize'
                                  , { event : 'fetch', headers : response.headers, body : body })
                this.props.status = 'HTTP error ' + response.statusCode

                return [ inner, (response.statusCode < 500) ? 300 : 90 ]
            }

            underscore.keys(this.sensors).forEach(function (sensorID) {
                this.sensors[sensorID].seenP = false
            }.bind(this))

            devices = {}

            async.forEach(function (device) {
                async(function () {
                    this.ua.fetch(
                        { method  : 'GET'
                        , url     : this.config.server + '/v2/device/' + device.uuid
                                                      + '/datapoint/0/last/300/'
                        , headers : { 'X-AUTH-TOKEN' : this.config.xauth.token }
                        }, async())
                }, function (body, response) {
                    var capabilities, properties, sensor

                    if ((!response.okay) || (!body) || (typeof body !== 'object')) {
                        this.logger.error('initialize'
                                          , { event   : 'fetch'
                                            , uid     : device.uuid
                                            , name    : device.name
                                            , headers : response.headers
                                            , body    : body })
                        this.props.status = 'HTTP error ' + response.statusCode
                        return
                    }

                    sensor = this.sensors[device.uuid] || {}
                    sensor.seenP = true

                    sensor.name = device.name
                    if (!this.timestamps[device.uuid]) {
                        this.timestamps[device.uuid] = [ new Date().getTime() ]
                    }

                    sensor.lastReading = {}
                    capabilities = { fields : [] }

                    properties = this.normalize(device.uuid, body.sensors || []
                                              , body.datapoints ? body.datapoints[0] : [])
                    underscore.keys(properties).forEach(function (key) {
                        capabilities.fields.push(this.sensorType(key))
                        sensor.lastReading[key] = properties[key]
                    }.bind(this))

                    if ((this.timestamps[device.uuid][0] + 300) > this.timestamps[device.uuid][1]) return
                    this.timestamps[device.uuid].shift()

                    async(function () {
                        if (!!this.sensors[device.uuid]) return

                        this.register(this, sensor.name, device.uuid, capabilities, async())
                    }, function (sensorID) {
                        if (sensorID === false) return
                        if (!!sensorID) {
                            this.sensors[device.uuid] = underscore.extend(sensor, { sensorID : sensorID })
                        }

                        this.upsync(this, sensor.sensorID, sensor.lastReading, async())
                    })
                })
            })(body)
        }, function () {
            async.forEach(function (sensorID) {
                if (!!this.sensors[sensorID].seenP) return

                async(function () {
                    this.unregister(this, this.sensors[sensorID].sensorID, async())
                }, function () {
                    delete(this.sensors[sensorID])
                })
            })(underscore.keys(this.sensors))
        }, function () {
            return [ inner, 300 ]
        })()
    }, function (secs) {
        if (this.stopP) return [ outer ]

        this.props.status = 'idle'
        if (isNaN(secs)) secs = 300
        setTimeout(async(), secs * 1000)
    })()
})

Foobot.prototype.finalize = cadence(function (async) {/* jshint unused: false */
    this.props.status = 'finishing'
    this.stopP = true
})


/*
  sensors:      [     'time',     'pm',  'tmp',     'hum', 'co2', 'voc', 'allpollu' ]
  units:        [        's',  'ug/m3',    'C',      'pc', 'ppm', 'ppb',        '%' ]
  datapoints: [ [ 1436409630, 6.005001, 25.223, 47.589317,   943,   261,  25.433573 ] ]

 */
Foobot.prototype.normalize = function (uuid, fields, state) {
    var i, properties, result

    i = fields.length
    if (i > state.length) i = state.length
    properties = {}
    for (i--; i >= 0; i--) {
        properties[fields[i]] = state[i]
    }

    result = {}
    underscore.keys(properties).forEach(function (key) {
        var f
          , value = properties[key]

        key = { allpollu : 'aqi'
              , hum      : 'humidity'
              , pm       : 'particles.2_5'
              , time     : 'lastSample'
              , tmp      : 'temperature'
              }[key] || key

        f = { aqi         : function () { if (value > 500) value = 500
                                          return (value / 500)
                                        }
            , humidity    : function () { return (value / 100)                    }
            , lastSample  : function () { this.timestamps[uuid][1] = value * 1000 }.bind(this)
            , voc         : function () { return (value / 1000)                   }
            }[key]
        if (!!f) value = f()

        if ((typeof value !== 'undefined') && (this.sensorType(key))) result[key] = value
    }.bind(this))
    return result
}


module.exports = Foobot
