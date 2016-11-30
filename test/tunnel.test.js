import { STATE, Tunnel } from "../tunnel";
import Promise from "bluebird";
import chai from "chai";

import logger from "../logger";

// eat console logs
logger.output = {
 log() { },
 error() { },
 debug() { },
 warn() { }
};

import _ from "lodash";

const expect = chai.expect;

describe("Tunnel", () => {
 let sauceConnectLauncherMock = (options, cb) => {
  cb(null, { close(cb) { cb() } });
 };

 let options = {
  username: "fake_name",
  accessKey: "fake_key",
  verbose: false,
  proxy: null,
  tunnelIdentifier: "testfortest",
  waitTunnelShutdown: true,
  noRemoveCollidingTunnels: true,
  sharedTunnel: true,
  restartCron: "*/2 * * * *",
  id: 1,
  port: 4000,
  pidTempPath: "temp"
 };

 it("Initialization", () => {
  let t = new Tunnel(_.extend({}, options, { sauceConnectLauncher: sauceConnectLauncherMock }));

  expect(t.state).to.equal(STATE.IDLE);
  expect(t.retried).to.equal(0);
  expect(t.index).to.equal(1);
  expect(t.options).to.not.have.property("restartCron");
 });

 describe("Start tunnel", function () {
  this.timeout(60000);

  it("Straight succeed", (done) => {
   let t = new Tunnel(_.extend({}, options, { sauceConnectLauncher: sauceConnectLauncherMock }));

   t.start()
    .then(() => {
     expect(true).to.equal(true);
     done();
    })
    .catch((err) => {
     expect(true).to.equal(false);
     done();
    });
  });

  it("Succeed with retry", (done) => {
   let count = 0;

   sauceConnectLauncherMock = (options, cb) => {
    count++;
    if (count < 5) {
     cb(new Error("fake error"), null);
    } else {
     cb(null, { close(cb) { cb() } });
    }
   };

   let t = new Tunnel(_.extend({}, options, { sauceConnectLauncher: sauceConnectLauncherMock }));

   t.start()
    .then(() => {
     expect(true).to.equal(true);
     done();
    })
    .catch((err) => {
     expect(true).to.equal(false);
     done();
    });
  });

  it("Fail after 10 retries", (done) => {
   sauceConnectLauncherMock = (options, cb) => { cb(new Error("fake error"), null); };
   let t = new Tunnel(_.extend({}, options, { sauceConnectLauncher: sauceConnectLauncherMock }));

   t.start()
    .then(() => {
     expect(true).to.equal(false);
     done();
    })
    .catch((err) => {
     expect(true).to.equal(true);
     done();
    });
  });

 });
});