import { STATE, Tunnel } from "../tunnel";
import Promise from "bluebird";
import chai from "chai";
import chaiAsPromise from "chai-as-promised";

import logger from "../logger";

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

describe("Tunnel", () => {
  let sauceConnectLauncherMock = null;
  let saucelabsApiMock = null;


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

  let t = null;

  beforeEach(() => {
    sauceConnectLauncherMock = (options, cb) => {
      cb(null, { "_handle": {}, close(cb) { cb() } });
    };

    saucelabsApiMock = { deleteTunnel(id, cb) { cb(null, "fake res") } };

    t = new Tunnel(_.extend({}, options, { sauceConnectLauncher: sauceConnectLauncherMock, saucelabsApi: saucelabsApiMock }));
  });

  it("Initialization", () => {
    expect(t.state).to.equal(STATE.IDLE);
    expect(t.retried).to.equal(0);
    expect(t.index).to.equal(1);
    expect(t.options).to.not.have.property("restartCron");
  });

  describe("Start tunnel", function () {
    this.timeout(60000);

    it("Straight succeed", () => {
      return t.start()
        .then(() => expect(Promise.resolve(t.state)).to.eventually.equal(STATE.RUNNING))
        .catch(err => assert(false, "Tunnel failed in launching up"));
    });

    it("Succeed with retry", () => {
      let count = 0;

      t.sauceConnectLauncher = (options, cb) => {
        count++;
        if (count < 5) {
          cb(new Error("fake error"), null);
        } else {
          cb(null, { close(cb) { cb() } });
        }
      };

      return t.start()
        .then(() => expect(Promise.resolve(t.state)).to.eventually.equal(STATE.RUNNING))
        .catch(err => assert(false, "Tunnel failed in launching up with retry"));
    });

    it("Fail after 10 retries", () => {
      t.sauceConnectLauncher = (options, cb) => { cb(new Error("fake_err"), null); };
      process.on("unhandledRejection", function (reason, promise) {
        // See Promise.onPossiblyUnhandledRejection for parameter documentation
        console.log(reason, promise)
      });
      return t.start()
        .then(() => assert(false, "Tunnel succeeded in launching up"))
        .catch((err) => expect(Promise.resolve(t.state)).to.eventually.equal(STATE.IDLE));
    });

    it("Skip starting if state isn't IDLE", () => {
      t.state = STATE.STARTING;

      return t.start()
        .catch(err => assert(false, "Tunnel succeeded in launching up with state = IDLE"));
    });

  });

  describe("Stop tunnel", function () {
    this.timeout(60000);

    beforeEach(() => {
      return t.start()
        .catch(err => assert(false, "Tunnel succeeded in launching up"));
    });

    it("Straight success", () => {
      return t.stop()
        .then(() => expect(Promise.resolve(t.state)).to.eventually.equal(STATE.IDLE))
        .catch(err => assert(false, "Tunnel doesn't in stop"));
    });

    it("Return success if tunnel died", () => {
      t.tunnelProcess = null;

      return t.stop()
        .then(() => expect(Promise.resolve(t.state)).to.eventually.equal(STATE.IDLE))
        .catch(err => assert(false, "Tunnel is still alive"));
    });

    it("Skip stopping if state is IDLE", () => {
      t.state = STATE.IDLE;

      return t.stop()
        .then(() => expect(Promise.resolve(t.state)).to.eventually.equal(STATE.IDLE))
        .catch(err => assert(false, "Tunnel is still alive"));
    });

    it("Skip stopping if state is STOPPING", () => {
      t.state = STATE.STOPPING;

      return t.stop()
        .then(() => expect(Promise.resolve(t.state)).to.eventually.equal(STATE.STOPPING))
        .catch(err => assert(false, "Tunnel is still alive"));
    });

    it("Skip stopping if state is QUITTING", () => {
      t.state = STATE.QUITTING;

      return t.stop()
        .then(() => expect(Promise.resolve(t.state)).to.eventually.equal(STATE.QUITTING))
        .catch(err => assert(false, "Tunnel is still alive"));
    });

    describe("Kill tunnel", () => {
      it("Kill successfully", () => {
        t.treeKill = (pid, signal, cb) => { cb() };

        return t.kill(true)
          .then(() => expect(Promise.resolve(t.state)).to.eventually.equal(STATE.IDLE))
          .catch(err => assert(false, "Tunnel is killed"));
      });

      it("Fail in kill", () => {
        t.treeKill = (pid, signal, cb) => { cb("fake_err") };

        return t.kill(true)
          .then(() => assert(false, "Tunnel is killed"))
          .catch(err => expect(Promise.resolve(t.state)).to.eventually.equal(STATE.RUNNING));
      });

      it("Do nothing if stop isn't timing out", () => {
        t.treeKill = (pid, signal, cb) => { cb("fake_err") };
        t.state = STATE.IDLE;

        return t.kill()
          .then(() => expect(Promise.resolve(t.state)).to.eventually.equal(STATE.IDLE))
          .catch(err => assert(false, "Tunnel is killed"));
      });

      it("Do nothing if tunnelProcess is null", () => {
        t.treeKill = (pid, signal, cb) => { cb("fake_err") };
        t.state = STATE.IDLE;
        t.tunnelProcess = null;

        return t.kill()
          .then(() => expect(Promise.resolve(t.state)).to.eventually.equal(STATE.IDLE))
          .catch(err => assert(false, "Tunnel is killed"));
      });
    });
  });

  describe("Restart tunnel", function () {
    this.timeout(60000);

    beforeEach(() => {
      return t.start()
        .catch(err => assert(false, "Tunnel isn't started"));
    });

    it("Straight success", () => {
      return t.restart()
        .then(() => expect(Promise.resolve(t.state)).to.eventually.equal(STATE.RUNNING))
        .catch(err => assert(false, "Tunnel isn't restarted"));
    });

    it("Do nothing if state is STARTING", () => {
      t.state = STATE.STARTING;

      return t.restart()
        .then(() => expect(Promise.resolve(t.state)).to.eventually.equal(STATE.STARTING))
        .catch(err => assert(false, "Tunnel is restarted"));
    });

    it("Do nothing if state is STOPPING", () => {
      t.state = STATE.STOPPING;

      return t.restart()
        .then(() => expect(Promise.resolve(t.state)).to.eventually.equal(STATE.STOPPING))
        .catch(err => assert(false, "Tunnel is restarted"));
    });

  });
});