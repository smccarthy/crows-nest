import Factory from "../../stats/factory";
import Promise from "bluebird";
import chai from "chai";
import chaiAsPromise from "chai-as-promised";

import logger from "../../logger";

// eat console logs
logger.output = {
  log() { },
  error() { },
  debug() { },
  warn() { }
};

import _ from "lodash";

chai.use(chaiAsPromise);

const expect = chai.expect;
const assert = chai.assert;

describe("Factory", () => {
  let options = {
    "statsType": "influxdb",
    "statsHost": "",
    "statsPort": null,
    "statsPrefix": "testdddtest.",
    "statsDatabase": ""
  };

  it("Valid adaptor name", () => {
    let adaptor = new Factory(options.statsType, options);

    expect(adaptor).to.be.a("Object");
  });

  it("Invalid adaptor name", () => {
    try {
      let adaptor = new Factory("mongodb", options);

    } catch (err) {
      expect(err.message).to.equal("No such stats adaptor found in lib/stats/");
    }
  });
});