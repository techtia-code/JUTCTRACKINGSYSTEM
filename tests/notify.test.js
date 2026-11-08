import assert from "node:assert/strict";
import { test } from "node:test";
import { checkWatch, NEAR_STOP_METRES, startWatch } from "../JS/notify.js";

test("says nothing while the bus is far away and nothing changes", () => {
  const { watch, messages } = checkWatch(startWatch("a", "Papine", 0), 5000, 0);
  assert.deepEqual(messages, []);
  assert.equal(watch.done, false);
});

test("tells the commuter once when the bus is within 1 km", () => {
  const first = checkWatch(startWatch("a", "Papine", 0), NEAR_STOP_METRES, 0);
  assert.equal(first.messages.length, 1);
  assert.equal(first.messages[0].kind, "near");
  assert.match(first.messages[0].text, /Papine/);
  assert.equal(first.watch.done, true);
  assert.deepEqual(checkWatch(first.watch, 200, 0).messages, []);
});

test("a delay reported before asking is not announced", () => {
  assert.deepEqual(checkWatch(startWatch("a", "Papine", 5), 5000, 5).messages, []);
});

test("a new or longer delay is announced once", () => {
  const first = checkWatch(startWatch("a", "Papine", 0), 5000, 10);
  assert.equal(first.messages[0].kind, "delay");
  assert.match(first.messages[0].text, /10 min/);
  assert.deepEqual(checkWatch(first.watch, 4000, 10).messages, []);
  assert.equal(checkWatch(first.watch, 4000, 15).messages[0].kind, "delay");
});

test("a delay that is cleared and comes back is announced again", () => {
  const cleared = checkWatch(checkWatch(startWatch("a", "Papine", 0), 5000, 10).watch, 5000, 0);
  assert.deepEqual(cleared.messages, []);
  assert.equal(checkWatch(cleared.watch, 5000, 10).messages[0].kind, "delay");
});
