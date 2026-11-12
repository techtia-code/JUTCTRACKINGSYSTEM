import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findJourneys,
  isInJamaica,
  routeLabel,
  routeMatchesSearch,
  validateAlert,
  validateRoute,
  validateRouteNumber,
  validateStop
} from "../JS/planner.js";

const routes = [
  { id: "a", name: "Downtown to Half-Way Tree", stops: ["Downtown Kingston", "Cross Roads", "Half-Way Tree"] },
  { id: "b", name: "Half-Way Tree to Papine", stops: ["Half-Way Tree", "Liguanea", "Papine"] }
];
const stops = ["Downtown Kingston", "Cross Roads", "Half-Way Tree", "Liguanea", "Papine"];

test("finds a direct journey in travel order", () => {
  const { matches } = findJourneys(routes, stops, "Downtown Kingston", "Half-Way Tree");
  assert.equal(matches.length, 1);
  assert.deepEqual(matches[0].path, ["Downtown Kingston", "Cross Roads", "Half-Way Tree"]);
});

test("finds a journey in the opposite direction", () => {
  const { matches } = findJourneys(routes, stops, "Papine", "Liguanea");
  assert.deepEqual(matches[0].path, ["Papine", "Liguanea"]);
});

test("ignores case and extra spaces in stop names", () => {
  const { matches } = findJourneys(routes, stops, "  cross roads ", "HALF-WAY TREE");
  assert.equal(matches.length, 1);
});

test("returns no matches when no direct route connects the stops", () => {
  assert.deepEqual(findJourneys(routes, stops, "Cross Roads", "Papine").matches, []);
});

test("rejects unknown and repeated stops", () => {
  assert.ok(findJourneys(routes, stops, "Mandeville", "Papine").error);
  assert.ok(findJourneys(routes, stops, "Papine", "papine").error);
});

test("route search matches route names and stops", () => {
  assert.equal(routeMatchesSearch(routes[0], "downtown"), true);
  assert.equal(routeMatchesSearch(routes[1], "liguanea"), true);
  assert.equal(routeMatchesSearch(routes[1], "cross roads"), false);
});

test("route search and labels use the JUTC route number", () => {
  const numbered = { ...routes[1], number: "900" };
  assert.equal(routeMatchesSearch(numbered, "900"), true);
  assert.equal(routeMatchesSearch(numbered, "22"), false);
  assert.equal(routeLabel(numbered), "900 · Half-Way Tree to Papine");
  assert.equal(routeLabel(routes[0]), "Downtown to Half-Way Tree", "a route without a number shows just its name");
});

test("route numbers follow the JUTC style and are unique", () => {
  const numbered = [{ ...routes[0], number: "22" }, { ...routes[1], number: "21A" }];
  assert.deepEqual(validateRouteNumber(" 21ax ", [], null), { number: "21AX" });
  assert.deepEqual(validateRouteNumber("900", numbered, null), { number: "900" });
  for (const bad of ["", "A22", "1234", "22-A", "22ABCD", "JUTC-SAMPLE-1a2b"]) {
    assert.equal(validateRouteNumber(bad, numbered, null).field, "number", bad + " must be rejected");
  }
  assert.match(validateRouteNumber("21a", numbered, null).error, /already/);
  assert.deepEqual(validateRouteNumber("21A", numbered, "b"), { number: "21A" }, "a route can keep its own number");
});

test("accepts a valid route and corrects the stop capitalization", () => {
  const result = validateRoute(" New route ", "liguanea, PAPINE", stops, routes, null);
  assert.deepEqual(result, { name: "New route", stops: ["Liguanea", "Papine"] });
});

test("rejects invalid route details", () => {
  assert.equal(validateRoute("ab", "Liguanea, Papine", stops, routes, null).field, "name");
  assert.equal(validateRoute("New route", "Liguanea", stops, routes, null).field, "stops");
  assert.equal(validateRoute("New route", "Liguanea, Mandeville", stops, routes, null).field, "stops");
  assert.equal(validateRoute("New route", "Papine, papine", stops, routes, null).field, "stops");
});

test("rejects a duplicate route name unless it is the route being edited", () => {
  const name = "half-way tree to papine";
  assert.equal(validateRoute(name, "Liguanea, Papine", stops, routes, null).field, "name");
  assert.equal(validateRoute(name, "Liguanea, Papine", stops, routes, "b").error, undefined);
});

test("validates alert messages and delays", () => {
  assert.deepEqual(validateAlert(" Road closed ", "10"), { message: "Road closed", delayMinutes: 10 });
  assert.equal(validateAlert("Hi", "0").field, "message");
  assert.equal(validateAlert("Road closed", "-1").field, "delay");
  assert.equal(validateAlert("Road closed", "1.5").field, "delay");
  assert.equal(validateAlert("Road closed", "121").field, "delay");
});

const savedStops = [
  { id: 1, name: "Half-Way Tree", lat: 18.0119, lng: -76.7969 },
  { id: 2, name: "Papine", lat: 18.0168, lng: -76.7422 }
];

test("accepts a new stop in Jamaica", () => {
  assert.deepEqual(validateStop("  Barbican   Square ", "18.0302", "-76.7790", savedStops, null),
    { name: "Barbican Square", lat: 18.0302, lng: -76.779 });
});

test("refuses a stop name that is too short or already used", () => {
  assert.equal(validateStop("X", "18.03", "-76.78", savedStops, null).field, "name");
  assert.equal(validateStop("papine", "18.03", "-76.78", savedStops, null).field, "name");
});

test("lets a stop keep its own name when edited", () => {
  assert.equal(validateStop("Papine", "18.02", "-76.74", savedStops, 2).name, "Papine");
});

test("refuses coordinates that are missing or outside Jamaica", () => {
  assert.equal(validateStop("New stop", "", "-76.78", savedStops, null).field, "lat");
  assert.equal(validateStop("New stop", "40.71", "-76.78", savedStops, null).field, "lat");
  assert.equal(validateStop("New stop", "18.03", "-74.00", savedStops, null).field, "lng");
  assert.equal(validateStop("New stop", "18.03", "abc", savedStops, null).field, "lng");
});

test("knows where Jamaica is", () => {
  assert.equal(isInJamaica(18.0119, -76.7969), true);
  assert.equal(isInJamaica(25.76, -80.19), false);
  assert.equal(isInJamaica(NaN, -76.79), false);
});
