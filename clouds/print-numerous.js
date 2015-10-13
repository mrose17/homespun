var cadence     = require('cadence/redux')
  , fs          = require('fs')
  , path        = require('path')
  , UserAgent   = require('vizsla')

require('cadence/loops')


// jscs:disable requireMultipleVarDecl
var traverse = cadence(function (async) {
    var config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'datastore', 'clouds'
                                                     , 'numerous.json')))
      , embeds = {}
      , token  = 'Basic ' + new Buffer(config[0].api_key + ':').toString('base64')
      , ua     =  new UserAgent()

    async(function () {
        var loop, url

        url = config[0].server + '/v2/users/me/metrics'
        loop = async(function () {
            ua.fetch(
                { method                      : 'GET'
                , url                         : url
                , headers                     :
                  { authorization             : token
                  }
                }, async())
            }, function (body, response) {
                if ((!response.okay) || (!body.metrics)) throw new Error('invalid response for metrics')

                body.metrics.forEach(function (metric) {
                    embeds[metric.id] = metric.links.embed
                })

                if (!body.nextURL) return [ loop ]
                url = body.nextURL
            })()
    }, function () {
        ua.fetch(
            { method                      : 'GET'
            , url                         : config[0].server + '/v2/users/me/prefs'
            , headers                     :
              { authorization             : token
              }
            }, async())
    }, function (body, response) {
        var prefix = '|<iframe src="'
          , suffix = '" width="250" height="250" frameBorder="0" seamless scrolling="no"></iframe>'

        if ((!response.okay) || (!body.sortOrder)) throw new Error('invalid response for prefs')

        JSON.parse(body.sortOrder).forEach(function (page) {
            var counter = 1
              , line    = '|-|-'

            console.log('|||')

            page.forEach(function (metricID) {
                if (!embeds[metricID]) return

                if (counter++ % 2) {
                    console.log(line + '|')
                    line = ''
                }

                line += prefix + embeds[metricID] + suffix
            })
            console.log(line + ((counter % 2) ? '|' : '||'))

            console.log('')
        })
    })
})
// jscs:enable requireMultipleVarDecl

traverse(function (err) {
    if (!err) return

    console.log(err.message)
    console.log(err.stack)
})
