var underscore  = require('underscore')
  , Driver      = require('./prototype-driver')


console.log('|property|SI or derived units|expressed using|')
console.log('|-|-|')
underscore.keys(Driver.sensorTypes).forEach(function (key) {
    var sensorType = Driver.sensorTypes[key]

    if ((!sensorType.units) || (sensorType.units === 'sigmas')) return

    console.log('|' + sensorType.field + '|' + sensorType.units + '|' + sensorType.type + '|')
})
console.log('')

console.log('|property|expressed using|')
console.log('|-|-|')
underscore.keys(Driver.sensorTypes).forEach(function (key) {
    var sensorType = Driver.sensorTypes[key]

    if (!sensorType.units) console.log('|' + sensorType.field + '|' + sensorType.type + '|')
})
console.log('')

console.log('|property|raw value|')
console.log('|-|')
underscore.keys(Driver.sensorTypes).forEach(function (key) {
    var x
      , raw        = ''
      , sensorType = Driver.sensorTypes[key]

    if (sensorType.units !== 'sigmas') return
    x = sensorType.field.lastIndexOf('.σ')
    if (x !== -1) raw = sensorType.field.substr(0, x) + '.ε'

    console.log('|' + sensorType.field + '|' + raw + '|')
})
console.log('')

