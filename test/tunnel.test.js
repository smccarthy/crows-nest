import { STATE, Tunnel } from "../tunnel";
import { EVENT, StatsQueue } from "../stats";
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
  let statsDMock = { gauge(stat, data, tags) { } };
  let statsQueue = {};

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

    statsQueue = new StatsQueue({
      statsSwitch: true,
      statsdHost: "some.where.local.org",
      statsdPort: null,
      statsdPrefix: "fake.",
      statsD: statsDMock
    });

    saucelabsApiMock = { deleteTunnel(id, cb) { cb(null, "fake res") } };

    t = new Tunnel(_.extend({}, options, {
      sauceConnectLauncher: sauceConnectLauncherMock,
      saucelabsApi: saucelabsApiMock,
      statsQueue: statsQueue
    }));
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
        .then(() => expect(Promise.resolve(_.values(t.statsQueue.statsQueue[EVENT.TUNNEL_RETRYING]).length)).to.eventually.equal(1))
        .then(() => expect(Promise.resolve(t.statsQueue.statsQueue[EVENT.TUNNEL_RETRYING]["1"].event.data)).to.eventually.equal(3))
        .then(() => expect(Promise.resolve(t.statsQueue.statsQueue[EVENT.TUNNEL_RETRYING]["1"].event.eventType)).to.eventually.equal(EVENT.TUNNEL_RETRYING))
        .then(() => expect(Promise.resolve(t.statsQueue.statsQueue[EVENT.TUNNEL_RETRYING]["1"].event.tunnelIndex)).to.eventually.equal(1))
        .then(() => expect(Promise.resolve(_.values(t.statsQueue.statsQueue[EVENT.TUNNEL_CONNECTED]).length)).to.eventually.equal(1))
        .then(() => expect(Promise.resolve(t.statsQueue.statsQueue[EVENT.TUNNEL_CONNECTED]["1"].event.data)).to.eventually.equal(4))
        .then(() => expect(Promise.resolve(t.statsQueue.statsQueue[EVENT.TUNNEL_CONNECTED]["1"].event.eventType)).to.eventually.equal(EVENT.TUNNEL_CONNECTED))
        .then(() => expect(Promise.resolve(t.statsQueue.statsQueue[EVENT.TUNNEL_CONNECTED]["1"].event.tunnelIndex)).to.eventually.equal(1))
        .then(() => expect(Promise.resolve(_.values(t.statsQueue.statsQueue[EVENT.TUNNEL_BUILD_CONNECTITON]).length)).to.eventually.equal(1))
        .then(() => expect(Promise.resolve(t.statsQueue.statsQueue[EVENT.TUNNEL_BUILD_CONNECTITON]["1"].event.eventType)).to.eventually.equal(EVENT.TUNNEL_BUILD_CONNECTITON))
        .then(() => expect(Promise.resolve(t.statsQueue.statsQueue[EVENT.TUNNEL_BUILD_CONNECTITON]["1"].event.tunnelIndex)).to.eventually.equal(1))
        .catch(err => assert(false, "Tunnel failed in launching up with retry " + err));
    });

    it("Fail after 10 retries", () => {
      t.sauceConnectLauncher = (options, cb) => { cb(new Error("fake_err"), null); };

      return t.start()
        .then(() => assert(false, "Tunnel succeeded in launching up"))
        .catch((err) => expect(Promise.resolve(t.state)).to.eventually.equal(STATE.IDLE));
    });

    it("Skip starting if state isn't IDLE", () => {
      t.state = STATE.STARTING;

      return t.start()
        .catch(err => assert(false, "Tunnel succeeded in launching up with state = IDLE"));
    });

    it("Stats works", () => {
      return t
        .start()
        .then(() => expect(Promise.resolve(_.values(t.statsQueue.statsQueue[EVENT.TUNNEL_CONNECTED]).length)).to.eventually.equal(1))
        .then(() => expect(Promise.resolve(t.statsQueue.statsQueue[EVENT.TUNNEL_CONNECTED]["1"].event.data)).to.eventually.equal(0))
        .then(() => expect(Promise.resolve(t.statsQueue.statsQueue[EVENT.TUNNEL_CONNECTED]["1"].event.eventType)).to.eventually.equal(EVENT.TUNNEL_CONNECTED))
        .then(() => expect(Promise.resolve(t.statsQueue.statsQueue[EVENT.TUNNEL_CONNECTED]["1"].event.tunnelIndex)).to.eventually.equal(1))
        .then(() => expect(Promise.resolve(_.values(t.statsQueue.statsQueue[EVENT.TUNNEL_BUILD_CONNECTITON]).length)).to.eventually.equal(1))
        .then(() => expect(Promise.resolve(t.statsQueue.statsQueue[EVENT.TUNNEL_BUILD_CONNECTITON]["1"].event.eventType)).to.eventually.equal(EVENT.TUNNEL_BUILD_CONNECTITON))
        .then(() => expect(Promise.resolve(t.statsQueue.statsQueue[EVENT.TUNNEL_BUILD_CONNECTITON]["1"].event.tunnelIndex)).to.eventually.equal(1))
        .catch(err => assert(false, "Stats isn't pushed correctly during start" + err));
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

      it("Stats works if stop succeeds", () => {
        t.state = STATE.IDLE;
        t.tunnelProcess = null;

        return t
          .kill()
          .then(() => expect(Promise.resolve(_.values(t.statsQueue.statsQueue[EVENT.TUNNEL_STOPPED]).length)).to.eventually.equal(1))
          .then(() => expect(Promise.resolve(t.statsQueue.statsQueue[EVENT.TUNNEL_STOPPED]["1"].event.data)).to.eventually.equal(1))
          .then(() => expect(Promise.resolve(t.statsQueue.statsQueue[EVENT.TUNNEL_STOPPED]["1"].event.eventType)).to.eventually.equal(EVENT.TUNNEL_STOPPED))
          .then(() => expect(Promise.resolve(t.statsQueue.statsQueue[EVENT.TUNNEL_STOPPED]["1"].event.tunnelIndex)).to.eventually.equal(1))
          .catch(err => assert(false, "Stats isn't pushed correctly during start" + err));
      });

      it("Stats works if stop doesnt succeed", () => {
        t.tunnelProcess = { id: 1 };
        t.treeKill = (pid, signal, cb) => { cb() };

        t.state = STATE.RUNNING;

        return t
          .kill(true)
          .then(() => expect(Promise.resolve(_.values(t.statsQueue.statsQueue[EVENT.TUNNEL_STOPPED]).length)).to.eventually.equal(1))
          .then(() => expect(Promise.resolve(t.statsQueue.statsQueue[EVENT.TUNNEL_STOPPED]["1"].event.data)).to.eventually.equal(1))
          .then(() => expect(Promise.resolve(t.statsQueue.statsQueue[EVENT.TUNNEL_STOPPED]["1"].event.eventType)).to.eventually.equal(EVENT.TUNNEL_STOPPED))
          .then(() => expect(Promise.resolve(t.statsQueue.statsQueue[EVENT.TUNNEL_STOPPED]["1"].event.tunnelIndex)).to.eventually.equal(1))
          .catch(err => assert(false, "Stats isn't pushed correctly during start" + err));
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