"use strict";

import sauceConnectLauncher from "sauce-connect-launcher";
import saucelabsApi from "saucelabs";
import treeKill from "tree-kill";
import Promise from "bluebird";
import _ from "lodash";
import path from "path";
import util from "util";
import moment from "moment";

import logger from "./logger";
import { EVENT } from "./stats";

const privateOptions = Array.of("id", "pidTempPath", "restartCron", "statsQueue");

// frequency to check if a tunnel is alive in millisecond
const MONITOR_INTERVAL = 10000;
const DELAY_INTERVAL = 5000;
// maximum retry times before a tunnel goes alive in millisecond
const RETRY_LIMIT = 10;
// maximum duration for a live tunnel in millisecond
const TUNNEL_STOP_TIMEOUT = 480000;
const TUNNEL_START_TIMEOUT = 480000;

export const STATE = {
  IDLE: 0, STARTING: 1, RUNNING: 2, STOPPING: 3, QUITTING: 4
};

Promise.config({ cancellation: true });

export class Tunnel {
  constructor(options) {
    this.state = STATE.IDLE;
    this.retried = 0;

    this.tunnelProcess = null;
    this.index = options.id;
    this.pidTempPath = options.pidTempPath;
    this.startedAt = null;
    this.startedFrom = null;
    this.statsQueue = options.statsQueue;

    this.options = _.omit(options, privateOptions);

    // add individual info per tunnel
    this.options.readyFileId = util.format("%s_%s", Math.ceil(Math.random() * 1000), this.index.toString());
    this.options.pidfile = path.resolve(this.pidTempPath, this.index.toString() + ".pid");

    this.sauceConnectLauncher = options.sauceConnectLauncher ? options.sauceConnectLauncher : sauceConnectLauncher;
    this.saucelabsApi = options.saucelabsApi ? options.saucelabsApi : saucelabsApi;
    this.treeKill = options.treeKill ? options.treeKill : treeKill;
  }

  start(retries = 0) {
    let self = this;
    
    if (self.state !== STATE.IDLE) {
      // this.stop method is called somewhere, we do stop first. we'll restart the tunnel in next scheduled time slot
      logger.warn(util.format("Sauce Tunnel #%s isn't idle, it's doing things", self.index));
      return Promise.resolve();
    } else {
      // restarting
      self.state = STATE.STARTING;
      self.tunnelProcess = null;
      if (!self.startedFrom) {
        self.startedFrom = moment().valueOf();
      }

      let timeout = setTimeout(() => p.cancel(), TUNNEL_START_TIMEOUT);
      let p = new Promise((resolve, reject, onCancel) => {
        onCancel(() => {
          self.state = STATE.IDLE;
          logger.err(util.format("Sauce Tunnel #%s times out while starting", self.index));
        });

        logger.log(util.format("<starting...> Sauce Tunnel #%s", self.index));

        self.sauceConnectLauncher(self.options, (err, sauceConnectProcess) => {
          if (err) {
            logger.err(util.format("Error in starting Sauce Tunnel #%s \n %s", self.index, err));
            // retry it 
            if (retries < RETRY_LIMIT) {
              logger.warn(util.format("<Attempt %s/%s starting...> Sauce Tunnel #%s still isn't started", retries + 1, RETRY_LIMIT, self.index));

              Promise
                .resolve()
                .then(() => {
                  self.retried = retries;
                  self.state = STATE.IDLE;
                  return Promise.resolve();
                })
                .then(() => self.statsQueue.push({
                  eventType: EVENT.TUNNEL_RETRYING,
                  timestamp: moment().valueOf(),
                  tunnelIndex: self.index,
                  data: retries
                }))
                .then(() => self.start(retries + 1))
                .then(() => resolve())
                .catch(err => {
                  return self.statsQueue
                    .push({
                      eventType: EVENT.TUNNEL_FAILED,
                      timestamp: moment().valueOf(),
                      tunnelIndex: self.index,
                      data: retries
                    })
                    .then(() => reject(err));
                });
            } else {
              self.state = STATE.IDLE;
              logger.err(util.format("Error in starting Sauce Tunnel #%s \n %s", self.index, err));
              reject(err);
            }

          } else {
            self.tunnelProcess = sauceConnectProcess;
            // in case tunnelProcess turns null mysteriously 
            self.tunnelId = self.tunnelProcess.tunnelId;
            logger.log(util.format("<started> Sauce Tunnel #%s (%s)", self.index, self.tunnelProcess.tunnelId));
            self.startedAt = moment().valueOf();
            self.state = STATE.RUNNING;

            self.statsQueue
              .push({
                eventType: EVENT.TUNNEL_CONNECTED,
                timestamp: moment().valueOf(),
                tunnelIndex: self.index,
                data: retries
              })
              .then(() => self.statsQueue.push({
                eventType: EVENT.TUNNEL_BUILD_CONNECTITON,
                timestamp: moment().valueOf(),
                tunnelIndex: self.index,
                data: !!self.startedFrom ? moment().valueOf() - self.startedFrom : 0
              }))
              .then(() => resolve());
          }
        });
      });

      return Promise
        // to avoid the blast of all tunnels launch up at same time  
        .delay(Math.floor(Math.random() * DELAY_INTERVAL), p)
        .catch(Promise.CancellationError, err => {
          return new Promise.reject(
            new Promise.TimeoutError(util.format("Sauce Tunnel #%s isn't started in %s!",
              self.index,
              moment.duration(TUNNEL_START_TIMEOUT).humanize())));
        })
        .catch(err => Promise.reject(err));

    }
  }

  stop(currentState = STATE.STOPPING) {
    let self = this;

    if (self.state === STATE.IDLE
      || self.state === STATE.STOPPING
      || self.state === STATE.QUITTING) {
      // dont do anything here
      return Promise.resolve();
    } else {
      self.state = currentState;
      self.startedFrom = null;

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
        .delay(Math.floor(Math.random() * DELAY_INTERVAL), p)
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


    self.startedAt = null;

    if (!isTimeout || !self.tunnelProcess) {
      // _handle is null, tunnel is terminated correctly, or tunnel child_process is set to be null
      if (self.state !== STATE.QUITTING) {
        self.state = STATE.IDLE;
      }

      return Promise
        .resolve()
        .then(() => self.statsQueue.push({
          eventType: EVENT.TUNNEL_STOPPED,
          timestamp: moment().valueOf(),
          tunnelIndex: self.index,
          data: self.state === STATE.IDLE ? 1 : 0
        }));

    } else {
      // something happened to stop current tunnel from being terminated
      logger.warn(util.format("<killing with SIGKILL...> Sauce Tunnel #%s", self.index));

      return Promise
        .resolve()
        .then(() => {
          // call sauce api to end the tunnel one last time
          return new Promise((resolve, reject) => {
            self.saucelabsApi.deleteTunnel(self.tunnelId, (err, res) => {
              // we eat err here
              resolve();
            })
          });
        })
        .then(() => {
          return new Promise((resolve, reject) => {
            self.treeKill(self.tunnelProcess.pid, "SIGKILL", (err) => {
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
        })
        .then(() => self.statsQueue.push({
          eventType: EVENT.TUNNEL_STOPPED,
          timestamp: moment().valueOf(),
          tunnelIndex: self.index,
          data: self.state === STATE.IDLE ? 1 : 0
        }));
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
        .catch(Promise.CancellationError, (err) => {
          // start is skipped if a tunnel times out in stopping.
          // it will be restarted in next scheduled restart
          return Promise.reject(
            new Promise.TimeoutError(util.format("Sauce Tunnel #%s isn't stopped in %s!",
              self.index,
              moment.duration(TUNNEL_STOP_TIMEOUT).humanize())));
        })
        .then(() => self.start())
        // propagate error
        .catch((err) => Promise.reject(err))
        .then(() => {
          self.state = STATE.RUNNING;
          return Promise.resolve();
        })
        // propagate error
        .catch((err) => {
          logger.warn(util.format("Sauce Tunnel #%s failled in restarting", self.index));
          logger.err(util.format("%s", err));
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
      .then(() => self.statsQueue.push({
        eventType: EVENT.TUNNEL_STATUS,
        timestamp: moment().valueOf(),
        tunnelIndex: self.index,
        data: self.state === STATE.RUNNING ? 1 : 0
      }))
      .then(() => self.statsQueue.push({
        eventType: EVENT.TUNNEL_AGE,
        timestamp: moment().valueOf(),
        tunnelIndex: self.index,
        data: !!self.startedAt ? moment().valueOf() - self.startedAt : 0
      }))
      .then(() => {
        // reset retry attempt
        self.retried = 0;
        if ((self.tunnelProcess && self.tunnelProcess["_handle"])
          || self.state === STATE.STOPPING
          || self.state === STATE.STARTING
          || self.state === STATE.QUITTING) {
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