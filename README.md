<img width="40%" height="40%" align="right" src="https://cloud.githubusercontent.com/assets/1438478/18613191/055e771a-7d32-11e6-8f1c-9fe3c328696c.jpeg">

# Crows-Nest

[![Build Status](https://api.travis-ci.org/TestArmada/crows-nest.svg?branch=master)](https://travis-ci.org/TestArmada/crows-nest)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![codecov](https://codecov.io/gh/TestArmada/crows-nest/branch/master/graph/badge.svg)](https://codecov.io/gh/TestArmada/crows-nest)

A supervisor tool to launch and monitor multiple SauceLabs Sauce Connect tunnel in [high availability mode](https://wiki.saucelabs.com/display/DOCS/High+Availability+Sauce+Connect+Setup).

The tool tracks the availability of each tunnel. If any of the tunnels is unresponsive, the supervisor will attempt to terminate the tunnel gracefully and start a new one. Additionally, the tool provides the ability to perform "rolling restarts" all the tunnels periodically to avoid known issues with long-running tunnel processes.

By launching sauce tunnels in high availability mode with crows-nest, you won't need to: 

 1. manually check the availability of each tunnel
 2. manually launch up new tunnels to replace the dead ones
 3. manually and periodically restart all tunnels

## Usage

### How to Build

Since Crows-nest is coded in ES6, you need to compile before running it in your nodejs env. To compile, run following commands in the repo root
 1. `npm install`
 2. `npm run build`

### Configuration

```
./config.json
{
  "tunnel": {
    "username": "",
    "accessKey": "",
    "verbose": false,
    "proxy": null,
    "tunnelIdentifier": "",
    "waitTunnelShutdown": true,
    "noRemoveCollidingTunnels": true,
    "sharedTunnel": true
  },
  "supervisor": {
    "portStart": 4000,
    "portIndent": 5
  },
  "stats": {
    "statsType": "",
    "statsHost": "",
    "statsPort": null,
    "statsPrefix": "",
    "statsDatabase": ""
  },

  "restartCron": "0 */4 * * *"
}
```

`./config.json` file has the basic configurations that are required by Sauce Connect. 

#### Tunnel config

To launch your own tunnels, `tunnel.username`, `tunnel.accessKey` and `tunnel.tunnelIdentifier` are mandatory. More configurations please refer to this page [sauce-connect-launcher](https://github.com/bermi/sauce-connect-launcher#advanced-usage).

In high availability mode all tunnels share the same `tunnel.tunnelIdentifier`. `tunnel.tunnelIdentifier` can be any string.  One suggested convention is to use this ID to describe the geographical location where your tunnel terminates.  For example, `east` or `west`.  

The `restartCron` value is any valid cron schedule.  For example, `0 */4 * * *` would mean "every 4 hours".  We recommend [crontab.guru](http://crontab.guru/examples.html) for help generating valid cron strings to match the desired schedule.

You can set `tunnel.username` and `tunnel.accessKey` using one of the following methods:
 
 1. Specifying the values in `./config.json`
 2. Setting the environment variable `SAUCE_USERNAME` and `SAUCE_ACCESS_KEY`

#### Supervisor config

Since `@1.5.0` `crows-nest` supports multi-tenant mode. If you want to run multiple `crows-nest` instances per box, `supervisor.portStart` and `supervisor.portIndent` are configs you want to change. `supervisor.portStart` allows you to identify the port of the first tunnel of current `crows-nest` instance will use, then every following tunnels will pick up the port `supervisor.portStart + index * supervisor.portIndent`.

#### Stats config

Since `@1.3.0` `crows-nest` starts to support pushing stats to a statsd-like system. To utilize this data pushing function you need to explicitly add `--stats` in your command. There are only two adaptors supported for now, adaptor for [telegraf](https://github.com/influxdata/telegraf) and adaptor for pushing data into influxdb directly. You can extend `lib/stats/base` to add more adaptors. 

For instance, in `config.json`, `stats.statsType =  influxdb` will tell the adaptor factory to look for a mapping with key `influxdb` configured in `factory.js`. Adaptor factory will return an instance of influxdb adaptor which is defined in `influxdb.js`. If there is no adaptor found by adaptor factory, it will throw an error to prevent crows-nest from starting.

Stats only supports `gauge` for now.

Following data will be gathered and pushed
 1. How many connection attempts a tunnel has been made before failing
 2. How many connection attempts a tunnel has been made for now 
 3. How many attempts a tunnel has been made to successfully connect
 4. When a tunnel successfully stopped
 5. How long a tunnel run (unix timestamp)
 6. How long a tunnel takes to successfully connect

#### Other configs

If the rolling restart feature is enabled, `restartCron` must be a valid cron value.

### Help

```bash
./bin/supervise --help
```

### Basic usage

Start one sauce tunnel in high availability mode:
```bash
./bin/supervise --tunnels 1
```

With rolling restart feature:
```bash
SAUCE_USERNAME=xxx SAUCE_ACCESS_KEY=yyy ./bin/supervise --tunnels 1 --rollingRestart
```

### Advanced usage

Read sauce tunnel configuration from `./myproject/config.json` and launch 20 sauce tunnels in high availability mode, with rolling restarted and stats data pushing feature enabled
```bash
./bin/supervise --tunnels 20 --config ./myproject/config.json --rollingRestart --stats
```

### Daemon

We use [pm2](https://www.npmjs.com/package/pm2) to run the supervisor process as a daemon

To start:
```bash
./node_modules/.bin/pm2 start ./bin/supervise --kill-timeout 600000 --silent -- --tunnels 10 --rollingRestart
```

To stop:
```bash
./node_modules/.bin/pm2 stop supervise
```

To view the log:
```bash
./node_modules/.bin/pm2 log --lines 100
```

#### Multi tenants
To start:
```bash
./node_modules/.bin/pm2 start -n ${TENANT_NAME} ./bin/supervise --kill-timeout 600000 --silent -- --tunnels 10 --rollingRestart --config ${TENANT_NAME}_config.json
```

To stop:
```bash
./node_modules/.bin/pm2 stop -n ${TENANT_NAME}
```

## Design

### Architecture

```
+---------------------------------------------------------------------+         +-----------------+
|                                                                     |         |                 |
| Crows-nest                           +---------------------------+  |         | Saucelabs       |
|                                      |          +----------------|  |         |                 |
|                                      | Tunnel 1 | Sauce Tunnel  ||  |         | Sauce Tunnel    |
|                              +-----> |          | Child Process || +--------> | Proxy Cloud     |
|                              |       |          +----------------|  |         |                 |
|                              |       +---------------------------+  |         |                 |
|                              |                                      |         |                 |
|                              |                                      |         |                 |
|                              |                                      |         |                 |
|                              |       +---------------------------+  |         |                 |
|                              |       |          +----------------|  |         |                 |
| +-----------------+          |       | Tunnel 2 | Sauce Tunnel  ||  |         |                 |
| |                 |          +-----> |          | Child Process || +--------> |                 |
| | Supervisor      +----------+       |          +----------------|  |         |                 |
| |                 |          |       +---------------------------+  |         |                 |
| +-----------------+          |                                      |         |                 |
|                              |                      .               |         |                 |
|                              |                      .               |         |                 |
|                              |                      .               |         |                 |
|                              |                      .               |         |                 |
|                              |                                      |         |                 |
|                              |       +---------------------------+  |         |                 |
|                              |       |          +----------------|  |         |                 |
|                              |       | Tunnel n | Sauce Tunnel  ||  |         |                 |
|                              +-----> |          | Child Process || +--------> |                 |
|                                      |          +----------------|  |         |                 |
|                                      +---------------------------|  |         |                 |
+---------------------------------------------------------------------+         +-----------------+
```

### Components

There are two major components in Crows-nest, **[Supervisor](https://github.com/TestArmada/crows-nest/blob/master/lib/supervisor.js)** and **[Tunnel](https://github.com/TestArmada/crows-nest/blob/master/lib/tunnel.js)**
```

 +------------+                            +---------+
 | Supervisor |                            | Tunnels |
 +-----+------+                            +----+----+
       |                                        |
      +++                                       |
      | |                                      +++
      | | Initialize()                         | |
      | +------------------------------------> | | monitor()
      | |                                      | +------------+
      +++                                      | |            |
       |                                       | | <----------+
       |                                       +++
       |                                        |
       |                                        |
      +++                                       |
      | | scheduleRestart()                    +++
      | +------------------------------------> | | stop()
      | |                                      | +------------+
      | |                                      | |            |
      | |                                      | |            |
      | |                                      | | <----------+
      | |                                      | |
      | |                                      | | start()
      | |                                      | +------------+
      | |                                      | |            |
      | |                                      | |            |
      | |                                      | | <----------+
      +++                                      +++
       |                                        |
       |                                        |
       +                                        +

```

#### Tunnel

Crows-nest Tunnel maintains the life cycle of a Saucelabs Sauce Connect Tunnel. It is a one to one mapping to Saucelabs Sauce Connect Tunnel instance. It does following things

1. Start a Sauce Connect Tunnel as child process
2. Monitor the status of current child process
  1. Terminate current Sauce Connect Tunnel nicely if the connection drops and start a new one.
  2. Restart current Sauce Connect Tunnel if scheduled by `rollingRestart`
3. Stop current Sauce Connect Tunnel

#### Supervisor

Crows-nest Supervisor keeps track of all Crows-nest Tunnels. It does following things

1. Initialize all Tunnels
2. Start all Tunnels by sending `start` signals to each Tunnel
3. Restart all tunnels by sending `restart` signals to each Tunnel according to schedule
4. Stop all Tunnels by sending `stop` signals to each Tunnel

### Running From Docker

1. Setup your `config.json`
2. Build:

```bash
docker build -t testarmada/crows-nest .
```

3. Run:

```bash
docker run --rm testarmada/crows-nest [YOUR COMMAND HERE]
```
For example:
```bash
docker run --rm testarmada/crows-nest bin/supervise --tunnels 1
```

### Randomness

To avoid network blast (in case all tunnels are scheduled at the same time), some randomness is introduced

1. Each tunnel takes random delay [0, 5000] ms to start
2. Each tunnel takes random delay [0, 5000] ms to stop

## Licenses

All code not otherwise specified is Copyright Wal-Mart Stores, Inc.
Released under the [MIT](./LICENSE) License.
