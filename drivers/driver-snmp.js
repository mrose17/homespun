var cadence     = require('cadence/redux')
  , dgram       = require('dgram')
  , snmp        = require('snmp-native')
  , path        = require('path')
  , underscore  = require('underscore')
  , util        = require('util')
  , Driver      = require(path.join(__dirname, 'prototype-driver.js'))

require('cadence/loops')


// jscs:disable requireMultipleVarDecl
var SNMP = function (config, services) {
    Driver.call(this, config, services)

    this.timestamps = {}
}

var oidI = function (s) {
    return underscore.map(s.split('.'), function (n) { return +n })
}

var oidS = function (b) {
    return underscore.map(b, function (n) { return n.toString() }).join('.')
}
// jscs:enable requireMultipleVarDecl
util.inherits(SNMP, Driver);


SNMP.prototype.initialize = cadence(function (async) {/* jshint unused: false */
    var self = this

    this.stopP = false

    this.socket = dgram.createSocket('udp4').on('error', function (err) {
        self.logger.error('initialize', { event : 'createSocket', err : err.message })
        console.log(err.stack)
    }).on('message', function (buffer, rinfo) {
        var bindings, packet, session

        console.log('message from ' + JSON.stringify(rinfo))
        packet = snmp.parse(buffer)

        if ((!packet.pdu) || (packet.pdu.type !== 2) || (packet.pdu.error !== 0)
                || (!util.isArray(packet.pdu.varbinds)) || (packet.pdu.varbinds.length !== 3)) return

        bindings = packet.pdu.varbinds
        if (bindings[1].type !== 6) return

        if (oidS(bindings[1].value) != '1.3.6.1.4.1.17095') return

        console.log('SNMP: ' + bindings[0].value + ' : ' + bindings[2].value)

        session = new snmp.Session({ host : rinfo.address })
        session.getSubtree({ oid : oidI('1.3.6.1.4.1.17095.3') }, function (err, varbinds) {
            var name, properties

            if (!!err) {
                self.logger.error('initialize', { event : 'control', err : err.message }, rinfo)
                return console.log(err.stack)
            }

            name = '-'
            properties = {}
            varbinds.forEach(function (varbind) {
                var leaf = varbind.oid[varbind.oid.length - 2]
                if ((leaf % 4) === 1) name = varbind.value
                else if ((leaf % 4) === 2) {
                    underscore.extend(properties, self.normalize(name, varbind.value))
                }
            })
            console.log('SNMP: ' + util.inspect(properties, { depth : null }))
        })
        session.getSubtree({ oid : oidI('1.3.6.1.4.1.17095.11') }, function (err, varbinds) {
            var names, properties

            if (!!err) {
                self.logger.error('initialize', { event : 'sensorTable', err : err.message }, rinfo)
                return console.log(err.stack)
            }

            names = {}
            properties = {}
            varbinds.forEach(function (varbind) {
                var leaf    = varbind.oid[varbind.oid.length - 2]
                  , subtree = varbind.oid[varbind.oid.length - 3]

                if (leaf === 1) names[subtree] = varbind.value
                else if ((leaf === 2) && (!!names[subtree])) {
                    underscore.extend(properties, self.normalize(names[subtree], varbind.value))
                }
            })
            console.log('SNMP: ' + util.inspect(properties, { depth : null }))
        })
    }).on('listening', function () {
        var data, packet

        self.logger.info('initialize'
                        , { message : 'SNMP listening on broadcast udp://*' + ':' + this.address().port })
        this.setBroadcast(true)
        this.setTTL(10)

        packet = new snmp.Packet()
        // sysDescr.0, sysObjectID.0, and sysName.0
        packet.pdu.varbinds[0].oid = oidI('1.3.6.1.2.1.1.1.0')
        packet.pdu.varbinds[1] = underscore.extend({}, packet.pdu.varbinds[0]
                                                   , { oid : oidI('1.3.6.1.2.1.1.2.0') } )
        packet.pdu.varbinds[2] = underscore.extend({}, packet.pdu.varbinds[0]
                                                   , { oid : oidI('1.3.6.1.2.1.1.5.0') } )
        data = snmp.encode(packet)

        self.socket.send(data, 0, data.length, 161, '255.255.255.255', function (err, bytes) {/* jshint unused: false */
            if (!err) return

            self.logger.error('initialize', { event : 'send', err : err.message })
            console.log(err.stack)
        })
    })

    this.socket.bind(0)
})

SNMP.prototype.finalize = cadence(function (async) {/* jshint unused: false */
    this.props.status = 'finishing'
    this.stopP = true

    this.socket.close()
})


/*
  name:       Int. Temp/Ext. Temp | Airflow | Sound Meter | Humidity      | Water Detect    | Dust Sensor
              temperature         | airflow | noise       | humidity      | liquid_detected | particles.2_5
  units:      'C'                 | m/s     | dB          | RH-%  * 100   | boolean         | mg/m3
  datapoints: '26.51'             | '0.01'  | '48.93'     | '36.82' / 100 | 'DRY'           | '0.01'

*/
SNMP.prototype.normalize = function (name, value) {
    var f, key

    key = { Airflow        : 'airflow'
          , 'Dust Sensor'  : 'particles.2_5'
          , 'Ext. Temp'    : 'temperature'
          , Humidity       : 'humidity'
          , 'Int. Temp'    : 'temperature'
          , 'Sound Meter'  : 'noise'
          , 'Water Detect' : 'liquid_detect'
          }[name]
    if (!key) return

    f = { airflow         : function () { return parseFloat(value)         }
        , humidity        : function () { return (parseFloat(value) / 100) }
        , liquid_detect   : function () { return (value !== 'DRY')         }
        , noise           : function () { return parseFloat(value)         }
        , 'particles.2_5' : function () { return parseFloat(value)         }
        , temperature     : function () { return parseFloat(value)         }
        }[key]
    if (!f) return

    return underscore.object([ key ], [ f() ])
}


module.exports = SNMP
