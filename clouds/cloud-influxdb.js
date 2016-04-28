var cadence     = require('cadence/redux')
  , influx      = require('influx')
  , path        = require('path')
  , underscore  = require('underscore')
  , util        = require('util')
  , Cloud       = require(path.join(__dirname, 'prototype-cloud.js'))

require('cadence/loops')


// jscs:disable requireMultipleVarDecl
var InfluxDB = function (config, services) {
    Cloud.call(this, config, services)
}
// jscs:enable requireMultipleVarDecl
util.inherits(InfluxDB, Cloud);


InfluxDB.prototype.initialize = cadence(function (async) {
    var loop = async(function () {
        if (this.stopP) return [ loop ]

// TBD: use this.config.url
        if (!this.client) this.client = influx({ host     : '127.0.0.1'
                                               , database : 'homespun'
                                               })

        this.client.createDatabase('homespun', async())
    }, function () {
        this.props.status = 'idle'
        this.readyP = true
        return [ loop ]
    })()
})

InfluxDB.prototype.finalize = cadence(function (async) {/* jshint unused: false */
    this.props.status = 'finishing'
    this.stopP = true
})


InfluxDB.prototype.register = cadence(function (async, instance, name, uuid, capabilities) {
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
                  , label     = name
                  , precision = 3
                  , units     = field.abbrev || field.units
                  , tags      = {}

                if (units === 'celcius') {
                    kind = 'temperature'
                    units = '°F'
                } else if (kind === 'percent') {
                    label = name
                    units = field.name || key
                    precision = 2
                } else if (units === 'sigmas') {
                    label = name
                    units = field.name || key
                }
                if (!kind) return

                tags = { sensor : label, units : units }

                device.entries[key] = { seriesName : field.name || key
                                      , label      : label
                                      , tags       : tags
                                      }
            })
        })(capabilities.fields)
    }, function () {
        this.config.devices[deviceID] = device
        this.persist(this.config, async())
    }, function () {
        this.props.status = 'idle'
        return [ stmt, true ]
    })()
})

InfluxDB.prototype.unregister = cadence(function (async, instance, sensorID) {/* jshint unused: false */
    var device

    if (!this.readyP) return

    device = this.config.devices[sensorID]
    if (!device) return this.logger.error('unregister', { event : 'lookup', sensorID : sensorID })

    async(function () {
        device.entries.forEach(function (entry) {
            async(function () {
                this.client.queryDB('DROP SERIES FROM "' + entry.seriesName + '" WHERE sensor="'
                                  + entry.label.replace(/ /g, '\\ ').replace(/,/g, '\\,') + '"', async())
            })
        }.bind(this))
    }, function () {
        delete(this.config.devices[sensorID])
        this.persist(this.config, async())
    })
})

InfluxDB.prototype.upsync = cadence(function (async, instance, sensorID, lastReading) {/* jshint unused: false */
    var device

    if (!this.readyP) return

    device = this.config.devices[sensorID]
    if (!device) return this.logger.error('upsync', { event : 'lookup', sensorID : sensorID })

    async.forEach(function (key) {
        var entry = device.entries[key]
          , value = lastReading[key]

        if (!entry) return

        async(function () {
            this.client.writePoint(entry.seriesName, value, entry.tags, async())
        })
    })(underscore.keys(lastReading))
})


module.exports = InfluxDB
