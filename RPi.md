# Node on the RPi
If you already have your Raspberry Pi configured and have installed Node.js and `node-gyp` you can skip these instructions.

## Configure the RPi
There are certain tasks that must be done **immediately** when bringing up new RPi system.

First,
we connect to the platform via `ssh` -- the username (`pi`) and passphrase(`raspberry`) are the defaults
(we'll fix that momentarily):

        % ssh pi@raspberrypi.local
        pi@raspberrypi.local's password: raspberry
        ...
        pi@raspberrypi ~ $

Now configure the timezone:

        pi@raspberrypi ~ $ sudo raspi-config

Select option `4` ("Internationalization Options") and then `I2` ("Change Timezone") to set your timezone.

The next thing to do is make sure the platform is current with respect to its packages:

        pi@raspberrypi ~ $ sudo apt-get update
        ...
        pi@raspberrypi ~ $ sudo apt-get upgrade -y
        ...
        pi@raspberrypi ~ $ sudo reboot

These commands may take a while.
Please be patient.

Second,
let's fix the default password.
Generate an `ssh` keypair on your desktop:

        % ssh-keygen -b 4096 -t rsa 
        ...
        Enter file in which to save the key (/Users/apple/.ssh/id_rsa): /Users/apple/.ssh/id_homespun
        Enter passphrase (empty for no passphrase):
        Enter same passphrase again:
        Your identification has been saved in /Users/apple/.ssh/id_homespun.
        Your public key has been saved in /Users/apple/.ssh/id_homespun.pub.
        ...

Create the `.ssh` directory on the platform:

        pi@raspberrypi ~ $ mkdir -p ~/.ssh
        pi@raspberrypi ~ $ chmod 700 ~/.ssh

Copy the public key from your desktop to the platform:

        % ssh pi@raspberrypi.local 'cat >> .ssh/authorized_keys' < ~/.ssh/id_homespun.pub
        pi@raspberrypi.local's password: raspberry

Configure the platform so that only `ssh` with a private key is allowed:

        pi@raspberrypi ~ $ sudo vi /etc/ssh/sshd_config

and change these two lines:

        # Change to no to disable tunnelled clear text passwords
        #PasswordAuthentication yes

to this:

        # do not allow plaintext passwords
        PasswordAuthentication no

Finally, run this:

        pi@raspberrypi ~ $ sudo /etc/init.d/ssh restart

Henceforth,
you will connect to the platform like this:

        % ssh -i ~/.ssh/id_homespun.pub pi@raspberrypi.local

## Get Node.js
The first thing you want to do is see if node is already there,
and if so, what version you have.
The commands that follow should work on any Linux system;
however, the examples will all be based on using an RPi:

        pi@raspberrypi ~ $ node --version
        -bash: node: command not found

In this case,
the answer is no;
otherwise we'd see something like this:

        pi@raspberrypi ~ $ node --version
        v0.10.22

In this case,
the version number is `v0.10.22`.
If the version number is less than `v0.10.40`,
then you're going to need to install a newer version of Node.js.

Personally,
I prefer to build Node.js from scratch,
but that takes a while and is probably too _old school_ for most folks.
So,
here's the [alternative](https://github.com/nodesource/distributions):

        pi@raspberrypi ~ $ curl -sL https://deb.nodesource.com/setup_0.10 | sudo bash -
        ...
        pi@raspberrypi ~ $ sudo apt-get install -y nodejs build-essential
        ...

However,
if you really do want to install from scratch

        pi@raspberrypi ~ $ git clone https://github.com/joyent/node.git
        ...
        pi@raspberrypi ~ $ cd node
        pi@raspberrypi ~/node $ git checkout v0.10.22 -b v0.10.22
        pi@raspberrypi ~/node $ ./configure --without-snapshot

        pi@raspberrypi ~/node $ make
        ...
        pi@raspberrypi ~/node $ sudo make install
        ...

By the way,
this may take a quite a while.

## Install node-gyp
If a Node.js module needs to make use of a native API (perhaps to access a kernel facility),
then it probably uses [node-gyp](https://github.com/TooTallNate/node-gyp) for this purpose.
Let's install that as well:

        pi@raspberrypi ~ $ git clone https://github.com/TooTallNate/node-gyp.git
        ...
        pi@raspberrypi ~ $ cd node-gyp/
        pi@raspberrypi ~/node-gyp $ sudo npm install -g node-gyp
        ...

That is all, for now!
