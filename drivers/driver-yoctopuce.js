var cadence     = require('cadence/redux')
  , path        = require('path')
  , underscore  = require('underscore')
  , url         = require('url')
  , util        = require('util')
  , xml2js      = require('xml2js')
  , yapi        = require('yoctolib')
  , Driver      = require(path.join(__dirname, 'prototype-driver.js'))
  , Search      = require(path.join(__dirname, 'ssdp-search.js'))

require('cadence/loops')


// jscs:disable requireMultipleVarDecl
var Yoctopuce = function (config, services) {
    Driver.call(this, config, services)

    this.parser = new xml2js.Parser()
    this.hubs = {}
    this.nodes = {}

    setTimeout(this.ticktock.bind(this), 15 * 1000)
}
// jscs:enable requireMultipleVarDecl
util.inherits(Yoctopuce, Driver);


Yoctopuce.prototype.initialize = cadence(function (async) {/* jshint unused: false */
    new Search('upnp:rootdevice', 'YOCTOS/').on('DeviceAvailable', function (device) {
        var params = { ip : device.host, portno : device.port }

        if (!!this.nodes[device.host + ':' + device.port]) return
        this.nodes[device.host + ':' + device.port] = new Date().getTime() + (15 * 60 * 1000)

        this.examine(device, params, function (err) {
            if (!err) return

            this.logger.error('initialize', { event : 'examine', err : err.message }, params)
            console.log(err.stack)
        }.bind(this))
    }.bind(this)).on('error', function (err) {
        this.logger.error('initialize', { event : 'search', err : err.message })
        console.log(err.stack)
    }.bind(this))
})

Yoctopuce.prototype.ticktock = function () {
    var now = new Date().getTime()

    if (this.stopP) return
    underscore.keys(this.nodes).forEach(function (key) {
        if (this.nodes[key] <= now) delete(this.nodes[key])
    }.bind(this))
    setTimeout(this.ticktock.bind(this), 15 * 1000)
}

Yoctopuce.prototype.finalize = cadence(function (async) {
    this.props.status = 'finishing'
    this.stopP = true

    async.forEach(function (sensorID) {
        var sensor = this.sensors[sensorID]

        if (!!sensor.listener) sensor.listener.finalize(async())
    })(underscore.keys(this.sensors))
})


Yoctopuce.prototype.examine = cadence(function (async, device, params)  {
    async(function () {
        this.ua.fetch(
            { method : 'GET'
            , url    : device.ssdp.location
            }, async())
    }, function (body, response) {
        if (!response.okay) {
            return this.logger.error('examine', {
                event      : 'fetch'
              , method     : 'GET'
              , location   : device.ssdp.location
              , statusCode : response.statusCode
              , body       : body
            }, params)
        }

        this.parser.parseString(body, async())
    }, function (json) {
        var root = json && json.root && json.root.device && json.root.device[0]

        if (!root) {
            return this.logger.error('examine'
                                     , { event : 'parse', err : 'no device information' }, params)
        }
        if (root.deviceType[0] !== 'urn:yoctopuce-com:device:hub:1') return

        device.port = url.parse(device.ssdp.location).port
        device.name = root.friendlyName[0]
        device.uuid = root.UDN[0]
        this.launch(device, async())
    })
})


Yoctopuce.prototype.launch = cadence(function (async, device)  {
    var network, serialNumber, stmt
      , loser = function (event, body, response) {
                    delete(this.hubs[serialNumber])
                    this.logger.error('launch'
                                      , { event : 'event', headers : response.headers, body : body })
                    this.props.status = 'HTTP error ' + response.statusCode
                    return [ stmt ]
                }.bind(this)

    stmt = async(function () {
        this.ua.fetch(
            { method : 'GET'
            , url    : 'http://' + device.host + ':' + device.port + '/api.json'
            }, async())
    }, function (body, response) {
        var productName

        if ((!response.okay) || (!body)) return loser('api.json', body, response)

        productName = body.module.productName
        serialNumber = body.module.serialNumber
        network = body.network

        if (((productName !== 'VirtualHub') && (productName.indexOf('YoctoHub-') !== 0))
                || (!network)
                || (!!this.hubs[serialNumber])) return [ stmt ]

        this.hubs[serialNumber] = {}

        if (network.callbackMethod == yapi.Y_CALLBACKMETHOD_POST) return
        this.ua.fetch(
            { method : 'GET'
            , url    : 'http://' + device.host + ':' + device.port + '/api/network/callbackMethod?'
                         + 'callbackMethod=' + yapi.Y_CALLBACKMETHOD_POST
            }, async())
    }, function (body, response) {
        if ((!!response) && (!response.okay)) return loser('callbackMethod', body, response)

        if (network.callbackEncoding == yapi.Y_CALLBACKENCODING_YOCTO_API) return
        this.ua.fetch(
            { method : 'GET'
            , url    : 'http://' + device.host + ':' + device.port + '/api/network/callbackEncoding?'
                         + 'callbackEncoding=' + yapi.Y_CALLBACKENCODING_YOCTO_API
            }, async())
    }, function (body, response) {
        if ((!!response) && (!response.okay)) return loser('callbackEncoding', body, response)

        if (network.callbackMinDelay === 60) return
        this.ua.fetch(
            { method : 'GET'
            , url    : 'http://' + device.host + ':' + device.port + '/api/network/callbackMinDelay?'
                          + 'callbackMinDelay=' + 60
            }, async())
    }, function (body, response) {
        if ((!!response) && (!response.okay)) return loser('callbackMinDelay', body, response)

        if (network.callbackMaxDelay === 900) return
        this.ua.fetch(
            { method : 'GET'
            , url    : 'http://' + device.host + ':' + device.port + '/api/network/callbackMaxDelay?'
                          + 'callbackMaxDelay=' + 900
            }, async())
    }, function (body, response) {
        if ((!!response) && (!response.okay)) return loser('callbackMaxDelay', body, response)

        this.callback(device.host, 'POST', this.downcall.bind(this), async())
    }, function (location) {

        this.ua.fetch(
            { method : 'GET'
            , url    : 'http://' + device.host + ':' + device.port + '/api/network/callbackUrl?'
                          + 'callbackUrl=' + location
            }, async())
    }, function (body, response) {
        if ((!!response) && (!response.okay)) return loser('callbackUrl', body, response)

        this.ua.fetch(
            { method : 'GET'
            , url    : 'http://' + device.host + ':' + device.port + '/api/module/persistentSettings?'

                          + 'persistentSettings=1'
            }, async())
    }, function (body, response) {
        if ((!!response) && (!response.okay)) return loser('persistentSettings', body, response)

        this.hubs[serialNumber] = device

        return [ stmt ]
    })()
})

Yoctopuce.prototype.downcall = cadence(function (async, request) {
    var json = request.body

    if (!json) return

    async(function () {
        async.forEach(function (key) {
            var capabilities, module, sensor
              , entry = json[key]
              , k2s = function (key) {
                          capabilities.fields.push(this.sensorType(key))
                          return key
                      }.bind(this)

            if (key.indexOf('/bySerial/') !== 0) return
            module = entry.module

            sensor = this.sensors[module.serialNumber] || {}

            sensor.name = module.logicalName || module.serialNumber

            sensor.lastReading = {}
            capabilities = { fields : [] }

            underscore.keys(entry).forEach(function (key) {
                var f
                  , v = parseFloat(entry[key].advertisedValue)

                if (isNaN(v)) return

                if (key.indexOf('genericSensor') === 0) key = entry[key].unit
                f = { altitude      : function () { // meters
                                          sensor.lastReading[k2s('altitude')] = v
                                      }
                    , carbonDioxide : function () { // ppm
                                          sensor.lastReading[k2s('co2')] = v
                                      }
                    , co            : function () { // ppm
                                          sensor.lastReading[k2s('co')] = v
                                      }
                    , humidity      : function () { // RH-%
                                          sensor.lastReading[k2s('humidity')] = v / 100
                                      }
                    , lightSensor   : function () { // lux
                                          sensor.lastReading[k2s('light')] = v
                                      }
                    , no2           : function () { // ppm
                                          sensor.lastReading[k2s('no2')] = v
                                      }
                    , pressure      : function () { // millibars
                                          sensor.lastReading[k2s('pressure')] = v
                                     }
                    , temperature   : function () { // degrees-celcius
                                          sensor.lastReading[k2s('temperature')] = v
                                      }
                    , voc           : function () { // ppm
                                          sensor.lastReading[k2s('voc')] = v
                                     }
                    }[key]

                if (!!f) f()
            })

            if (capabilities.fields.length === 0) return

            async(function () {
                if (!!this.sensors[module.serialNumber]) return

                this.register(this, sensor.name, module.serialNumber, capabilities, async())
            }, function (sensorID) {
                if (sensorID === false) return
                if (!!sensorID) {
                    this.sensors[module.serialNumber] = underscore.extend(sensor, { sensorID : sensorID })
                }

                this.upsync(this, sensor.sensorID, sensor.lastReading, async())
            })
        })(underscore.keys(json))
    })
})


module.exports = Yoctopuce
