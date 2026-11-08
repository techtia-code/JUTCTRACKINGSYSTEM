import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";
import { fetchRoadLegs, pointAlongLine, positionOnRoads } from "../JS/roads.js";

// A stand-in for the browser's localStorage, emptied before each test.
const storage = new Map();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: key => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value))
  }
});

beforeEach(() => {
  storage.clear();
  mock.restoreAll();
});

// Within about 10 cm.
function assertNear(actual, expected) {
  assert.ok(
    Math.abs(actual[0] - expected[0]) < 1e-6 && Math.abs(actual[1] - expected[1]) < 1e-6,
    "expected " + expected + " but got " + actual
  );
}

// About 1.1 km north, then about 3.3 km further north.
const line = [[18.0, -76.8], [18.01, -76.8], [18.04, -76.8]];

test("finds points along a line by distance, not by number of points", () => {
  assertNear(pointAlongLine(line, 0), [18.0, -76.8]);
  assertNear(pointAlongLine(line, 0.125), [18.005, -76.8]);
  assertNear(pointAlongLine(line, 0.5), [18.02, -76.8]);
  assertNear(pointAlongLine(line, 1), [18.04, -76.8]);
});

test("keeps points on the line for shares below 0 and above 1", () => {
  assertNear(pointAlongLine(line, -0.5), [18.0, -76.8]);
  assertNear(pointAlongLine(line, 1.5), [18.04, -76.8]);
});

test("handles a line with a repeated point", () => {
  assertNear(pointAlongLine([[18.0, -76.8], [18.0, -76.8], [18.01, -76.8]], 0.5), [18.005, -76.8]);
});

test("draws a bus on the straight line until the roads load", () => {
  const position = { latLng: [18.003, -76.8], leg: 0, progress: 0.3 };
  assert.deepEqual(positionOnRoads(position, null), [18.003, -76.8]);
});

test("draws a bus on the road between the stops it is between", () => {
  const roadLegs = [[[18.0, -76.8], [18.01, -76.8]], [[18.01, -76.8], [18.01, -76.79], [18.02, -76.79]]];
  const position = { latLng: [0, 0], leg: 1, progress: 0.5 };
  assertNear(positionOnRoads(position, roadLegs), pointAlongLine(roadLegs[1], 0.5));
});

// Three stops, and a router reply with two road segments to the middle stop
// and one to the last. The router uses [longitude, latitude].
const stops = [[18.0, -76.8], [18.01, -76.8], [18.02, -76.79]];
const routerReply = {
  code: "Ok",
  routes: [{
    geometry: { coordinates: [[-76.8, 18.0], [-76.801, 18.005], [-76.8, 18.01], [-76.79, 18.02]] },
    legs: [{ annotation: { distance: [600, 600] } }, { annotation: { distance: [1500] } }]
  }]
};

function mockRouter(reply, ok = true) {
  return mock.method(globalThis, "fetch", async () => ({ ok, json: async () => reply }));
}

test("splits the router's roads into one list of points per pair of stops", async () => {
  const router = mockRouter(routerReply);
  const legs = await fetchRoadLegs(stops);

  assert.deepEqual(legs, [
    [[18.0, -76.8], [18.005, -76.801], [18.01, -76.8]],
    [[18.01, -76.8], [18.02, -76.79]]
  ]);
  assert.ok(router.mock.calls[0].arguments[0].includes("-76.8,18;-76.8,18.01;-76.79,18.02?"));
});

test("asks the router only once for the same stops", async () => {
  const router = mockRouter(routerReply);
  await fetchRoadLegs(stops);
  const again = await fetchRoadLegs(stops);

  assert.equal(router.mock.callCount(), 1);
  assert.equal(again.length, 2);
});

test("falls back to straight lines when the router cannot help", async () => {
  mockRouter(routerReply, false);
  assert.equal(await fetchRoadLegs(stops), null, "router error");

  mockRouter({ code: "NoRoute", routes: [] });
  assert.equal(await fetchRoadLegs(stops), null, "no route found");

  const oneLeg = { code: "Ok", routes: [{ ...routerReply.routes[0], legs: [routerReply.routes[0].legs[0]] }] };
  mockRouter(oneLeg);
  assert.equal(await fetchRoadLegs(stops), null, "wrong number of legs");

  mock.method(console, "warn", () => {});
  mock.method(globalThis, "fetch", async () => { throw new TypeError("Failed to fetch"); });
  assert.equal(await fetchRoadLegs(stops), null, "offline");
});

test("does not ask the router about a route with fewer than two stops", async () => {
  const router = mockRouter(routerReply);
  assert.equal(await fetchRoadLegs([[18.0, -76.8]]), null);
  assert.equal(router.mock.callCount(), 0);
});
