"use strict";

import util from "util";
import Influx from "./influxdb";
import Telegraf from "./telegraf";
import logger from "../logger";

const adaptors = {
  influxdb: Influx,
  telegraf: Telegraf
}

export default class AdaptorFactory {
  constructor(type, options) {
    if (adaptors[type]) {
      return new adaptors[type](options);
    }

    logger.err(util.format("Stats adaptor %s isn't supported, please implement the adaptor in lib/stats/", type));
    return new Error("No such stats adaptor found in lib/stats/");
  }
};