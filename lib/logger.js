"use strict";

import argv from "yargs";
import util from "util";
import moment from "moment";
import clc from "cli-color";

const debug = argv.debug;

export default {
  debug(msg) {
    if (debug) {
      console.log(util.format("[%s] [DEBUG] %s", moment().format("YYYY-MM-DD HH:mm:ss.SSS"), msg));
    }
  },
  log(msg) {
    var info = clc.greenBright("[INFO]");
    console.log(util.format("[%s] %s %s", moment().format("YYYY-MM-DD HH:mm:ss.SSS"), info, msg));
  },
  warn(msg) {
    var warn = clc.yellowBright("[WARN]");
    console.warn(util.format("[%s] %s %s", moment().format("YYYY-MM-DD HH:mm:ss.SSS"), warn, msg));
  },
  err(msg) {
    var err = clc.redBright("[ERROR]");
    console.error(util.format("[%s] %s %s", moment().format("YYYY-MM-DD HH:mm:ss.SSS"), err, msg));
  }
};
