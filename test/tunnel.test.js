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
  let sauceConnectLauncherMock = null;



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

  beforeEach(() => {
    sauceConnectLauncherMock = (options, cb) => {
      cb(null, { "_handle": {}, close(cb) { cb() } });
    };
  });

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
          expect(t.state).to.equal(STATE.RUNNING);
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
          expect(t.state).to.equal(STATE.RUNNING);
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
          expect(t.state).to.equal(STATE.IDLE);
          expect(true).to.equal(true);
          done();
        });
    });

    it("Skip starting if state isn't IDLE", (done) => {
      let t = new Tunnel(_.extend({}, options, { sauceConnectLauncher: sauceConnectLauncherMock }));
      t.state = STATE.STARTING;

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

  });

  describe("Stop tunnel", function () {
    this.timeout(60000);
    let t = null;

    beforeEach((done) => {
      t = new Tunnel(_.extend({}, options, { sauceConnectLauncher: sauceConnectLauncherMock }));

      t.start()
        .then(() => {
          done();
        })
        .catch((err) => {
          expect(true).to.equal(false);
          done();
        });
    });

    it("Straight success", (done) => {
      t.stop()
        .then(() => {
          expect(t.state).to.equal(STATE.IDLE);
          expect(true).to.equal(true);
          done();
        })
        .catch((err) => {
          expect(true).to.equal(false);
          done();
        });
    });

    it("Return success if tunnel died", (done) => {
      t.tunnelProcess = null;

      t.stop()
        .then(() => {
          expect(t.state).to.equal(STATE.IDLE);
          expect(true).to.equal(true);
          done();
        })
        .catch((err) => {
          expect(true).to.equal(false);
          done();
        });
    });

    it("Skip stopping if state is IDLE", (done) => {
      t.state = STATE.IDLE;

      t.stop()
        .then(() => {
          expect(t.state).to.equal(STATE.IDLE);
          expect(true).to.equal(true);
          done();
        })
        .catch((err) => {
          expect(true).to.equal(false);
          done();
        });
    });

    it("Skip stopping if state is STOPPING", (done) => {
      t.state = STATE.STOPPING;

      t.stop()
        .then(() => {
          expect(t.state).to.equal(STATE.STOPPING);
          expect(true).to.equal(true);
          done();
        })
        .catch((err) => {
          expect(true).to.equal(false);
          done();
        });
    });

    it("Skip stopping if state is QUITTING", (done) => {
      t.state = STATE.QUITTING;

      t.stop()
        .then(() => {
          expect(t.state).to.equal(STATE.QUITTING);
          expect(true).to.equal(true);
          done();
        })
        .catch((err) => {
          expect(true).to.equal(false);
          done();
        });
    });
  });

  describe("Restart tunnel", function () {
    this.timeout(60000);
    let t = null;

    beforeEach((done) => {
      t = new Tunnel(_.extend({}, options, { sauceConnectLauncher: sauceConnectLauncherMock }));

      t.start()
        .then(() => {
          done();
        })
        .catch((err) => {
          expect(true).to.equal(false);
          done();
        });
    });

    it("Straight success", (done) => {
      t.restart()
        .then(() => {
          expect(t.state).to.equal(STATE.RUNNING);
          expect(true).to.equal(true);
          done();
        })
        .catch((err) => {
          expect(true).to.equal(false);
          done();
        });
    });

  });
});