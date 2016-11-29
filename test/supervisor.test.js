import Supervisor from "../supervisor";
import Promise from "bluebird";
import chai from "chai";

const expect = chai.expect;

describe("Supervisor", () => {
  it("Initialization", () => {
    let s = new Supervisor({
      tunnelAmount: 1,
      tunnelConfig: {
        "username": "fake_name",
        "accessKey": "fake_key",
        "verbose": false,
        "proxy": null,
        "tunnelIdentifier": "testfortest",
        "waitTunnelShutdown": true,
        "noRemoveCollidingTunnels": true,
        "sharedTunnel": true,

        "restartCron": "*/2 * * * *"
      },
      restartCron: false
    });

    expect(s.tunnelAmount).to.equal(1);
    expect(s.restartCron).to.equal(false);
    expect(s.tunnelConfig).to.be.a("object");
    expect(s.tunnelConfig.username).to.equal("fake_name");
    expect(s.tunnelConfig.accessKey).to.equal("fake_key");
    expect(s.tunnelConfig.restartCron).to.equal("*/2 * * * *");
  });

  describe("Stage supervisor", () => {
    describe("Stage one tunnel successfully", () => {
      let s = null;

      before((done) => {
        s = new Supervisor({
          tunnelAmount: 1,
          tunnelConfig: {
            "username": "fake_name",
            "accessKey": "fake_key",
            "verbose": false,
            "proxy": null,
            "tunnelIdentifier": "testfortest",
            "waitTunnelShutdown": true,
            "noRemoveCollidingTunnels": true,
            "sharedTunnel": true,

            "restartCron": "*/2 * * * *"
          },
          restartCron: false
        });

        s.stage().then(done);
      });

      it("Check supervisor", () => {
        expect(s.tunnels).to.be.a("array");
        expect(s.tunnels).to.have.length(1);
      });

      it("Check tunnel", () => {
        expect(s.tunnels[0].state).to.equal(0);
        expect(s.tunnels[0].retried).to.equal(0);
        expect(s.tunnels[0].index).to.equal(1);
        expect(s.tunnels[0].options.username).to.equal("fake_name");
        expect(s.tunnels[0].options.accessKey).to.equal("fake_key");
        expect(s.tunnels[0].options.port).to.equal(4000);
      });
    });

    describe("Stage 10 tunnels successfully", () => {
      let s = null;

      before((done) => {
        s = new Supervisor({
          tunnelAmount: 10,
          tunnelConfig: {
            "username": "fake_name",
            "accessKey": "fake_key",
            "verbose": false,
            "proxy": null,
            "tunnelIdentifier": "testfortest",
            "waitTunnelShutdown": true,
            "noRemoveCollidingTunnels": true,
            "sharedTunnel": true,

            "restartCron": "*/2 * * * *"
          },
          restartCron: false
        });

        s.stage().then(done);
      });

      it("Check supervisor", () => {
        expect(s.tunnelAmount).to.equal(10);
        expect(s.tunnels).to.be.a("array");
        expect(s.tunnels).to.have.length(10);
      });

      it("Check tunnels", () => {
        expect(s.tunnels[0].state).to.equal(0);
        expect(s.tunnels[0].retried).to.equal(0);
        expect(s.tunnels[0].index).to.equal(1);
        expect(s.tunnels[0].options.port).to.equal(4000);

        expect(s.tunnels[5].state).to.equal(0);
        expect(s.tunnels[5].retried).to.equal(0);
        expect(s.tunnels[5].index).to.equal(6);
        expect(s.tunnels[5].options.port).to.equal(4025);
      });
    });
  });

  describe("Start tunnels", () => {
    let s = null;

    before((done) => {
      s = new Supervisor({
        tunnelAmount: 3,
        tunnelConfig: {
          "username": "fake_name",
          "accessKey": "fake_key",
          "verbose": false,
          "proxy": null,
          "tunnelIdentifier": "testfortest",
          "waitTunnelShutdown": true,
          "noRemoveCollidingTunnels": true,
          "sharedTunnel": true,

          "restartCron": "*/2 * * * *"
        },
        restartCron: false
      });

      s.stage().then(done);
    });

    it("All tunnels start successfully", (done) => {
      for (let i = 0; i < s.tunnels.length; i++) {
        s.tunnels[i].start = () => Promise.resolve();
      }

      s.startTunnels()
        .then(() => {
          expect(true).to.equal(true);
          done();
        })
        .catch(() => {
          expect(true).to.equal(false);
          done();
        });
    });

    it("All tunnels fail in starting", (done) => {
      for (let i = 0; i < s.tunnels.length; i++) {
        s.tunnels[i].start = () => Promise.reject();
      }

      s.startTunnels()
        .then(() => {
          expect(true).to.equal(false);
          done();
        })
        .catch(() => {
          expect(true).to.equal(true);
          done();
        });
    });

    it("One tunnel fails in starting", (done) => {
      s.tunnels[0].start = () => Promise.resolve();
      s.tunnels[1].start = () => Promise.reject();
      s.tunnels[2].start = () => Promise.resolve();

      s.startTunnels()
        .then(() => {
          expect(true).to.equal(false);
          done();
        })
        .catch(() => {
          expect(true).to.equal(true);
          done();
        });
    });

    it("More tunnels fail in starting", (done) => {
      s.tunnels[0].start = () => Promise.resolve();
      s.tunnels[1].start = () => Promise.reject();
      s.tunnels[2].start = () => Promise.reject();

      s.startTunnels()
        .then(() => {
          expect(true).to.equal(false);
          done();
        })
        .catch(() => {
          expect(true).to.equal(true);
          done();
        });
    });
  })
});