import Supervisor from "../supervisor";
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

chai.use(chaiAsPromise);

const expect = chai.expect;
const assert = chai.assert;

describe("Supervisor", () => {
  it("Initialization", () => {
    let s = new Supervisor({
      config: {
        tunnel: {
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
        supervisor: {
          "portStart": 4000,
          "portIndent": 6
        },
        stats: {
          "statsType": "influxdb",
          "statsHost": "",
          "statsPort": null,
          "statsPrefix": "testdddtest.",
          "statsDatabase": ""
        }
      },
      tunnelAmount: 1,
      statsSwitch: false,
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

      before(() => {
        s = new Supervisor({
          config: {
            tunnel: {
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
            stats: {
              "statsType": "influxdb",
              "statsHost": "",
              "statsPort": null,
              "statsPrefix": "testdddtest.",
              "statsDatabase": ""
            },
            supervisor: {
              "portStart": 4000,
              "portIndent": 6
            }
          },
          tunnelAmount: 1,
          statsSwitch: false,
          restartCron: false
        });

        return s.stage();
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

      before(() => {
        s = new Supervisor({
          config: {
            tunnel: {
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
            stats: {
              "statsType": "influxdb",
              "statsHost": "",
              "statsPort": null,
              "statsPrefix": "testdddtest.",
              "statsDatabase": ""
            },
            supervisor: {
              "portStart": 4000,
              "portIndent": 5
            }
          },
          tunnelAmount: 10,
          statsSwitch: false,
          restartCron: false
        });

        return s.stage();
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

    before(() => {
      s = new Supervisor({
        tunnelAmount: 3,
        config: {
          tunnel: {
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
          supervisor: {
            "portStart": 4000,
            "portIndent": 6
          }
        },
        restartCron: false
      });

      return s.stage();
    });

    it("All tunnels start successfully", () => {
      for (let i = 0; i < s.tunnels.length; i++) {
        s.tunnels[i].start = () => Promise.resolve();
      }

      return s.startTunnels()
        .catch(err => assert(false, "One of the tunnel failed in starting"))
    });

    it("All tunnels fail in starting", () => {
      for (let i = 0; i < s.tunnels.length; i++) {
        s.tunnels[i].start = () => Promise.reject();
      }

      return s.startTunnels()
        .then(() => assert(false, "One of the tunnel succeeded in starting"))
        .catch(err => Promise.resolve());
    });

    it("One tunnel fails in starting", () => {
      s.tunnels[0].start = () => Promise.resolve();
      s.tunnels[1].start = () => Promise.reject();
      s.tunnels[2].start = () => Promise.resolve();

      return s.startTunnels()
        .then(() => assert(false, "One of the tunnel succeeded in starting"))
        .catch(err => Promise.resolve());
    });

    it("More tunnels fail in starting", () => {
      s.tunnels[0].start = () => Promise.resolve();
      s.tunnels[1].start = () => Promise.reject();
      s.tunnels[2].start = () => Promise.reject();

      return s.startTunnels()
        .then(() => assert(false, "One of the tunnel succeeded in starting"))
        .catch(err => Promise.resolve());
    });
  });

  describe("Stop tunnels", () => {
    let s = null;

    before(() => {
      s = new Supervisor({
        tunnelAmount: 3,
        config: {
          tunnel: {
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
          supervisor: {
            "portStart": 4000,
            "portIndent": 6
          }
        },
        restartCron: false
      });

      return s
        .stage();
    });

    it("All tunnels stop successfully", () => {
      for (let i = 0; i < s.tunnels.length; i++) {
        s.tunnels[i].stop = () => Promise.resolve();
      }

      return s.stopTunnels()
        .catch(err => assert(false, "One of the tunnel failed in starting"))
    });
  });

  describe("Stats", () => {
    it("Stats is enabled with valid adaptor", () => {
      let s = new Supervisor({
        config: {
          tunnel: {
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
          supervisor: {
            "portStart": 4000,
            "portIndent": 6
          },
          stats: {
            "statsType": "influxdb",
            "statsHost": "",
            "statsPort": null,
            "statsPrefix": "testdddtest.",
            "statsDatabase": ""
          }
        },
        tunnelAmount: 3,
        statsSwitch: true,
        restartCron: false
      });

      assert(true, "Stats is enabled with valid adaptor");
    });

    it("Stats is enabled with invalid adaptor", () => {
      try {
        let s = new Supervisor({
          config: {
            tunnel: {
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
            supervisor: {
              "portStart": 4000,
              "portIndent": 6
            },
            stats: {
              "statsType": "mongodb",
              "statsHost": "",
              "statsPort": null,
              "statsPrefix": "testdddtest.",
              "statsDatabase": ""
            }
          },
          tunnelAmount: 3,
          statsSwitch: true,
          restartCron: false
        });

        assert(false, "Stats is enabled with invalid adaptor")
      } catch (err) {
        expect(err.message).to.equal("No such stats adaptor found in lib/stats/");
      }
    });

    it("Stats is disabled with invalid adaptor", () => {
      try {
        let s = new Supervisor({
          config: {
            tunnel: {
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
            supervisor: {
              "portStart": 4000,
              "portIndent": 6
            },

            stats: {
              "statsType": "mongodb",
              "statsHost": "",
              "statsPort": null,
              "statsPrefix": "testdddtest.",
              "statsDatabase": ""
            },
          },
          tunnelAmount: 3,
          statsSwitch: false,
          restartCron: false
        });

        assert(true, "Stats is disabled with invalid adaptor")
      } catch (err) {
        assert(false, "Stats is enabled with invalid adaptor")
      }
    });
  });
});