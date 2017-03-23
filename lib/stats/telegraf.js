"use strict";

import HotShots from "hot-shots";
import Promise from "bluebird";
import Base from "./base";
import logger from "../logger";

/* istanbul ignore next */
export default class TelegrafAdaptor extends Base {
  constructor({statsHost, statsPort, statsTelegraf}) {
    super();
    
    this.hotshots = new HotShots({
      host: statsHost,
      port: statsPort,
      telegraf: statsTelegraf
    });
  }

  gauge(key, timestamp, data, tags, callback) {
    logger.debug(key, data, tags);
    // hot-shots uses UDP
    this.hotshots.gauge(key, data, tags);

    return Promise.resolve();
  }
};