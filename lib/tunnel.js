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
const TUNNEL_STOP_TIMEOUT = 480000;
const TUNNEL_START_TIMEOUT = 480000;

const STATE = {
  IDLE: 0, STARTING: 1, RUNNING: 2, STOPPING: 3
};

Promise.config({ cancellation: true });

export default class Tunnel {
  constructor(options) {
    this.state = STATE.IDLE;
    this.retried = 0;

    this.tunnelProcess = null;
    this.index = options.id;
    this.pidTempPath = options.pidTempPath;

    this.options = _.omit(options, privateOptions);
    // add individual info per tunnel
    this.options.readyFileId = util.format("%s_%s", Math.ceil(Math.random() * 1000), this.index.toString());
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

      let timeout = setTimeout(() => p.cancel(), TUNNEL_START_TIMEOUT);
      let p = new Promise((resolve, reject, onCancel) => {
        onCancel(() => {
          self.state = STATE.IDLE;
          logger.err(util.format("Sauce Tunnel #%s times out while starting", self.index));
        });

        sauceConnectLauncher(self.options, (err, sauceConnectProcess) => {
          if (err) {
            logger.err(util.format("Error in starting Sauce Tunnel #%s \n %s", self.index, err));
            // retry it 
            if (self.retried < RETRY_LIMIT) {
              self.retried += 1;
              self.state = STATE.IDLE;

              return self
                .start()
                .then(() => {
                  self.state = STATE.RUNNING;
                  resolve();
                });
            } else {
              self.state = STATE.IDLE;
              logger.err(util.format("Error in starting Sauce Tunnel #%s \n %s", self.index, err));
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

      return Promise
        // to avoid the blast of all tunnels launch up at same time  
        .delay(Math.floor(Math.random() * DELAY_INTERVAL))
        .then(() => {
          logger.log(util.format("<starting...> Sauce Tunnel #%s", self.index));


          return p;
        })
        .finally(() => {
          clearTimeout(timeout);
          this.retried = 0;
          if (p.isCancelled()) {
            return Promise.reject();
          } else {
            return Promise.resolve();
          }
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
      self.state = STATE.STOPPING;
      let timeout = setTimeout(() => p.cancel(), TUNNEL_STOP_TIMEOUT);
      let p = new Promise((resolve, reject, onCancel) => {

        onCancel(() => {
          logger.err(util.format("Sauce Tunnel #%s times out while stopping", self.index));
        });

        // since tunnelProcess.close() gives nothing back, we don't know if tunnel is closed succesfully or not.
        // we always return resolve, leave other situation for kill()
        if (self.tunnelProcess && self.tunnelProcess["_handle"]) {

          logger.log(util.format("<stopping...> Sauce Tunnel #%s", self.index));
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

      return Promise
        // to avoid the blast of terminating all tunnels at same time
        .delay(Math.floor(Math.random() * DELAY_INTERVAL))
        .then(() => p)
        .finally(() => {
          clearTimeout(timeout)
          return self.kill(p.isCancelled())
        });
    }
  }

  kill(isTimeout = false) {
    // we cannot say `Sauce Tunnel has been successfully stopped` at this time, sometimes 
    // things can happen at saucelabs side so that sauce proxy got killed from their side
    // but the child_process tunnel is alive at our side.
    // however an extra step has been applied to check the availablility of the tunnel 
    // from both side
    let self = this;

    if (!isTimeout || !self.tunnelProcess) {
      // _handle is null, tunnel is terminated correctly, or tunnel child_process is set to be null
      self.state = STATE.IDLE;
      return Promise.resolve();

    } else {
      // something happened to stop current tunnel from being terminated
      logger.warn(util.format("<killing with SIGKILL...> Sauce Tunnel #%s doesn't terminate in %s!",
        self.index,
        moment.duration(TUNNEL_STOP_TIMEOUT).humanize()));

      return new Promise((resolve, reject) => {
        treeKill(self.tunnelProcess.pid, "SIGKILL", (err) => {

          if (err) {
            self.state = STATE.RUNNING;
            logger.err(util.format("Kill sauce Tunnel #%s failed\n%s", self.index, err));
            reject(err);
          } else {
            self.state = STATE.IDLE;
            self.tunnelProcess = null;
            logger.warn(util.format("<killed with SIGKILL> Sauce Tunnel #%s!", self.index));
            resolve();
          }
        });
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
        .then(() => {
          return self.stop()
        })
        .then(() => {
          return self.start()
        })
        .then(() => {
          self.state = STATE.RUNNING;
          return Promise.resolve();
        }, (err) => {
          logger.warn(util.format("Sauce Tunnel #%s failled in restarting, waiting for next rolling restart schedule\n%s", self.index, err));
          return Promise.reject(err);
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