// "Notify me" on the arrivals panel: tells a commuter once when their bus is
// within 1 km of their stop, and whenever a new delay is reported for the
// route on the way. Pure, so it can be tested; home.js shows the messages.

export const NEAR_STOP_METRES = 1000;

// A watch on one route and stop. delaySeen is the delay already reported
// when the commuter asked, so only a new delay is announced.
export function startWatch(routeId, stop, delayMinutes) {
  return { routeId, stop, delaySeen: delayMinutes, done: false };
}

// Returns the watch as it is after this update and what to tell the
// commuter. Once the bus is near the stop the watch is done.
export function checkWatch(watch, metresToStop, delayMinutes) {
  if (watch.done) return { watch, messages: [] };

  const messages = [];
  let delaySeen = watch.delaySeen;
  if (delayMinutes > delaySeen) {
    messages.push({
      kind: "delay",
      text: "Delay on your route: about " + delayMinutes + " min. Your arrival estimate has been updated."
    });
  }
  // A delay that is cleared and comes back is announced again.
  delaySeen = delayMinutes;

  const near = metresToStop <= NEAR_STOP_METRES;
  if (near) {
    messages.push({
      kind: "near",
      text: "Your bus is less than 1 km from " + watch.stop + "."
    });
  }

  return { watch: { ...watch, delaySeen, done: near }, messages };
}
