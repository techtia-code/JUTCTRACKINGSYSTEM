import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AVERAGE_SPEED_METRES_PER_SECOND,
  findPositionFromTravelled,
  getBusTravelled,
  getDirectionFromMove,
  getDirectionFromTravelled,
  getDistanceAlongRoute,
  getEtaFromTravelled,
  getEtaMinutes,
  getMetresToStop,
  getSimulatedTravelled,
  getTravelledFromLocation,
  makeRoutePath
} from "../JS/simulation.js";

// An L-shaped route: north from First to Middle, then east to Last.
const route = { id: "a", name: "Test route", stops: ["First", "Middle", "Last"] };
const stopCoordinates = {
  First: [18.0, -76.8],
  Middle: [18.01, -76.8],
  Last: [18.01, -76.79]
};
const path = makeRoutePath(route, stopCoordinates);
const routeLength = path.distances[2];

function near(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, label + ": " + actual + " is not about " + expected);
}

test("a location on a stop is that stop's distance along the route", () => {
  near(getDistanceAlongRoute(path, [18.0, -76.8]), 0, 1, "First");
  near(getDistanceAlongRoute(path, [18.01, -76.8]), path.distances[1], 1, "Middle");
  near(getDistanceAlongRoute(path, [18.01, -76.79]), routeLength, 1, "Last");
});

test("a location between stops is part way along", () => {
  near(getDistanceAlongRoute(path, [18.005, -76.8]), path.distances[1] / 2, 2, "halfway to Middle");
});

test("a location off the route line is matched to the nearest point on it", () => {
  // About 100 m west of the halfway point of the first leg
  near(getDistanceAlongRoute(path, [18.005, -76.80095]), path.distances[1] / 2, 2, "west of the line");
  // Past the end of the route: matched to Last
  near(getDistanceAlongRoute(path, [18.01, -76.785]), routeLength, 1, "beyond Last");
});

test("an inbound bus has travelled the whole route and part of the way back", () => {
  const along = path.distances[1] / 2;
  near(getTravelledFromLocation(path, [18.005, -76.8], "outbound"), along, 2, "outbound");
  near(getTravelledFromLocation(path, [18.005, -76.8], "inbound"), routeLength * 2 - along, 2, "inbound");
});

test("a shared location gives the same position and next stop back", () => {
  const travelled = getTravelledFromLocation(path, [18.01, -76.795], "outbound");
  const { latLng, nextStop } = findPositionFromTravelled(route, path, travelled);
  near(latLng[0], 18.01, 0.0001, "latitude");
  near(latLng[1], -76.795, 0.0001, "longitude");
  assert.equal(nextStop, "Last");
  const inbound = getTravelledFromLocation(path, [18.01, -76.795], "inbound");
  assert.equal(findPositionFromTravelled(route, path, inbound).nextStop, "Middle");
});

test("the direction follows the change along the route, ignoring GPS noise", () => {
  assert.equal(getDirectionFromMove(null, 500, "outbound"), "outbound");
  assert.equal(getDirectionFromMove(500, 600, "inbound"), "outbound");
  assert.equal(getDirectionFromMove(600, 500, "outbound"), "inbound");
  assert.equal(getDirectionFromMove(500, 510, "inbound"), "inbound");
});

test("the direction of a simulated drive turns at the end of the route", () => {
  assert.equal(getDirectionFromTravelled(path, routeLength / 2), "outbound");
  assert.equal(getDirectionFromTravelled(path, routeLength * 1.5), "inbound");
});

test("a live location is used when there is one, otherwise the simulation", () => {
  const live = getBusTravelled(path, { latLng: [18.01, -76.8], direction: "outbound" }, 0);
  assert.equal(live.live, true);
  near(live.travelled, path.distances[1], 1, "live");
  const simulated = getBusTravelled(path, undefined, 123456);
  assert.equal(simulated.live, false);
  assert.equal(simulated.travelled, getSimulatedTravelled(path, 123456));
});

test("the ETA from a live location matches the simulated ETA at the same place", () => {
  const time = 60000;
  const travelled = getSimulatedTravelled(path, time);
  assert.equal(getEtaFromTravelled(route, path, "Last", travelled, 2), getEtaMinutes(route, path, "Last", time, 2));
});

test("measures how far the bus still has to drive to a stop", () => {
  near(getMetresToStop(route, path, "Last", 0), routeLength, 1, "from First");
  near(getMetresToStop(route, path, "Middle", path.distances[1]), 0, 1, "at Middle");
  // Turning round at Last, Middle is one leg back
  near(getMetresToStop(route, path, "Middle", routeLength), routeLength - path.distances[1], 1, "back from Last");
  const minutes = routeLength / AVERAGE_SPEED_METRES_PER_SECOND / 60;
  assert.equal(getEtaFromTravelled(route, path, "Last", 0, 0), Math.round(minutes));
});
