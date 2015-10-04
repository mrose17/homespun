var cadence     = require('cadence/redux')
  , oauth       = require('oauth')
  , path        = require('path')
  , underscore  = require('underscore')
  , util        = require('util')
  , Driver      = require(path.join(__dirname, 'prototype-driver.js'))

require('cadence/loops')


// jscs:disable requireMultipleVarDecl
var CubeSensors = function (config, services) {
    Driver.call(this, config, services)
}
// jscs:enable requireMultipleVarDecl
util.inherits(CubeSensors, Driver);


/*
   cf., https://my.cubesensors.com/docs
 */
CubeSensors.prototype.initialize = cadence(function (async) {
    var outer = async(function () {
        var inner, timestamp

        if (this.stopP) return [ outer ]

        timestamp = 0
        inner = async(function () {
            if ((!this.config.oauth) || (!this.config.oauth.oAuthAccessToken)) {
                this.props.status = 'configuration'
                return [ inner, 15 ]
            }

            if (!this.oauth) {
                this.oauth = new oauth.OAuth(this.config.server + '/auth/request_token'
                                            , this.config.server + '/auth/access_token'
                                            , this.config.consumerKey, this.config.consumerSecret, '1.0'
                                            , 'oob', 'HMAC-SHA1');
                this.oauth.setClientOptions({ requestTokenHttpMethod : 'GET'
                                            , accessTokenHttpMethod  : 'GET'
                                            });
            }

            this.props.status = 'network'
            this.oauth.getProtectedResource(this.config.server + '/v1/devices/', 'GET'
                                           , this.config.oauth.oAuthAccessToken
                                           , this.config.oauth.oAuthAccessSecret, async())
        }, function (body, response) {
            var devices

            response.okay = Math.floor(response.statusCode / 100) === 2
            try { body = JSON.parse(body) } catch (err) {}

            if ((!response.okay) || (!body) || (typeof body !== 'object') || (body.ok !== true)) {
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
                    this.oauth.getProtectedResource(this.config.server + '/v1/devices/' + device.uid
                                                                       + '/current'
                                                   , 'GET', this.config.oauth.oAuthAccessToken
                                                   , this.config.oauth.oAuthAccessSecret, async())
                }, function (body, response) {
                    var capabilities, properties, sensor

                    response.okay = Math.floor(response.statusCode / 100) === 2
                    try { body = JSON.parse(body) } catch (err) {}

                    if ((!response.okay) || (!body) || (typeof body !== 'object') || (body.ok !== true)) {
                        this.logger.error('initialize'
                                          , { event   : 'fetch'
                                            , uid     : device.uid
                                            , name    : device.extra.name
                                            , headers : response.headers
                                            , body    : body })
                        this.props.status = 'HTTP error ' + response.statusCode
                        return
                    }
                    if (body.results.length === 0) return

                    sensor = this.sensors[device.uid] || {}
                    sensor.seenP = true

                    sensor.name = device.extra.name

                    sensor.lastReading = {}
                    capabilities = { fields : [] }
                    properties = this.normalize(body.field_list, body.results[0])
                    underscore.keys(properties).forEach(function (key) {
                        capabilities.fields.push(this.sensorType(key))
                        sensor.lastReading[key] = properties[key]
                    }.bind(this))

                    async(function () {
                        if (!!this.sensors[device.uid]) return

                        this.register(this, sensor.name, device.uid, capabilities, async())
                    }, function (sensorID) {
                        if (sensorID === false) return
                        if (!!sensorID) {
                            this.sensors[device.uid] = underscore.extend(sensor, { sensorID : sensorID })
                        }

                        this.upsync(this, sensor.sensorID, sensor.lastReading, async())
                    })
                })
            })(body.devices)
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

CubeSensors.prototype.finalize = cadence(function (async) {/* jshint unused: false */
    this.props.status = 'finishing'
    this.stopP = true
})


/*
  field_list: [                 'time',  'temp', 'pressure', 'humidity', 'voc', 'light', 'noisedba', 'battery',    'rssi' ]
  units:                           UTC  C * 100       mbar          pct    ppm      lux   decibels         pct   strength
  results:  [ [ '2015-08-23T03:44:00Z',    2484,      1010,          38,   538,       0,        47,         97,       -74 ] ]

  also report voc_resistance?
*/

CubeSensors.prototype.normalize = function (fields, state) {
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

        if (key === 'noise') return

        key = { noisedba : 'noise'
              , rssi     : 'signal'
              , temp     : 'temperature'
              , time     : 'lastSample'
              , voc      : 'co2'            // actually CO2 + VOC
              }[key] || key

        f = { battery     : function () { return (value / 100)                               }
            , humidity    : function () { return (value / 100)                               }
            , lastSample  : function () { value = new Date(state[i]).getTime()
                                          if (!isNaN(value)) return value
                                        }
            , signal      : function () { value = (100 + value) / 100
                                          if ((value >= 0.0) && (value <= 1.0)) return value
                                        }
            , temperature : function () { return (value / 100)                               }
            }[key]
        if (!!f) value = f()

        if ((typeof value !== 'undefined') && (this.sensorType(key))) result[key] = value
    }.bind(this))
    return result
}


module.exports = CubeSensors
