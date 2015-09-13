# homespun
This is the root of the homespun family of repositories:
you run a server in your home that collects sensor readings and uploads them to the management cloud of your choice --
here's [my choice](https://github.com/homespun-wink).

Note that this repository does not have either the "Issues" or "Wiki" sections --
if you want to discuss the homespun framework,
please send an email to the [maintainer](mailto:mrose17@homespun.io)
requesting to be added to the [homespun team](https://homespun-io.slack.com).

## Theory of Operation
In your home,
you connect sensors to either a micro-controller (e.g., an [Arduino](https://www.arduino.cc))
or a micro-processor (e.g., a [Raspberry Pi](https://www.raspberrypi.org),
[BeagleBone Black](http://beagleboard.org/black),
or [BeagleBone Green](http://www.seeed.cc/beaglebone_green)).
Sensor readings are then sent to an "always-on" computer termed a "sensor platform".
The sensor platform then uploads these readings to a management cloud,
which can then be monitored, used as triggers for robots, and so on.

The sensor platform can be either an "always-on" spare computer such as a dedicated micro-processor.
The sensor platform should **never** be your desktop computer or a computer that isn't always on or has poor network access.

At present,
there is only one management cloud supported:
[Wink](http://wink.com/),
cf., [homespun-wink](https://github.com/homespun-wink).

Here is an end-to-end example:

            +--------------+ +--------------------+            +-----------------------+
            |    sensor    |-|  micro-controller  |  talks to  |   sensor platform     |
            |              |-|                    |  ------->  |                       |
            |  e.g. TMP36  |-|   e.g., Arduino    |            | running homespun-wink |
            +--------------+ +--------------------+            +-----------------------+
                                                                           |
        home network                                                       |
        --------------------------------------------------------------------------------
        the Internet                                                       |
                                                                           |
                                                                          \|/
                                                                 +--------------------+
                                                                 |   the wink cloud   |
                                                                 +--------------------+
                                                                          /|\
                                                                           |
                                                                           |
                                                                          \|/
                                                                 +--------------------+
                                                                 |    any wink app    |
                                                                 +--------------------+

There are many ways to [connect a sensor](http://playground.arduino.cc/Main/InterfacingWithHardware#Input)
to an Arudino.
In many cases,
you'll use a _shield_.
There are many sources of Arduino-compatible [shields](http://shieldlist.org).
There are also several good sources for shields and sensors,
e.g., [Maker Shed](http://www.makershed.com/collections/arduino-shields-accessories),
[Adafruit](https://www.adafruit.com/category/21),
and [Seeed Studio](http://www.seeedstudio.com/depot/Shield-t-2.html).

An alternative architecture is to attach the sensor directly to the sensor platform,
and have `homespun-wink` read directly from the GPIO pins or the USB port:

                             +---------------+ +-----------------------+
                             |    sensor     |-|   sensor platform     |
                             |               |-|                       |
                             |  e.g., TMP36  |-| running homespun-wink |
                             +---------------+ +-----------------------+
                                                           |
        home network                                       |
        ----------------------------------------------------------------
        the Internet                                       |
                                                           |
                                                          \|/
                                                 +--------------------+
                                                 |   the wink cloud   |
                                                 +--------------------+
                                                          /|\
                                                           |
                                                           |
                                                          \|/
                                                 +--------------------+
                                                 |    any wink app    |
                                                 +--------------------+

For the Raspberry Pi,
you may want use a _shield_ to connect a sensor.
There are many sources of RPi-compatible [shields](http://elinux.org/RPi_Expansion_Boards).
There are also several good sources for shields and sensors,
e.g., [Maker Shed](http://www.makershed.com/collections/raspberry-pi-shields-accessories),
[Adafruit](https://www.adafruit.com/category/35),
[Dexter Industries](http://www.dexterindustries.com/shop/grovepi-board/),
[MikroElectronika](http://www.mikroe.com/click/pi2-shield/),
and [Seeed Studio](http://www.seeedstudio.com/depot/Sensors-c-25/).

For the BeagleBone Black,
generally you'll use a _cape_ to connect a sensor.
When looking at the [list of capes](http://elinux.org/Beagleboard:BeagleBone_Capes)
keep in mind that not all are compatible with the BB Black.
Several of these capes support multiple sensors.
For example,
the [mikroBUS cape](http://beagleboard.org/project/mikrobus) supports over a hundred different
[click boards](http://www.mikroe.com/click/).

There is a [Grove Cape](http://www.seeedstudio.com/depot/Grove-Cape-for-BeagleBone-Series-p-1718.html) for the BeagleBone
series,
that has six connectors for the [Grove family of sensors](http://www.seeedstudio.com/wiki/Grove_System/).
Alternatively,
the BeagleBone Green comes with two onboard Grove connectors!

If you're interested in USB sensors,
[Yoctopuce](http://www.yoctopuce.com) makes a wide range of _prosumer_ (Swiss-made) sensors:

* [Environmental](http://www.yoctopuce.com/EN/products/category/usb-environmental-sensors)
* [Electrical](http://www.yoctopuce.com/EN/products/category/usb-electrical-sensors)
* [Electrical Interfaces](http://www.yoctopuce.com/EN/products/category/usb-electrical-interfaces)
* [Positional](http://www.yoctopuce.com/EN/products/category/usb-position-sensors)

You can also plug the Yoctopuce sensors into an Ethernet or Wi-Fi hub to make the readings available on your local network.

Finally,
you may already have a sensor in your home that talks to a third-party cloud service,
but isn't integrated with Wink.
(By the way:
a cloud vendor really should integrate directly with a management cloud -- if you're a customer of one of these providers,
why not ask them to integrate with Wink?)
If the vendor already has a consumer API,
you could use this architecture:

            +--------------+                                   +-----------------------+
            |    sensor    |    talks to          talks to     |   sensor platform     |
            |              |  ------------+    +-------------  |                       |
            |  e.g. TMP36  |              |    |               | running homespun-wink |
            +--------------+              |    |               +-----------------------+
                                          |    |                            |
        home network                      |    |                            |
        --------------------------------------------------------------------------------
        the Internet                      |    |                            |
                                          |    |                            |
                                         \|/  \|/                          \|/
                                     +----------------+           +-------------------+
                                     | vendor's cloud |           |   the wink cloud  |
                                     +----------------+           +-------------------+
                                                                           /|\
                                                                            |
                                                                            |
                                                                           \|/
                                                                  +-------------------+
                                                                  |    any wink app   |
                                                                  +-------------------+

## Management Clouds
`homespun-wink` is a Node.js module that supports several
[drivers](https://github.com/mrose17/homespun-wink#supported-drivers).

It is easiest to integrate using [TSRP](http://thethingsystem.com/dev/Thing-Sensor-Reporting-Protocol.html).
At present,
there are two repositories that contain TSRP transcoders:

* [homespun-arduino](https://github.com/mrose17/homespun-arduino), which contains examples sketches for the
[Arduino Ethernet](https://www.arduino.cc/en/Main/ArduinoBoardEthernet); and,

* [homespun-grovepi](https://github.com/mrose17/homespun-grovepi), a Node.js module for the
[Raspberry Pi](https://www.raspberrypi.org) and a [GrovePi+ Shield](http://www.dexterindustries.com/shop/grovepi-board/).

`homespun-wink` also knows how to [talk to Yoctopuce sensors](https://github.com/mrose17/homespun-wink#yoctopuce).
It also knows how to talk to the 
[CubeSensors](https://cubesensors.com),
[Foobot](http://foobot.io),
and
[Netatmo](https://www.netatmo.com/en-US/product/weather-station)
clouds,
although configuration isn't automated as it is with the TSRP and Yoctopuce drivers.

## Measurement Taxonomy
The homespun family divides the "sensor world" into three parts:
unit-based,
percentage-based,
.σ-based.

### Unit-based
Unit-based sensors report values that are based on some kind of standardized metric:

|property|SI or derived units|expressed using|
|-|-|
|altitude|meters|float|
|airflow|meters/second|float|
|co|ppm|float|
|co2|ppm|float|
|distance|meters|float|
|gustheading|degrees|float|
|gustvelocity|meters/second|float|
|hcho|ppm|float|
|hydrogen|ppm|float|
|light|lux|float|
|location|coordinates|quad|
|methane|ppm|float|
|no|ppm|float|
|no2|ppm|float|
|noise|decibels|float|
|particles.2_5|micrograms/cubicmeters|float|
|particulates|particles/cubicmeters|float|
|pH|pH|float|
|pressure|millibars|float|
|rainfall|millimeters|float|
|smoke|ppm|float|
|temperature|celcius|float|
|uvi|uv-index|float|
|vapor|ppm|float|
|velocity|meters/second|float|
|voc|ppm|float|
|windheading|degrees|float|
|windvelocity|meters/second|float|

### Percentage-based or Boolean-based
Percentage-based sensors report values that are based on a ratio,
either as a `float` in the range 0.0 to 1.0, or as a boolean.
In the case of a ratio,
the value being reported refers to the sensor's reporting range:

|property|expressed using|
|-|-|
|aqi|percentage|
|battery|percentage|
|brightness|percentage|
|flame_detected|boolean|
|humidity|percentage|
|liquid_detected|boolean|
|moisture|percentage|
|motion|boolean|
|opened|boolean|
|powered|boolean|
|pressed|boolean|
|signal|percentage|
|sonority|percentage|
|tamper_detected|boolean|
|vibration|boolean|

### σ-based
Sensors that report uncalibrated data,
are useful only in the context of previous data.
These raw values are reported directly (typed as "epsilon")
which transcodes them into standard deviation values that are uploaded to the management cloud (typed as "sigmas"):

|property|raw value|
|-|
|aqi.σ|aqi.ε|
|co.σ|co.ε|
|co2.σ|co2.ε|
|flow.σ|flow.ε|
|gas.σ|gas.ε|
|hcho.σ|hcho.ε|
|hydrogen.σ|hydrogen.ε|
|methane.σ|methane.ε|
|no.σ|no.ε|
|no2.σ|no2.ε|
|smoke.σ|smoke.ε|
|vapor.σ|vapor.ε|
