"use strict";

import argvs from "yargs";
import util from "util";
import moment from "moment";
import clc from "cli-color";

const debug = argvs.argv.debug;

export default {
  output: console,

  debug(...msgs) {
    if (debug) {
      var deb = clc.blueBright("[DEBUG]");
      this.output.log(util.format("[%s] %s %s", moment().format("YYYY-MM-DD HH:mm:ss.SSS"), deb, msgs.join("|")));
    }
  },
  log(...msgs) {
    var info = clc.greenBright("[INFO]");
    this.output.log(util.format("[%s] %s %s", moment().format("YYYY-MM-DD HH:mm:ss.SSS"), info, msgs.join("|")));
  },
  warn(...msgs) {
    var warn = clc.yellowBright("[WARN]");
    this.output.warn(util.format("[%s] %s %s", moment().format("YYYY-MM-DD HH:mm:ss.SSS"), warn, msgs.join("|")));
  },
  err(...msgs) {
    var err = clc.redBright("[ERROR]");
    this.output.error(util.format("[%s] %s %s", moment().format("YYYY-MM-DD HH:mm:ss.SSS"), err, msgs.join("|")));
  }
};
