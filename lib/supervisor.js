"use strict";

import path from "path";
import util from "util";
import Promise from "bluebird";
import _ from "lodash";
import fs from "fs";
import schedule from "node-schedule";

import { STATE, Tunnel } from "./tunnel";
import logger from "./logger";
import { EVENT, StatsQueue } from "./stats";

const PORT_BEGIN = 4000;
const PORT_INDENT = 5;
const PID_TEMP_PATH = path.resolve(process.cwd(), "temp");
// rolling restart all tunnels every 24 hours
const RESTART_INTERVAL = 86400000;

export default class Supervisor {
  constructor({tunnelConfig, tunnelAmount, restartCron, statsSwitch, statsConfig}) {
    this.tunnels = [];
    this.tunnelConfig = tunnelConfig;
    this.tunnelAmount = tunnelAmount;
    this.restartCron = restartCron;
    
    this.statsSwitch = statsSwitch;
    this.statsQueue = new StatsQueue(_.extend(statsConfig, {
      statsSwitch: statsSwitch,
      statsClient: statsSwitch ? null : { gauge() { return Promise.resolve(); } }
    }));

    this.statsHandle = null;
  }

  stage() {
    return new Promise((resolve, reject) => {
      // download sauce tunnel if necessary
      logger.log("/*************************************************/");
      logger.log(util.format("Preparing %d Sauce Tunnel(s)", this.tunnelAmount));
      logger.log(util.format("Rolling restart is enabled with schedule: %s", this.restartCron));
      logger.log("/*************************************************/");

      for (let i = 0; i < this.tunnelAmount; i++) {
        this.tunnels.push(new Tunnel(_.extend(this.tunnelConfig, {
          id: i + 1,
          port: PORT_BEGIN + i * PORT_INDENT,
          pidTempPath: PID_TEMP_PATH,
          statsQueue: this.statsQueue
        })));
      }

      // create temp folder to save pid files
      fs.access(PID_TEMP_PATH, fs.F_OK, (err) => {
        if (err) {
          // pid temp folder doesn't exist
          fs.mkdirSync(PID_TEMP_PATH);

        }
        resolve();
      });
    });
  }

  startTunnels() {
    // launch up the given number of tunnels 
    return new Promise((resolve, reject) => {

      Promise
        .map(this.tunnels, (tunnel) => tunnel.start())
        .then(() => {
          logger.log("/*************************************************/");
          logger.log("All Sauce Tunnels have been successfully started");
          logger.log("All failover Sauce Tunnels would be automatically restarted");
          logger.log("/*************************************************/");
          resolve();
        })
        .catch((err) => {
          logger.warn("/*************************************************/");
          logger.warn("Some tunnels failed in starting", err);
          logger.warn("All failover Sauce Tunnels would be automatically restarted in next rolling restart");
          logger.warn("/*************************************************/");
          reject(err);
        });
    });
  }

  stopTunnels() {

    if (this.statsHandle) {
      // stop draining statsQueue
      clearInterval(this.statsHandle);
    }

    return new Promise((resolve, reject) => {
      Promise
        .map(this.tunnels, (tunnel) => tunnel.stop(STATE.QUITTING))
        .then(() => {
          logger.log("/*************************************************/");
          logger.log("All Sauce Tunnels have been successfully stopped");
          logger.log("/*************************************************/");
          resolve();
        })
        .catch((err) => {
          logger.err("Some tunnels failed in stopping", err);
          reject(err);
        })
    });
  }

  supervise() {
    // monitor their activities
    return new Promise((resolve, reject) => {

      Promise
        .map(this.tunnels, (tunnel) => tunnel.monitor())
        .then(() => resolve())
        .catch((err) => {
          logger.err("Some tunnels are wrong", err);
          reject(err);
        });
    });
  }

  scheduleRestart() {
    // restart all tunnels
    schedule.scheduleJob(this.restartCron, () => {
      logger.log("/-------------------------------------------------/");
      logger.log(util.format("<restarting...> all %s Sauce Tunnels", this.tunnelAmount));
      logger.log("/-------------------------------------------------/");

      Promise
        .map(this.tunnels, (tunnel) => tunnel.restart(), {
          // to make sure we rolling restart tunnels one by one 
          concurrency: 1
        })
        .then(() => {
          logger.log("/-------------------------------------------------/");
          logger.log(util.format("<restarted> all %s Sauce Tunnels", this.tunnelAmount))
          logger.log("/-------------------------------------------------/");
          return Promise.resolve();
        })
        .catch((err) => {
          logger.warn("/-------------------------------------------------/");
          logger.warn("<restarted> Some tunnels failed in restart");
          logger.err(err)
          logger.warn("They will be restarted in next rolling restart schedule")
          logger.warn("/-------------------------------------------------/");
          return Promise.resolve();
        });
    });
  }

  stats() {
    let self = this;
    // flush all stats data on a timer
    self.statsHandle = setInterval(() => {
      self.statsQueue
        .drain()
        .then(() => {
          // ignore all errors
          logger.debug("<Drained> stats Queue");
          return Promise.resolve();
        });
    }, 10000);
  }
};