/*
    ___ usage: en_US ___
    usage: node server.js

      Launch an amalgamated agent configured and monitored by a wrapper process.

    options:

      -d, --dryrun
        dry run to display configuration
    ___ usage ___
*/

var cadence  = require('cadence/redux')
  , logger   = require('prolific').createLogger('nsp.server')
  , path     = require('path')
  , server   = require('./process/server')
  , url      = require('url')

require('cadence/loops')


require('arguable/executable')(module, cadence(function (async) {
    var loop
      , config = {
          start              : 'homespun,listener'
        , tags               : 'tags'
        , clouds             : path.join(__dirname, 'clouds')
        , datastore          : path.join(__dirname, 'datastore')
        , drivers            : path.join(__dirname, 'drivers')
        , sandbox            : path.join(__dirname, 'sandbox')
        , templates          : path.join(__dirname, 'templates')
/* comment out for output on stdout
        , log                : path.join('/', 'tmp', 'nsp.log')
 */
        , dryrun             : false
        , listener           : url.format(
          {
            protocol         : 'http'
          , slashes          : true
          , hostname         : '0.0.0.0'
          , port             : 8889
          })
        }

    async(function () {
        logger.info('start', { params : config })
    }, function () {
        loop = async(function () {
            if (config.dryrun) {
                console.log(config)
                return [ loop ]
            }
            server(config, async())
        })
    })
}))
