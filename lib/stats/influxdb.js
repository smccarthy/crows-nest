"use strict";

import { InfluxDB } from "influx";
import moment from "moment";
import _ from "lodash";
import Base from "./base";
import logger from "../logger";

/* istanbul ignore next */
export default class InfluxDBAdaptor extends Base {
  constructor({statsHost, statsPort, statsDatabase}) {
    super();
    
    this.influx = new InfluxDB({
      host: statsHost,
      port: statsPort,
      database: statsDatabase
    });
  }

  gauge(key, timestamp, data, tags, callback) {
    // data mapping and format

    let d = {
      measurement: key,
      tags: _.fromPairs(_.map(tags, (t) => t.split(":"))),
      fields: { duration: timestamp, value: data },
    };
    logger.debug(JSON.stringify(d));
    // return a promise
    return this.influx.writePoints([d]);
  }
};