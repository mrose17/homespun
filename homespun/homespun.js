var cadence     = require('cadence/redux')
  , fs          = require('fs')
  , logger      = require('prolific').createLogger('homespun.service')
  , path        = require('path')
  , underscore  = require('underscore')

require('cadence/loops')


// jscs:disable requireMultipleVarDecl
var Homespun = function (config) {
    this.config = config

    this.workers = { clouds : [], drivers : [] }
    this.clouds = {}
    this.drivers = {}
}
// jscs:enable requireMultipleVarDecl


Homespun.prototype.initialize = cadence(function (async, services) {
    this.services = services

    async(function () {
        fs.readdir(this.config.clouds, async())
    }, function (files) {
        async.forEach(function (file) {
            this.launch('cloud', file, async())
        })(files)
    }, function () {
        fs.readdir(this.config.drivers, async())
    }, function (files) {
        async.forEach(function (file) {
            this.launch('driver', file, async())
        })(files)
    })
})

Homespun.prototype.launch = cadence(function (async, prefix, file) {
    var module, worker
      , plural = prefix + 's'

    if ((file.indexOf(prefix + '-') !== 0) || (file.lastIndexOf('.js') !== (file.length - 3))) return

    worker = path.basename(file, '.js').substr(prefix.length + 1)
    if (worker.length === 0) return
    module = path.join(this.config[plural], file)

    async([ function () {
        async(function () {
            var config = { id : 1 }

            config[prefix] = worker
            this[plural][worker] = [ config ]

            fs.readFile(path.join(this.config.datastore, plural, worker + '.json'), 'utf8'
                        , async())
        }, function (body) {
            try {
                this[plural][worker] = JSON.parse(body)
            } catch (err) {
                throw new Error('ENOENT')
            }
        })
    }, /^ENOENT$/, function () {
    } ], function () {
        var init = function (moduleName) {
            return function (err) {
                if (!err) return

                logger.error('initialize'
                            , { event  : 'terminated'
                              , err    : err.message
                              , module : moduleName
                              })
                console.log(err.stack)
            }.bind(this)
        }.bind(this)

        async.forEach(function (config) {
            var instance
              , params = { type : prefix, worker : worker, id : config.id }

            logger.info('initialize', underscore.extend({ event : 'start' }, params))
            try {
                instance = new (require(module))(config, this.services)
                this.workers[plural].push(instance)

                instance.initialize(init(module))
            } catch (err) {
                logger.error('initialize'
                           , underscore.extend({ event : 'require', err : err.message }, params))
                console.log(err.stack)
                return
            }
            logger.info('initialize', underscore.extend({ event : 'running' }, params))
        })(this[plural][worker])
    })
})


Homespun.prototype.register = cadence(function (async, instance, name, uuid, capabilities) {
    async.forEach(function (cloud) {
        cloud.register.bind(cloud)(instance, name, uuid, capabilities, async())
    })(this.workers.clouds)
})

Homespun.prototype.unregister = cadence(function (async, instance, sensorID) {
    async.forEach(function (cloud) {
        cloud.unregister.bind(cloud)(instance, sensorID, async())
    })(this.workers.clouds)
})

Homespun.prototype.upsync = cadence(function (async, instance, sensorID, lastReading) {
    async.forEach(function (cloud) {
        cloud.upsync.bind(cloud)(instance, sensorID, lastReading, async())
    })(this.workers.clouds)
})

Homespun.prototype.persist = cadence(function (async, instance) {
    var id     = instance.id
      , prefix = (!!instance.cloud) ? 'cloud' : 'driver'
      , plural = prefix + 's'
      , worker = instance[prefix]

    async(function () {
        var offset = underscore.findIndex(this[plural][worker], function (entry) {
                         return (entry.id == id)
                     })
        if (offset !== -1) this[plural][worker].splice(offset, 1)
        this[plural][worker].splice(0, 0, instance)

        fs.writeFile(path.join(this.config.datastore, plural, worker + '.json')
                     , JSON.stringify(this[plural][worker], null, 2), async())
    })
})


module.exports = Homespun