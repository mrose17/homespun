var cadence     = require('cadence/redux')
  , path        = require('path')
  , querystring = require('querystring')
  , underscore  = require('underscore')
  , util        = require('util')
  , Driver      = require(path.join(__dirname, 'prototype-driver.js'))

require('cadence/loops')


// jscs:disable requireMultipleVarDecl
var Netatmo = function (config, services) {
    Driver.call(this, config, services)

    this.timestamps = {}
}
// jscs:enable requireMultipleVarDecl
util.inherits(Netatmo, Driver);


/*
   cf., https://dev.netatmo.com/doc/methods/devicelist
 */
Netatmo.prototype.initialize = cadence(function (async) {
    var outer = async(function () {
        var inner, timestamp

        if (this.stopP) return [ outer ]

        timestamp = 0
        inner = async(function () {
            if ((!this.config.oauth2) || (!this.config.oauth2.access_token)) {
                this.props.status = 'configuration'
                return [ inner, 15 ]
            }

            this.props.status = 'network'
            this.ua.fetch(
                { method : 'GET'
                , url    : this.config.server + '/api/devicelist?'
                              + querystring.stringify({ access_token : this.config.oauth2.access_token })
                }, async())
        }, function (body, response) {
            var devices

            if ((!!body) && (!!body.error)) {
                this.logger.error('initialize', { event : 'fetch', body : body })
                this.props.status = 'error'
                if (response.statusCode >= 500) return [ inner, 90 ]

                async(function () {
                    this.refreshToken(async())
                }, function () {
                    return [ inner, 0 ]
                })
            }
            if ((!response.okay) || (!body) || (body.status !== 'ok')) {
                this.logger.error('initialize'
                                  , { event : 'fetch', headers : response.headers, body : body })
                this.props.status = body.status || ('HTTP error ' + response.statusCode)

                return [ inner, (response.statusCode < 500) ? 300 : 90 ]
            }
            this.props.status = body.status

            underscore.keys(this.sensors).forEach(function (sensorID) {
                this.sensors[sensorID].seenP = false
            }.bind(this))

            devices = {}
            underscore.union(body.body.devices, body.body.modules).forEach(function (device) {
                if ({ NAMain    : true // base station
                    , NAModule1 : true // outdoor module
                    , NAModule2 : true // wind gauge module
                    , NAModule3 : true // rain gauge module
                    , NAModule4 : true // indoor module
                    }[device.type]) devices[device._id] = device
            })

            async.forEach(function (netatmoID) {
                var capabilities, g, sensor
                  , device = devices[netatmoID]
                  , k2s = function (key) {
                              capabilities.fields.push(this.sensorType(key))
                              return key
                          }.bind(this)
                  , v2s = function (value, ranges) {
                              var i

                              for (i = 0; i < ranges.length; i++) {
                                  if (value >= ranges[i].t) return ranges[i].s
                              }
                    }

                sensor = this.sensors[device._id] || {}
                sensor.seenP = true

                sensor.name = device.station_name || devices[device.main_device].station_name
                if (!!device.module_name) sensor.name += ' - ' + device.module_name
                if (!this.timestamps[device._id]) {
                    this.timestamps[device._id] = [ new Date().getTime() ]
                }

                sensor.lastReading = {}
                capabilities = { fields : [] }

                if (!!device.rf_status) {
                    sensor.lastReading.signal = v2s(device.rf_status, [ { s :  0.25, t : 90 }
                                                                      , { s :  0.50, t : 80 }
                                                                      , { s :  0.75, t : 71 }
                                                                      ]) ||    1.00
                } else {
                    sensor.lastReading.signal = v2s(device.wifi_status, [ { s : 0.25, t : 86 }
                                                                        , { s : 0.50, t : 71 }
                                                                        ]) ||   1.00
                }
                k2s('signal')

                g = { NAModule1 : [ { s : 1.0, t : 5500 }
                                  , { s : 0.8, t : 5000 }
                                  , { s : 0.5, t : 4500 }
                                  , { s : 0.2, t : 4000 }
                                  ]
                    , NAModule2 : [ { s : 1.0, t : 5590 }
                                  , { s : 0.8, t : 5180 }
                                  , { s : 0.5, t : 4770 }
                                  , { s : 0.2, t : 4360 }
                                  ]
                    , NAModule3 : [ { s : 1.0, t : 5500 }
                                  , { s : 0.8, t : 5000 }
                                  , { s : 0.5, t : 4500 }
                                  , { s : 0.2, t : 4000 }
                                  ]
                    , NAModule4 : [ { s : 1.0, t : 5640 }
                                  , { s : 0.8, t : 5280 }
                                  , { s : 0.5, t : 5280 }
                                  , { s : 0.2, t : 5280 }
                                  ]
                    }[device.type]
                if (!!g) {
                    sensor.lastReading.battery = v2s(device.battery_vp, g) || 0.0
                    k2s('battery')
                }

                underscore.keys(device.dashboard_data).forEach(function (key) {
                    var v = device.dashboard_data[key]
                      , f = { CO2              : function () { // pars-per-million
                                                     sensor.lastReading[k2s('co2')] = v
                                                 }
                            , GustAngle        : function () { // angular-degrees
                                                     sensor.lastReading[k2s('gustheading')] = v
                                                 }
                            , GustStrength     : function () { // kilometers/hour
                                                     sensor.lastReading[k2s('gustvelocity')] = v
                                                 }
                            , Humidity         : function () { // RH-%
                                                     sensor.lastReading[k2s('humidity')] = v / 100
                                                 }
                            , Noise            : function () { // decibels
                                                     sensor.lastReading[k2s('noise')] = v
                                                 }
                            , Pressure         : function () { // millibars
                                                     sensor.lastReading[k2s('pressure')] = v
                                                 }
                            , Rain             : function () { // millimeters
                                                     sensor.lastReading[k2s('rainfall')] = v
                                                 }
                            , Temperature      : function () { // degrees-celcius
                                                     sensor.lastReading[k2s('temperature')] = v
                                                 }
                            , WindAngle        : function () { // angular-degrees
                                                     sensor.lastReading[k2s('windheading')] = v
                                                 }
                            , WindStrength     : function () { // kilometers/hour
                                                     sensor.lastReading[k2s('windvelocity')] = v
                                                 }
                            , time_utc         : function () { // seconds since epoch
                                                     if (v <= 0) v = this.timestamps[device._id][0] / 1000
                                                     this.timestamps[device._id][1] = v * 1000
                                                     if (timestamp < v) timestamp = v
                                                 }
                            }[key]

                    if (!!f) f.bind(this)()
                }.bind(this))

                if (this.timestamps[device._id][0] >= this.timestamps[device._id][1]) return
                this.timestamps[device._id].shift()

                async(function () {
                    if (!!this.sensors[device._id]) return

                    this.register(this, sensor.name, device._id, capabilities, async())
                }, function (sensorID) {
                    if (sensorID === false) return
                    if (!!sensorID) {
                        this.sensors[device._id] = underscore.extend(sensor, { sensorID : sensorID })
                    }

                    this.upsync(this, sensor.sensorID, sensor.lastReading, async())
                })
            })(underscore.keys(devices))
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
            var delta

            if (timestamp > 0) {
                delta = timestamp - (new Date().getTime() / 1000)
                if (delta > 0) delta = 0
                delta += 15 * 60
            }

            return [ inner, delta > 0 ? delta : ((10 * 60) + 5) ]
        })()
    }, function (secs) {
        if (this.stopP) return [ outer ]

        this.props.status = 'idle'
        if (isNaN(secs)) secs = (10 * 60 + 5)
        setTimeout(async(), secs * 1000)
    })()
})

Netatmo.prototype.finalize = cadence(function (async) {/* jshint unused: false */
    this.props.status = 'finishing'
    this.stopP = true
})


/*
   cf., https://dev.netatmo.com/doc/authentication/refreshtoken
 */
Netatmo.prototype.refreshToken = cadence(function (async) {
    async(function () {
        this.props.status = 'refresh'

        this.ua.fetch(
            { method  : 'POST'
            , url     : this.config.server + '/oauth2/token'
            , headers : { 'content-type'   : 'application/x-www-form-urlencoded;charset=UTF-8' }
            , payload : new Buffer(querystring.stringify(
                            { grant_type    : 'refresh_token'
                            , refresh_token : this.config.oauth2.refresh_token
                            , client_id     : this.config.clientID
                            , client_secret : this.config.secret
                            }))
            }, async())
    }, function (body, response) {
        if ((response.okay) && (!!body)) underscore.extend(this.config.oauth2, body)
        else {
            this.logger.error('refreshToken'
                              , { event : 'fetch', headers : response.headers, body : body })
            this.props.status = body.status || ('HTTP error ' + response.statusCode)
            this.stopP = true
            delete(this.config.oauth2)
        }

        this.persist(this.config, async())
    })
})


// TBD: add methods for /authorize, /token, and comparison to existing user account...


module.exports = Netatmo
