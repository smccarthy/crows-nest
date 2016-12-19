"use strict";

import Promise from "bluebird";

export default class BaseStats {
  constructor(options) {

  }

  gauge(key, timestamp, data, tags, callback) {
    return Promise.resolve();
  }
};