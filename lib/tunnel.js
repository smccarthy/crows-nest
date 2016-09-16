"use strict";

var sauceConnectLauncher = require("sauce-connect-launcher");
var Promise = require("bluebird");
var _ = require("lodash");
var path = require("path");

var util = require("util");
var logger = require("./logger");

var privateOptions = ["id", "pidTempPath", "restartCron"];

// check if tunnel is alive every 10 seconds
var MONITOR_INTERVAL = 10000;
var DELAY_INTERVAL = 5000;
var RETRY_LIMIT = 10;

var Tunnel = function Tunnel(options) {
  this.isSkippingMonitor = false;
  this.retried = 0;

  this.tunnelProcess = null;
  this.tunnelId = options.id;
  this.pidTempPath = options.pidTempPath;

  this.options = _.omit(options, privateOptions);
  // add individual info per tunnel
  this.options.readyFileId = this.tunnelId.toString();
  this.options.pidfile = path.resolve(this.pidTempPath, this.tunnelId.toString() + ".pid");
};

Tunnel.prototype = {

  start: function () {
    var self = this;
    // restarting
    self.tunnelProcess = null;
    return new Promise(function (resolve, reject) {
      return Promise
        // to avoid the blast of all tunnels launch up at same time 
        .delay(Math.floor(Math.random() * DELAY_INTERVAL))
        .then(function () {
          logger.log(util.format("Starting Sauce Tunnel #%s, please be patient...", self.tunnelId));

          sauceConnectLauncher(self.options, function (err, sauceConnectProcess) {
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
  },

  stop: function (isTimer) {
    var self = this;
    self.isSkippingMonitor = !!isTimer;

    return new Promise(function (resolve, reject) {
      return Promise
        // to avoid the blast of all tunnels terminate at same time 
        .delay(Math.floor(Math.random() * DELAY_INTERVAL))
        .then(function () {
          logger.log(util.format("Stopping Sauce Tunnel #%s, please be patient...", self.tunnelId));
          if (self.tunnelProcess && self.tunnelProcess["_handle"]) {
            self.tunnelProcess.close(function () {
              logger.log(util.format("Sauce Tunnel #%s has been successfully stopped", self.tunnelId));
              resolve();
            });
          } else {
            logger.warn(util.format("Sauce Tunnel #%s doesn't exist or is safely closed, returning", self.tunnelId));
            resolve();
          }
        });
    });

  },

  restart: function () {
    var self = this;

    return Promise
      .delay(Math.floor(Math.random() * DELAY_INTERVAL))
      .then(function () {
        return self.stop(true);
      })
      .then(this.start.bind(this));

  },

  monitor: function () {
    var self = this;
    // reset retry attempt
    self.retried = 0;

    return Promise
      .resolve()
      .then(function () {
        if ((self.tunnelProcess && self.tunnelProcess["_handle"]) || self.isSkippingMonitor) {
          // child process is still on
          return Promise
            .delay(MONITOR_INTERVAL)
            .then(self.monitor.bind(self));
        } else {
          logger.warn(util.format("Sauce Tunnel #%s is dead, restarting it", self.tunnelId));
          return self
            .stop()
            .then(self.start.bind(self))
            .then(self.monitor.bind(self));
        }
      });
  }
};

module.exports = Tunnel;
