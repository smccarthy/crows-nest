"use strict";

import StatsD from "hot-shots";
import Promise from "bluebird";
import _ from "lodash";
import EventEmitter from "events";
import util from "util";
import os from "os";

import logger from "./logger";

export const EVENT = {
  TUNNEL_STATUS: "status",
  // When tunnels fail to launch
  TUNNEL_FAILED: "failed",
  // When tunnels retry
  TUNNEL_RETRYING: "retrying",
  // When tunnels successfully connect
  TUNNEL_CONNECTED: "connected",
  // When tunnels successfully stopped
  TUNNEL_STOPPED: "stopped",
  // How long tunnels run
  TUNNEL_AGE: "age",
  // How long tunnel to do connection
  TUNNEL_BUILD_CONNECTITON: "connectcost"
};

export class StatsQueue extends EventEmitter {
  constructor(options) {
    super();

    this.statsQueue = this.build();
    this.statsSwitch = options.statsSwitch;
    this.statsdHost = options.statsdHost;
    this.statsdPort = options.statsdPort;
    this.statsdPrefix = options.statsdPrefix;

    this.statsClient = options.statsD ? options.statsD : new StatsD({
      host: this.statsdHost + (this.statsdPort ? ":" + this.statsdPort : ""),
      telegraf: true,
      globalTags: ["hostname:" + os.hostname()]
    });

  }

  build() {
    let queue = {};
    _.forEach(EVENT, (e) => {
      queue[e] = {};
    });

    return queue;
  }

  drain() {
    let self = this;
    let tempQueue = [];

    _.forEach(self.statsQueue, (v1, k1) => {
      _.forEach(v1, (v2, k2) => {
        tempQueue.push(self._generateStats(v2.event));
      });
    });

    return Promise
      .all(tempQueue)
      .then(() => {
        // reset statsQueue
        self.statsQueue = self.build();
        return Promise.resolve();
      });
  }

  push({ eventType, timestamp, tunnelIndex, data }) {
    let self = this;
    // statsQueue format
    /**
     * statsQueue = {
     *    event: {
     *      tunnelid: {
     *        timestamp: number
     *        event: Promise
     *      }
     *    }
     * }
     * 
     */
    if (self.statsSwitch) {
      if (self.statsQueue[eventType]
        && (!self.statsQueue[eventType][tunnelIndex]
          || self.statsQueue[eventType][tunnelIndex].timestamp <= timestamp)) {
        // rules to overwrite current event 
        // 1.  first of its kind
        // 2.  latest of its kind
        self.statsQueue[eventType][tunnelIndex] = {
          timestamp: timestamp,
          event: {
            eventType: eventType,
            timestamp: timestamp,
            tunnelIndex: tunnelIndex,
            data: data
          }
        };
      }
    }
    return Promise.resolve();
  }

  _generateStats({ eventType, timestamp, tunnelIndex, data }) {
    let self = this;

    return new Promise((resolve, reject) => {
      let stat = util.format("%s%s", self.statsdPrefix, eventType, tunnelIndex, data);
      logger.debug(stat, data, ["tunnelNum:" + tunnelIndex]);

      self.statsClient.gauge(stat, data, ["tunnelNum:" + tunnelIndex]);
      resolve();
    });
  }
};