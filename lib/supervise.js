"use strict";

import Promise from "bluebird";
import path from "path";
import once from "once"
import argvs from "yargs";

import logger from "./logger";
import Supervisor from "./supervisor";

const argv = argvs.usage("Usage: node ./bin/supervise [options]")
  .option("tunnels", {
    describe: "How many sauce tunnels would be open",
    number: true
  })
  .option("rollingRestart", {
    describe: "Enable rolling restart feature",
    boolean: true
  })
  .option("stats", {
    describe: "Enable stats feature, stats data will send to config.statsdHost",
    boolean: true
  })
  .option("debug", {
    describe: "Enable debug mode",
    boolean: true
  })
  .option("config", {
    describe: "Specify sauce tunnel configuration location",
    string: true
  })
  .help("h")
  .alias("h", "help")
  .argv;

let tunnels = argv.tunnels || 1;
let rollingRestart = !!argv.rollingRestart;
//load config from given path 
let configPath = argv.config ? path.resolve(process.cwd(), argv.config) : "../config.json";
let config = require(configPath);
// 2:00am every day
let restartCron = config.restartCron || "0 2 * * *";

// stats
let stats = !!argv.stats;

let supervisor = new Supervisor({
  tunnelAmount: tunnels,
  tunnelConfig: config,
  restartCron: restartCron,
  statsSwitch: stats
});

let exitProcess = once((signal) => {
  logger.warn("Received " + signal + ". Stopping all Sauce Tunnels and Existing.");

  supervisor
    .stopTunnels()
    .then(() => process.exit(0));
});

Promise
  .delay(500)
  .then(() => supervisor.stage())
  .then(() => supervisor.startTunnels())
  .finally(() => {
    process.on("SIGINT", () => exitProcess("SIGINT"));
    process.on("SIGTERM", () => exitProcess("SIGTERM"));

    if (rollingRestart) {
      supervisor.scheduleRestart();
    }

    if (stats) {
      supervisor.stats();
    }

    return supervisor.supervise();
  });