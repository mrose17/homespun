var dgram       = require('dgram')
  , events      = require('events')
  , util        = require('util')


// TBD: have one polling loop

// jscs:disable requireMultipleVarDecl
var Search = function (st, string) {
    var SSDP_SEARCH = new Buffer([
          'M-SEARCH * HTTP/1.1'
        , 'HOST: 239.255.255.250:1900'
        , 'ST: ' + st
        , 'MAN: "ssdp:discover"'
        , 'MX: 10'
        , ''
        , ''
    ].join('\r\n'))

    if (!(this instanceof Search)) return new Search(st, string)

    this.socket = dgram.createSocket('udp4').on('error', function (err) {
        this.emit('error', err);
        console.log(err.stack)
    }.bind(this)).on('message', function (buffer, rinfo) {
        var device, lines

        buffer = buffer.toString()
        if (buffer.indexOf(string) === -1) return

        device = {
            host : rinfo.address
          , port : rinfo.port
          , ssdp : {}
        }

        lines = buffer.split('\r\n')
        lines.forEach(function (line) {
            var x = line.indexOf(':')

            if (x !== -1) device.ssdp[line.substring(0, x).toLowerCase()] = line.substring(x + 1).trim()
        })

        this.emit('DeviceAvailable', device)
    }.bind(this)).on('listening', function () {
        this.socket.addMembership('239.255.255.250')
        this.socket.setMulticastLoopback(true)
        this.socket.setMulticastTTL(10)
        this.socket.send(SSDP_SEARCH, 0, SSDP_SEARCH.length, 1900, '239.255.255.250')

        this.timer = setInterval(function () {
            try {
                this.socket.send(SSDP_SEARCH, 0, SSDP_SEARCH.length, 1900, '239.255.255.250')
            } catch (err) {
            }
        }.bind(this), 30 * 1000)
    }.bind(this))

    this.socket.bind();
}
util.inherits(Search, events.EventEmitter)
// jscs:enable requireMultipleVarDecl


module.exports = Search
