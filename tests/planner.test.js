import assert from "node:assert/strict";
import { test } from "node:test";
import { findJourneys, routeMatchesSearch, validateAlert, validateRoute } from "../JS/planner.js";

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
