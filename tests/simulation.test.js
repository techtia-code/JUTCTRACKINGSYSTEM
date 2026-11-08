import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AVERAGE_SPEED_METRES_PER_SECOND,
  findBusPosition,
  getDelayMinutes,
  getDistanceMetres,
  getEtaMinutes,
  makeRoutePath
} from "../JS/simulation.js";

const route = { id: "a", name: "Test route", stops: ["First", "Middle", "Last"] };
const stopCoordinates = {
  First: [18.0, -76.8],
  Middle: [18.01, -76.8],
  Last: [18.02, -76.8]
};
const path = makeRoutePath(route, stopCoordinates);
const routeLength = path.distances[2];

// The clock time at which the bus has travelled this many metres.
function timeAt(metres) {
  return metres / AVERAGE_SPEED_METRES_PER_SECOND * 1000;
}

test("measures distance between two points", () => {
  // One hundredth of a degree of latitude is about 1112 metres.
  assert.ok(Math.abs(getDistanceMetres([18.0, -76.8], [18.01, -76.8]) - 1112) < 1);
});

test("builds cumulative distances along a route", () => {
  assert.equal(path.distances[0], 0);
  assert.ok(Math.abs(path.distances[2] - path.distances[1] * 2) < 0.01);
});

test("starts the bus at the first stop", () => {
  const { latLng, nextStop } = findBusPosition(route, path, 0);
  assert.deepEqual(latLng, [18.0, -76.8]);
  assert.equal(nextStop, "Middle");
});

test("places the bus between stops", () => {
  const { latLng, nextStop } = findBusPosition(route, path, timeAt(routeLength * 0.75));
  assert.ok(Math.abs(latLng[0] - 18.015) < 0.0001);
  assert.equal(nextStop, "Last");
});

test("turns the bus around at the end of the route", () => {
  const { latLng, nextStop } = findBusPosition(route, path, timeAt(routeLength * 1.25));
  assert.ok(Math.abs(latLng[0] - 18.015) < 0.0001);
  assert.equal(nextStop, "Middle");
});

test("repeats the trip after a full round trip", () => {
  const { latLng } = findBusPosition(route, path, timeAt(routeLength * 2 + 100));
  assert.ok(Math.abs(latLng[0] - findBusPosition(route, path, timeAt(100)).latLng[0]) < 0.0001);
});

test("calculates the ETA from distance and average speed", () => {
  const minutes = routeLength / AVERAGE_SPEED_METRES_PER_SECOND / 60;
  assert.equal(getEtaMinutes(route, path, "Last", 0, 0), Math.round(minutes));
});

test("the ETA is zero when the bus is at the stop", () => {
  assert.equal(getEtaMinutes(route, path, "Middle", timeAt(path.distances[1]), 0), 0);
});

test("the ETA uses the next pass when the bus has already gone by", () => {
  // Past Middle, the bus goes on to Last and comes back: 0.25 + 0.5 of the route.
  const expected = routeLength * 0.75 / AVERAGE_SPEED_METRES_PER_SECOND / 60;
  assert.equal(getEtaMinutes(route, path, "Middle", timeAt(routeLength * 0.75), 0), Math.round(expected));
});

test("adds the traffic delay to the ETA", () => {
  const withoutDelay = getEtaMinutes(route, path, "Last", 0, 0);
  assert.equal(getEtaMinutes(route, path, "Last", 0, 7), withoutDelay + 7);
});

test("adds delays for the route and for all routes", () => {
  const alerts = [
    { routeId: "a", delayMinutes: 5 },
    { routeId: null, delayMinutes: 3 },
    { routeId: "b", delayMinutes: 20 }
  ];
  assert.equal(getDelayMinutes(alerts, "a"), 8);
  assert.equal(getDelayMinutes([], "a"), 0);
});
test('rejects consecutive coincident or invalid stop coordinates instead of producing NaN', () => {
  assert.throws(() => makeRoutePath({ stops: ['A','B'] }, { A: [18,-76], B: [18,-76] }), /coordinates|length/i);
  assert.throws(() => makeRoutePath({ stops: ['A','B'] }, { A: [18,-76], B: [NaN,-76] }), /coordinates/i);
});
