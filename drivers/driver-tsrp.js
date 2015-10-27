var cadence     = require('cadence/redux')
  , dgram       = require('dgram')
  , path        = require('path')
  , underscore  = require('underscore')
  , util        = require('util')
  , Driver      = require(path.join(__dirname, 'prototype-driver.js'))

require('cadence/loops')


// jscs:disable requireMultipleVarDecl
var TSRP = function (config, services) {
    Driver.call(this, config, services)

    this.depth = {}
    this.prototypes = {}
    this.reports = {}
    this.timestamps = {}
}
// jscs:enable requireMultipleVarDecl
util.inherits(TSRP, Driver)


TSRP.prototype.initialize = cadence(function (async) {/* jshint unused: false */
    var ipaddr = '224.0.9.1'
      , portno = 22601
      , self   = this

    this.socket = dgram.createSocket('udp4').on('message', function (message, rinfo) {
        var now, report, tag

        tag = rinfo.address + ':' + rinfo.port
        try { report = JSON.parse(message) } catch (err) {
            return self.logger.error('initialize', { event : 'TSRP parse', diagnostic : err.message })
        }

        if (!self.reports[tag]) self.reports[tag] = []
        now = new Date().getTime()
        if (!self.timestamps[tag]) self.timestamps[tag] = now
        if (self.timestamps[tag] > now) return
        self.reports[tag].push(report)

        if ((self.reports[tag].length > 1) || (self.depth[tag] > 0)) return

        self.drain(rinfo, tag, function (err) {
            if (!err) return

            delete(self.reports[tag])
            self.logger.error('initialize', { event : 'drain', err : err.message }, rinfo)
            console.log(err.stack)
        })
    }.bind(this)).on('listening', function () {
        var address = this.address()

        self.logger.info('initialize'
                        , { message : 'TSRP listening on multicast udp://' + ipaddr + ':'
                                          + address.port })
        try { this.addMembership(ipaddr) } catch (err) {
            self.logger.error('initialize', { event : 'addMembership', diagnostic : err.message })
        }
        try { this.setMulticastLoopback(true) } catch (err) {
            self.logger.error('initialize', { event : 'setMulticastLoopback', diagnostic : err.message })
        }
    }).on('close', function () {
        self.logger.info('finalize', { message : 'TSRP closed' })
    }).on('error', function (err) {
        self.logger.error('initialize', { event : 'socket', diagnostic : err.message })
    }).bind(portno, ipaddr)
})

TSRP.prototype.finalize = cadence(function (async) {/* jshint unused: false */
    this.props.status = 'finishing'
    this.stopP = true

    this.socket.close()
})


TSRP.prototype.drain = cadence(function (async, device, tag) {
    var outer = async(function () {
        var report

        if (this.reports[tag].length === 0) {
            this.timestamps[tag] = new Date().getTime() + (30 * 1000)
            return [ outer ]
        }

        if (!this.depth[tag]) this.depth[tag] = 0

        report = underscore.last(this.reports[tag])
        this.reports[tag] = []

        this.examine(device, tag, report, async())
    }, function () {
        var inner = async(function () {
            if (this.depth[tag] === 0) return [ inner ]

            setTimeout(async(), 100)
        })()
    })()
})

TSRP.prototype.examine = cadence(function (async, device, tag, report) {
    var self = this

    if (!this.prototypes[device.address]) this.prototypes[device.address] = {}

    underscore.keys(report.things).forEach(function (key) {
        var capabilities, properties
          , thing = report.things[key]

        if (underscore.keys(thing.prototype).length !== 0) {
            capabilities = { fields : [] }
            underscore.keys(thing.prototype.properties).forEach(function (name) {
                var property

                if ((thing.prototype.properties[name] === 'epsilon')
                        && (name.indexOf('.ε') === -1)) name += '.σ'
                property = self.sensorType(name)
                if (!!property) capabilities.fields.push(property)
            })
            if (capabilities.fields.length === 0) {
                return self.logger.warn('examine'
                                       , { message    : 'no recognizable capabilities'
                                         , properties : underscore.keys(thing.prototype.properties)
                                         })
            }

            thing.prototype.capabilities = capabilities
            self.prototypes[device.address][key] = thing.prototype
        } else if ((!!self.prototypes[device.address]) && (!!self.prototypes[device.address][key])) {
            capabilities = self.prototypes[device.address][key].capabilities
        } else {
            return self.logger.warn('examine', { message : 'TSRP runt' })
        }
        properties = self.prototypes[device.address][key].properties

        self.depth[tag] = thing.instances.length
        thing.instances.forEach(function (instance) {
            var sensor = self.sensors[instance.unit.udn] || { sigmas : {} }

            if (instance.status !== 'present') return

            sensor.name = instance.name
            sensor.lastReading = {}
            capabilities.fields.forEach(function (property) {
                var name = property.field

                // if we added the '.σ' suffix earlier
                if ((typeof instance.info[name] === 'undefined') && (name.indexOf('.σ') !== -1)) {
                    name = name.slice(0, -2)
                }

                if (typeof instance.info[name] !== 'undefined') {
                    if ((properties[name] === 'epsilon') && (name.indexOf('.ε') === -1)) {
                        if (!sensor.sigmas[name]) sensor.sigmas[name] = new Sigma()
                        try {
                            sensor.lastReading[name + '.σ'] = sensor.sigmas[name].add(instance.info[name])
                        } catch (err) {}
                        return
                    }

                    sensor.lastReading[name] = instance.info[name]
                }
            })

            async(function () {
                if (!!self.sensors[instance.unit.udn]) return

                self.register(self, sensor.name, instance.unit.udn, capabilities, async())
            }, function (sensorID) {
                if (!!sensorID) {
                    self.sensors[instance.unit.udn] = underscore.extend(sensor, { sensorID : sensorID })
                }
                self.depth[tag]--

                self.upsync(self, sensor.sensorID, sensor.lastReading, async())
            })
        })
    })
})


// jscs:disable requireMultipleVarDecl
var Sigma = function () {
  this.n = 0
  this.sum = 0
  this.sumsq = 0
};
// jscs:enable requireMultipleVarDecl


Sigma.prototype.add = function (v) {
  var mu, sigma, sigmas

  this.n++
  this.sum += v
  this.sumsq += v * v

  if (this.n < 2) throw new Error('not yet')

  mu = this.sum / this.n
  sigma = Math.sqrt((this.sumsq - (this.sum * this.sum / this.n)) / (this.n - 1))
  sigmas = (v - mu) / sigma

  return (isNaN(sigmas) ? 0 : sigmas)
};


module.exports = TSRP
