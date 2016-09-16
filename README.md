# sauce-tunnel-supervisor

A supervisor tool to launch up and monitor sauce tunnel(s) in high avaiability mode (https://wiki.saucelabs.com/display/DOCS/High+Availability+Sauce+Connect+Setup).

The supervisor keeps tracking the availability of each tunnel. If any of the tunnels is dead, it'll try to terminate the sauce tunnel gracefully and start a new one. Also, it provides the ability to rolling restart all the tunnels periodically.

By launching sauce tunnels in high availability mode with supervisor, you'll be worry free from

 1. manually check the availability of each tunnels
 2. manually launch up a new tunnel
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

`./config.json` file has the basic configurations that are required by sauce tunnel. To launch up your own sauce tunnels, `username`, `accessKey` and `tunnelIdentifier` are mandatory. 

In high availability mode all tunnels share the same `tunnelIdentifier`. `tunnelIdentifier` can be any string. Fill it in `./config.json`.

You can set `username` and `accessKey` by following one of the following steps
 
 1. fill the values in `./config.json`
 2. set value by env variable `SAUCE_USERNAME` and `SAUCE_ACCESS_KEY`  


If the rolling restart feature is enabeld, `restartCron` must be a valid cron value.

### Basic usage

Start one sauce tunnel in high availability mode
```
./bin/supervise --tunnels 1
```

With rolling restart feature
```
SAUCE_USERNAME=xxx SAUCE_ACCESS_KEY=yyy ./bin/supervise --tunnels 1 --rollingRestart
```

### Advanced usage

Read sauce tunnel configuration from `./myproject/config.json` and launch 20 sauce tunnels in high availability mode
```
./bin/supervise --tunnels 20 --config ./myproject/config.json
```

### Deamon

We use pm2 (https://www.npmjs.com/package/pm2) to run supervisor as deamon

To start
```
./node_modules/.bin/pm2 start ./bin/supervise --kill-timeout 600000 --silent -- --tunnels 10
```

To stop
```
./node_modules/.bin/pm2 stop supervise
```

Watch log
```
./node_modules/.bin/pm2 log
```