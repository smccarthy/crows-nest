<img width="40%" height="40%" align="right" src="https://cloud.githubusercontent.com/assets/1438478/18613191/055e771a-7d32-11e6-8f1c-9fe3c328696c.jpeg">

# crows-nest

A supervisor tool to launch and monitor multiple SauceLabs Sauce Connect tunnel in [high avaiability mode](https://wiki.saucelabs.com/display/DOCS/High+Availability+Sauce+Connect+Setup).

The tool tracks the availability of each tunnel. If any of the tunnels is unresponsive, the supervisor will attempt to terminate the tunnel gracefully and start a new one. Additionally, the tool provides the ability to perform "rolling restarts" all the tunnels periodically to avoid known issues with long-running tunnel processes.

By launching sauce tunnels in high availability mode with crows-nest, you won't need to: 

 1. manually check the availability of each tunnel
 2. manually launch up new tunnels to replace the dead ones
 3. manually and periodically restart all tunnels

## Usage

### Configuration

```
./config.json
{
  "username": "",
  "accessKey": "",
  "verbose": false,
  "proxy": null,
  "tunnelIdentifier": "",
  "waitTunnelShutdown": true,
  "noRemoveCollidingTunnels": true,

  "restartCron": "0 */4 * * *"
}
```

`./config.json` file has the basic configurations that are required by Sauce Connect. To launch your own tunnels, `username`, `accessKey` and `tunnelIdentifier` are mandatory. 

More configurations please refer to this page [sauce-connect-launcher](https://github.com/bermi/sauce-connect-launcher#advanced-usage).

In high availability mode all tunnels share the same `tunnelIdentifier`. `tunnelIdentifier` can be any string.  One suggested convention is to use this ID to describe the geographical location where your tunnel terminates.  For example, `east` or `west`.  

The `restartCron` value is any valid cron schedule.  For example `0 */4 * * *` would mean "every 4 hours".  We recommend [crontab.guru](http://crontab.guru/examples.html) for help generating valid cron strings to match the desired schedule.

You can set `username` and `accessKey` using one of the following methods:
 
 1. Specifying the values in `./config.json`
 2. Setting the environment variable `SAUCE_USERNAME` and `SAUCE_ACCESS_KEY`  

If the rolling restart feature is enabled, `restartCron` must be a valid cron value.

### Help

```
./bin/supervise --help
```

### Basic usage

Start one sauce tunnel in high availability mode:
```
./bin/supervise --tunnels 1
```

With rolling restart feature:
```
SAUCE_USERNAME=xxx SAUCE_ACCESS_KEY=yyy ./bin/supervise --tunnels 1 --rollingRestart
```

### Advanced usage

Read sauce tunnel configuration from `./myproject/config.json` and launch 20 sauce tunnels in high availability mode
```
./bin/supervise --tunnels 20 --config ./myproject/config.json
```

### Daemon

We use [pm2](https://www.npmjs.com/package/pm2) to run the supervisor process as a daemon

To start:
```
./node_modules/.bin/pm2 start ./bin/supervise --kill-timeout 600000 --silent -- --tunnels 10 --rollingRestart
```

To stop:
```
./node_modules/.bin/pm2 stop supervise
```

To view the log:
```
./node_modules/.bin/pm2 log --lines 100
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

### Randomness

To avoid network blast (in case all tunnels are scheduled at the same time), some randomness are introduced

1. Each tunnel takes random delay [0, 5000] ms to start
2. Each tunnel takes random delay [0, 5000] ms to stop
