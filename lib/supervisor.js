"use strict";

var path = require("path");
var util = require("util");
var _ = require("lodash");
var Promise = require("bluebird");
var fs = require("fs");
var schedule = require("node-schedule");

var Tunnel = require("./tunnel");
var logger = require("./logger");


var PORT_BEGIN = 4000;
var PORT_INDENT = 5;
var PID_TEMP_PATH = path.resolve(process.cwd(), "temp");

// rolling restart all tunnels every 24 hours
var RESTART_INTERVAL = 86400000;

var Supervisor = function Supervisor(options) {
  this.tunnels = [];

  this.tunnelConfig = options.tunnelConfig;
  this.tunnelAmount = options.tunnelAmount;
  this.restartCron = options.restartCron;

};

Supervisor.prototype = {
  stage: function () {
    var self = this;

    return new Promise(function (resolve, reject) {
      // download sauce tunnel if necessary

      logger.log(util.format("Preparing %d Sauce Tunnel(s)", self.tunnelAmount));
      for (var i = 0; i < self.tunnelAmount; i++) {
        self.tunnels.push(new Tunnel(_.extend(self.tunnelConfig, {
          id: i + 1,
          port: PORT_BEGIN + i * PORT_INDENT,
          pidTempPath: PID_TEMP_PATH
        })));
      }

      // create temp folder to save pid files
      fs.access(PID_TEMP_PATH, fs.F_OK, function (err) {
        if (err) {
          // pid temp folder doesn't exist
          fs.mkdirSync(PID_TEMP_PATH);

        }
        resolve();
      });
    });

  },

  startTunnels: function () {
    var self = this;
    // launch up the given number of tunnels 
    return new Promise(function (resolve, reject) {

      Promise
        .map(self.tunnels, function (tunnel) {
          return tunnel.start();
        })
        .then(function () {
          logger.log("All Sauce Tunnels have been successfully started" +
            ", all failover Sauce Tunnels would be automatically restarted");
          resolve();
        })
        .catch(function (err) {
          logger.err("Some tunnels failed in starting", err);
          reject(err);
        });
    });
  },

  stopTunnels: function () {
    var self = this;
    return new Promise(function (resolve, reject) {

      Promise
        .map(self.tunnels, function (tunnel) {
          return tunnel.stop(true);
        })
        .then(function () {
          logger.log("All Sauce Tunnels have been successfully stopped");
          resolve();
        })
        .catch(function (err) {
          logger.err("Some tunnels failed in starting", err);
          reject(err);
        });
    });
  },

  supervise: function () {
    var self = this;

    // monitor their activities
    return new Promise(function (resolve, reject) {

      Promise
        .map(self.tunnels, function (tunnel) {
          return tunnel.monitor();
        })
        .then(function () {
          resolve();
        })
        .catch(function (err) {
          logger.err("Some tunnels are wrong", err);
          reject(err);
        });
    });
  },

  scheduleRestart: function () {
    var self = this;
    // restart all tunnels
    schedule.scheduleJob(self.restartCron, function () {
      logger.log(util.format("Restarting all %s Sauce Tunnels", self.tunnelAmount));

      Promise
        .map(self.tunnels, function (tunnel) {
          return tunnel.restart();
        }, {
          // to make sure we rolling restart tunnels one by one 
          concurrency: 1
        })
        .then(function () {
          logger.log("All Sauce Tunnels have been successfully restarted");
        })
        .catch(function (err) {
          logger.err("Some tunnels are wrong", err);
        });
    })
  }
};

module.exports = Supervisor;
