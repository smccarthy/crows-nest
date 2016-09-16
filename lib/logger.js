"use strict";

var argv = require("yargs").argv;
var util = require("util");
var moment = require("moment");
var clc = require("cli-color");

var debug = argv.debug;

module.exports = {
  debug: function (msg) {
    if (debug) {
      console.log(util.format("[%s] [DEBUG] %s", moment().format("YYYY-MM-DD HH:mm:ss.SSS"), msg));
    }
  },
  log: function (msg) {
    var info = clc.greenBright("[INFO]");
    console.log(util.format("[%s] %s %s", moment().format("YYYY-MM-DD HH:mm:ss.SSS"), info, msg));
  },
  warn: function (msg) {
    var warn = clc.yellowBright("[WARN]");
    console.warn(util.format("[%s] %s %s", moment().format("YYYY-MM-DD HH:mm:ss.SSS"), warn, msg));
  },
  err: function (msg) {
    var err = clc.redBright("[ERROR]");
    console.error(util.format("[%s] %s %s", moment().format("YYYY-MM-DD HH:mm:ss.SSS"), err, msg));
  }
};
