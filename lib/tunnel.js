"use strict";

import sauceConnectLauncher from "sauce-connect-launcher";
import Promise from "bluebird";
import _ from "lodash";
import path from "path";
import util from "util";

import logger from "./logger";

const privateOptions = Array.of("id", "pidTempPath", "restartCron");

// check if tunnel is alive every 10 seconds
const MONITOR_INTERVAL = 10;
const DELAY_INTERVAL = 5000;
const RETRY_LIMIT = 10;

export default class Tunnel {
  constructor(options) {
    this.isSkippingMonitor = false;
    this.retried = 0;

    this.tunnelProcess = null;
    this.tunnelId = options.id;
    this.pidTempPath = options.pidTempPath;

    this.options = _.omit(options, privateOptions);
    // add individual info per tunnel
    this.options.readyFileId = this.tunnelId.toString();
    this.options.pidfile = path.resolve(this.pidTempPath, this.tunnelId.toString() + ".pid");
  }

  start() {
    let self = this;
    // restarting
    self.tunnelProcess = null;

    return new Promise((resolve, reject) => {
      return Promise
        // to avoid the blast of all tunnels launch up at same time 
        .delay(Math.floor(Math.random() * DELAY_INTERVAL))
        .then(() => {
          logger.log(util.format("Starting Sauce Tunnel #%s, please be patient...", self.tunnelId));

          sauceConnectLauncher(self.options, (err, sauceConnectProcess) => {
            if (err) {
              logger.err(util.format("Error in starting Sauce Tunnel #%s \n %s", self.tunnelId, err));
              // retry it 
              if (self.retried < RETRY_LIMIT) {
                self.retried += 1;

                return self
                  .start()
                  .then(resolve);
              } else {
                reject(err);
              }

            } else {
              logger.log(util.format("Sauce Tunnel #%s has been started", self.tunnelId));
              self.tunnelProcess = sauceConnectProcess;
              self.isSkippingMonitor = false;
              resolve();
            }
          });
        });
    });
  }

  stop(isTimer = false) {
    let self = this;
    self.isSkippingMonitor = isTimer;

    return new Promise((resolve, reject) => {
      return Promise
        // to avoid the blast of all tunnels terminate at same time
        .delay(Math.floor(Math.random() * DELAY_INTERVAL))
        .then(() => {
          logger.log(util.format("Stopping Sauce Tunnel #%s, please be patient...", self.tunnelId));
          if (self.tunnelProcess && self.tunnelProcess["_handle"]) {
            self.tunnelProcess.close(() => {
              logger.log(util.format("Sauce Tunnel #%s has been successfully stopped", self.tunnelId));
              resolve();
            });
          } else {
            logger.warn(util.format("Sauce Tunnel #%s doesn't exist or is safely closed, returning", self.tunnelId));
            resolve();
          }
        });
    });
  }

  restart() {
    let self = this;

    return Promise
      .delay(Math.floor(Math.random() * DELAY_INTERVAL))
      .then(() => self.stop(true))
      .then(() => self.start());
  }

  monitor() {
    let self = this;
    // reset retry attempt
    self.retried = 0;

    return Promise
      .resolve()
      .then(() => {
        if ((self.tunnelProcess && self.tunnelProcess["_handle"]) || self.isSkippingMonitor) {
          //child process is still alive
          return Promise
            .delay(MONITOR_INTERVAL)
            .then(() => self.monitor());
        } else {
          logger.warn(util.format("Sauce Tunnel #%s is dead, restarting it", self.tunnelId));
          return self
            .stop()
            .then(() => self.start())
            .then(() => self.monitor());
        }
      });
  }
};