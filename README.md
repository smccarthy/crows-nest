<img width="40%" height="40%" align="right" src="https://cloud.githubusercontent.com/assets/1438478/18613191/055e771a-7d32-11e6-8f1c-9fe3c328696c.jpeg">

# crows-nest

A supervisor tool to launch and monitor multiple SauceLabs Sauce Connect tunnel in [high avaiability mode](https://wiki.saucelabs.com/display/DOCS/High+Availability+Sauce+Connect+Setup).

The tool tracks the availability of each tunnel. If any of the tunnels is unresponsive, the supervisor will attempt to terminate the tunnel gracefully and start a new one. Additionally, the tool provides the ability to perform "rolling restarts" all the tunnels periodically to avoid known issues with long-running tunnel processes.

By launching sauce tunnels in high availability mode with crows-nest, you won't need to: 

 1. manually check the availability of each tunnel
 2. manually launch up new tunnels
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

  "restartCron": "*/2 * * * *"
}
```

`./config.json` file has the basic configurations that are required by Sauce Connect. To launch your own tunnels, `username`, `accessKey` and `tunnelIdentifier` are mandatory. 

In high availability mode all tunnels share the same `tunnelIdentifier`. `tunnelIdentifier` can be any string.  One suggested convention is to use this ID to describe the geographical location where your tunnel terminates.  For example, `east` or `west`.  

You can set `username` and `accessKey` using one of the following methods:
 
 1. Specifying the values in `./config.json`
 2. Setting the environment variable `SAUCE_USERNAME` and `SAUCE_ACCESS_KEY`  

If the rolling restart feature is enabeld, `restartCron` must be a valid cron value.

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
./node_modules/.bin/pm2 start ./bin/supervise --kill-timeout 600000 --silent -- --tunnels 10
```

To stop:
```
./node_modules/.bin/pm2 stop supervise
```

To view the log:
```
./node_modules/.bin/pm2 log
```
