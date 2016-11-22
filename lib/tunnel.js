"use strict";

import sauceConnectLauncher from "sauce-connect-launcher";
import treeKill from "tree-kill";
import Promise from "bluebird";
import _ from "lodash";
import path from "path";
import util from "util";
import moment from "moment";

import logger from "./logger";

const privateOptions = Array.of("id", "pidTempPath", "restartCron");

// frequency to check if a tunnel is alive in millisecond
const MONITOR_INTERVAL = 10000;
const DELAY_INTERVAL = 5000;
// maximum retry times before a tunnel goes alive in millisecond
const RETRY_LIMIT = 10;
// maximum duration for a live tunnel in millisecond
const MAX_ALIVE_DURATION = 300000;

const STATE = {
  IDLE: 0, STARTING: 1, RUNNING: 2, STOPPING: 3
};

export default class Tunnel {
  constructor(options) {
    this.state = STATE.IDLE;
    this.retried = 0;

    this.tunnelProcess = null;
    this.index = options.id;
    this.pidTempPath = options.pidTempPath;
    this.initStopAt = null;

    this.options = _.omit(options, privateOptions);
    // add individual info per tunnel
    this.options.readyFileId = this.index.toString();
    this.options.pidfile = path.resolve(this.pidTempPath, this.index.toString() + ".pid");
  }

  start() {
    let self = this;


    if (self.state !== STATE.IDLE) {
      // this.stop method is called somewhere, we do stop first. we'll restart the tunnel in next scheduled time slot
      logger.warn(util.format("Sauce Tunnel #%s isn't idle, it's doing things", self.index));
      return Promise.resolve();
    } else {
      // restarting
      self.state = STATE.STARTING;
      self.tunnelProcess = null;

      return new Promise((resolve, reject) => {
        return Promise
          // to avoid the blast of all tunnels launch up at same time 
          .delay(Math.floor(Math.random() * DELAY_INTERVAL))
          .then(() => {
            logger.log(util.format("<starting...> Sauce Tunnel #%s", self.index));

            sauceConnectLauncher(self.options, (err, sauceConnectProcess) => {
              if (err) {
                logger.err(util.format("Error in starting Sauce Tunnel #%s \n %s", self.index, err));
                self.state = STATE.IDLE;
                // retry it 
                if (self.retried < RETRY_LIMIT) {
                  self.retried += 1;

                  return self
                    .start()
                    .then(() => {
                      self.state = STATE.RUNNING;
                      resolve();
                    });
                } else {
                  reject(err);
                }

              } else {
                self.tunnelProcess = sauceConnectProcess;
                logger.log(util.format("<started> Sauce Tunnel #%s", self.index));
                self.state = STATE.RUNNING;
                resolve();
              }
            });
          });
      });
    }
  }

  stop() {
    let self = this;

    if (self.state === STATE.IDLE
      || self.state === STATE.STOPPING) {
      // dont do anything here
      return Promise.resolve();
    } else {

      return Promise
        // to avoid the blast of terminating all tunnels at same time
        .delay(Math.floor(Math.random() * DELAY_INTERVAL))
        .then(() => {
          self.state = STATE.STOPPING;
          // when current tunnel is told to stop
          self.initStopAt = moment().valueOf();
          logger.log(util.format("<stopping...> Sauce Tunnel #%s", self.index));

          return new Promise((resolve, reject) => {
            // since tunnelProcess.close() gives nothing back, we don't know if tunnel is closed succesfully or not.
            // we always return resolve, leave other situation for kill()
            if (self.tunnelProcess && self.tunnelProcess["_handle"]) {
              // tunnel is alive
              self.tunnelProcess.close(() => {
                // where zombie tunnel is born
                logger.log(util.format("<stopped> Sauce Tunnel #%s", self.index));
                resolve();
              });
            } else {
              // one extra step is needed
              logger.warn(util.format("Sauce Tunnel #%s doesn't exist or is safely closed, returning", self.index));
              resolve();
            }
          });
        })
        .then(() => self.kill())
        .catch((err) => {
          logger.err(util.format("Error in killing tunnel #%s with SIGKILL\n%s", self.index, err));
          return Promise.reject(err);
        });
    }
  }

  kill() {
    // we cannot say `Sauce Tunnel has been successfully stopped` at this time, sometimes 
    // things can happen at saucelabs side so that sauce proxy got killed from their side
    // but the child_process tunnel is alive at our side.
    // however an extra step has been applied to check the availablility of the tunnel 
    // from both side
    let self = this;

    if (!self.tunnelProcess
      || !self.tunnelProcess["_handle"]) {
      // _handle is null, tunnel is terminated correctly, or tunnel child_process is set to be null
      self.state = STATE.IDLE;
      self.initStopAt = null;
      return Promise.resolve();

    } else {
      return Promise
        .resolve()
        .then(() => {
          if (self.initStopAt
            && moment().valueOf() - self.initStopAt > MAX_ALIVE_DURATION) {
            // something happened to stop current tunnel from being terminated
            logger.warn(util.format("<killing with SIGKILL> Sauce Tunnel #%s doesn't terminate in %s!",
              self.index,
              moment.duration(MAX_ALIVE_DURATION).humanize()));

            return new Promise((resolve, reject) => {
              treeKill(self.tunnelProcess.pid, "SIGKILL", (err) => {
                self.initStopAt = null;

                if (err) {
                  reject(err);
                }
                self.state = STATE.IDLE;
                resolve();
              });
            });

          } else {
            // give it a moment
            return Promise
              .delay(MONITOR_INTERVAL)
              .then(() => {
                logger.warn(util.format("Sauce Tunnel #%s doesn't terminate on time but still in grace period. Waiting...", self.index));
                return self.kill()
              });
          }
        })
        .catch((err) => {
          // reject exception out
          self.state = STATE.RUNNING;
          logger.err(util.format("Kill sauce Tunnel #%s failed\n%s", self.index, err));
          return Promise.reject(err);
        });
    }
  }

  restart() {
    let self = this;

    if (self.state === STATE.IDLE
      || self.state === STATE.RUNNING) {
      // restart is only allowed on idle or running state

      return Promise
        .delay(Math.floor(Math.random() * DELAY_INTERVAL))
        .then(() => self.stop())
        .then(() => self.start())
        .then(() => {
          self.state = STATE.RUNNING;
        })
        .catch((err) => {
          self.state = STATE.IDLE;
        });
    } else {
      // restart procedure is under going, do nothing 
      return Promise.resolve();
    }
  }

  monitor() {
    let self = this;

    return Promise
      .resolve()
      .then(() => {
        // reset retry attempt
        self.retried = 0;

        if ((self.tunnelProcess && self.tunnelProcess["_handle"])
          || self.state === STATE.STOPPING
          || self.state === STATE.STARTING) {
          //child process is still alive
          return Promise
            .delay(MONITOR_INTERVAL)
            .then(() => self.monitor());
        } else {
          logger.warn(util.format("Sauce Tunnel #%s is dead, restarting it", self.index));
          return self
            .restart()
            .then(() => self.monitor());
        }
      });
  }
};