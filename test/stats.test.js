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

describe("Stats", () => {
  let statsMock = null;

  let options = {
    statsSwitch: false,
    statsHost: "some.where.local.org",
    statsPort: null,
    statsPrefix: "fake."
  };

  let s = null;

  beforeEach(() => {
    statsMock = { gauge(key, timestamp, data, tags, callback) { return Promise.resolve() } };

    s = new StatsQueue(_.extend({}, options, { statsClient: statsMock }));
  });

  it("Initialization", () => {
    expect(s.statsSwitch).to.equal(options.statsSwitch);
    expect(s.statsPrefix).to.equal(options.statsPrefix);
  });

  it("Build empty queue", () => {
    let q = s.build();

    _.forEach(EVENT, (v, k) => {
      expect(q).to.have.property(v);
    });
  });

  describe("Push event", () => {
    it("Switch is off", () => {
      s.statsSwitch = false;

      return s
        .push({
          eventType: EVENT.TUNNEL_STATUS,
          timestamp: 123123123,
          tunnelIndex: 1,
          data: 1
        })
        .then(() => expect(Promise.resolve(_.values(s.statsQueue[EVENT.TUNNEL_STATUS]).length)).to.eventually.equal(0))
        .catch(err => assert(false, err.toString()));
    });
    describe("Switch is on", () => {
      beforeEach(() => {
        s.statsSwitch = true;
      });

      it("First event of its kind", () => {

        return s
          .push({
            eventType: EVENT.TUNNEL_STATUS,
            timestamp: 123123123,
            tunnelIndex: "1",
            data: 999
          })
          .then(() => expect(Promise.resolve(_.values(s.statsQueue[EVENT.TUNNEL_STATUS]).length)).to.eventually.equal(1))
          .then(() => expect(Promise.resolve(s.statsQueue[EVENT.TUNNEL_STATUS]["1"].timestamp)).to.eventually.equal(123123123))
          .then(() => expect(Promise.resolve(s.statsQueue[EVENT.TUNNEL_STATUS]["1"].event.data)).to.eventually.equal(999))
          .then(() => expect(Promise.resolve(s.statsQueue[EVENT.TUNNEL_STATUS]["1"].event.eventType)).to.eventually.equal(EVENT.TUNNEL_STATUS))
          .then(() => expect(Promise.resolve(s.statsQueue[EVENT.TUNNEL_STATUS]["1"].event.tunnelIndex)).to.eventually.equal("1"))
          .catch(err => assert(false, err.toString()));
      });

      it("Latest event of its kind", () => {

        return s
          .push({
            eventType: EVENT.TUNNEL_STATUS,
            timestamp: 123123123,
            tunnelIndex: "1",
            data: 999
          })
          .then(() => s.push({
            eventType: EVENT.TUNNEL_STATUS,
            timestamp: 123123125,
            tunnelIndex: "1",
            data: 888
          }))
          .then(() => expect(Promise.resolve(_.values(s.statsQueue[EVENT.TUNNEL_STATUS]).length)).to.eventually.equal(1))
          .then(() => expect(Promise.resolve(s.statsQueue[EVENT.TUNNEL_STATUS]["1"].timestamp)).to.eventually.equal(123123125))
          .then(() => expect(Promise.resolve(s.statsQueue[EVENT.TUNNEL_STATUS]["1"].event.data)).to.eventually.equal(888))
          .then(() => expect(Promise.resolve(s.statsQueue[EVENT.TUNNEL_STATUS]["1"].event.eventType)).to.eventually.equal(EVENT.TUNNEL_STATUS))
          .then(() => expect(Promise.resolve(s.statsQueue[EVENT.TUNNEL_STATUS]["1"].event.tunnelIndex)).to.eventually.equal("1"))
          .catch(err => assert(false, err.toString()));
      });

      it("Not latest event of its kind", () => {

        return s
          .push({
            eventType: EVENT.TUNNEL_STATUS,
            timestamp: 123123123,
            tunnelIndex: "1",
            data: 999
          })
          .then(() => s.push({
            eventType: EVENT.TUNNEL_STATUS,
            timestamp: 123123120,
            tunnelIndex: "1",
            data: 888
          }))
          .then(() => expect(Promise.resolve(_.values(s.statsQueue[EVENT.TUNNEL_STATUS]).length)).to.eventually.equal(1))
          .then(() => expect(Promise.resolve(s.statsQueue[EVENT.TUNNEL_STATUS]["1"].timestamp)).to.eventually.equal(123123123))
          .then(() => expect(Promise.resolve(s.statsQueue[EVENT.TUNNEL_STATUS]["1"].event.data)).to.eventually.equal(999))
          .then(() => expect(Promise.resolve(s.statsQueue[EVENT.TUNNEL_STATUS]["1"].event.eventType)).to.eventually.equal(EVENT.TUNNEL_STATUS))
          .then(() => expect(Promise.resolve(s.statsQueue[EVENT.TUNNEL_STATUS]["1"].event.tunnelIndex)).to.eventually.equal("1"))
          .catch(err => assert(false, err.toString()));
      });

      it("Event type isn't allowed", () => {

        return s
          .push({
            eventType: "some_random_event",
            timestamp: 123123123,
            tunnelIndex: "1",
            data: 999
          })
          .then(() => expect(Promise.resolve(_.values(s.statsQueue[EVENT.TUNNEL_STATUS]).length)).to.eventually.equal(0))
          .catch(err => assert(false, err.toString()));
      });
    });
  });

  describe("Drain events", () => {
    beforeEach(() => {
      s.statsSwitch = true;
    });

    it("Queue is empty", () => {
      return s
        .drain()
        .then(() => expect(Promise.resolve(_.values(s.statsQueue[EVENT.TUNNEL_STATUS]).length)).to.eventually.equal(0))
        .catch(err => assert(false, "statsQueue isn't drained completely"));
    });

    it("Queue isn't empty", () => {

      return s
        .push({
          eventType: EVENT.TUNNEL_STATUS,
          timestamp: 123123123,
          tunnelIndex: "1",
          data: 999
        })
        .then(() => s.drain())
        .then(() => expect(Promise.resolve(_.values(s.statsQueue[EVENT.TUNNEL_STATUS]).length)).to.eventually.equal(0))
        .catch(err => assert(false, "statsQueue isn't drained completely"));
    });
  });
});