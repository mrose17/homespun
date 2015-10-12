var npminfo
  , fs          = require('fs')
  , os          = require('os')
  , path        = require('path')
  , UserAgent   = require('vizsla')


// jscs:disable requireMultipleVarDecl
var Cloud = function (config, services) {
    var homespun = services.homespun

    this.config = config
    if (!this.config.devices) this.config.devices = {}
    this.services = services

    this.persist = homespun.persist.bind(homespun)

    this.props = { status : 'configuration' }
    this.readyP = false
    this.stopP = false

    this.ua = new UserAgent()
    this.npminfo = npminfo
    this.version = 'Manufacturer/' + os.platform() + ' node/' + process.versions.node + ' homespun/'
                   + ((!!this.npminfo) ? this.npminfo.version : 'unknown')

    this.logger = require('prolific').createLogger(config.cloud + '.cloud-' + config.id)
}
// jscs:enable requireMultipleVarDecl


try { npminfo = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'))) } catch (err) {}

module.exports = Cloud
