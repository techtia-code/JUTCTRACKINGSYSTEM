import {
  loadStops,
  shareBusLocation,
  stopSharingLocation
} from "./data.js";
import { setMessage } from "./dom.js";
import { fetchRoadLegs, positionOnRoads } from "./roads.js";
import {
  AVERAGE_SPEED_METRES_PER_SECOND,
  findPositionFromTravelled,
  getDirectionFromMove,
  getDirectionFromTravelled,
  getDistanceAlongRoute,
  makeRoutePath
} from "./simulation.js";

// A driver shares the bus's position every 5 seconds while sharing is on,
// the same rate the map and arrival estimates update at.
const SEND_INTERVAL_MS = 5000;

// Errors that will not go away by trying again
const STOP_SHARING_ERRORS = /not a bus driver|outside Jamaica/;

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

export async function initRouteSharing(route, api = { loadStops, shareBusLocation, stopSharingLocation, fetchRoadLegs }) {
  const allStops = await api.loadStops();
  const stopCoordinates = Object.fromEntries(allStops.map(stop => [stop.name, [stop.lat, stop.lng]]));
  const path = makeRoutePath(route, stopCoordinates);
  // Simulated drives follow the same roads as the map, once they have loaded.
  let roadLegs = null;
  api.fetchRoadLegs(path.points).then(legs => { roadLegs = legs; });

  const status = document.getElementById("route-sharing-status");
  const lastSent = document.getElementById("driver-last-sent");
  const message = document.getElementById("driver-message");
  const gpsButton = document.getElementById("share-gps");
  const simulateButton = document.getElementById("simulate-drive");
  const stopButton = document.getElementById("stop-sharing");

  document.getElementById("driver-route").textContent = route.name;
  document.getElementById("driver-route-stops").textContent = route.stops.join(" to ");

  let mode = null;
  let timer = null;
  let watchId = null;
  let latest = null;
  let previousAlong = null;
  let direction = "outbound";
  let sending = false;
  let pendingSend = null;
  let generation = 0;
  let stopping = false;
  let wakeLock = null;

  async function keepScreenOn() {
    // The phone stops sharing its location when the screen locks.
    try {
      const token = generation;
      const requested = window.navigator.wakeLock ? await window.navigator.wakeLock.request("screen") : null;
      if (token !== generation || !mode) { requested?.release().catch(() => {}); return; }
      wakeLock = requested;
    } catch {
      wakeLock = null;
    }
  }

  function showSharing(text) {
    status.textContent = text;
    status.classList.toggle("is-live", Boolean(mode));
    gpsButton.hidden = Boolean(mode);
    simulateButton.hidden = Boolean(mode);
    stopButton.hidden = !mode;
  }

  async function send() {
    if (!latest || sending || !mode) return;
    const payload = latest;
    const token = generation;
    sending = true;
    try {
      pendingSend = Promise.resolve().then(() => api.shareBusLocation(payload.latLng[0], payload.latLng[1], payload.direction));
      await pendingSend;
      if (token !== generation) return;
      lastSent.textContent = "Last shared at " + formatTime(new Date()) + ", heading " +
        (payload.direction === "outbound" ? "to " + route.stops[route.stops.length - 1] : "to " + route.stops[0]) + ".";
      setMessage(message, "", false);
    } catch (error) {
      if (token !== generation) return;
      console.error("Could not share the bus location.", error);
      setMessage(message, "Your location could not be shared. " + error.message, true);
      if (STOP_SHARING_ERRORS.test(error.message)) await stop(false);
    } finally {
      pendingSend = null;
      sending = false;
    }
  }

  function begin(newMode, text) {
    generation++;
    mode = newMode;
    latest = null;
    previousAlong = null;
    direction = "outbound";
    setMessage(message, "", false);
    showSharing(text);
    keepScreenOn();
  }

  // Pseudocode 2.1: while sharing is on, read the GPS position and send it
  // every 5 seconds.
  function startGps() {
    if (mode || stopping) return;
    if (!("geolocation" in window.navigator)) {
      setMessage(message, "This browser cannot share its location. Use Simulate a drive instead.", true);
      return;
    }
    begin("gps", "Sharing your location");
    const token = generation;
    watchId = window.navigator.geolocation.watchPosition(
      position => {
        if (token !== generation || mode !== 'gps') return;
        const latLng = [position.coords.latitude, position.coords.longitude];
        const along = getDistanceAlongRoute(path, latLng);
        direction = getDirectionFromMove(previousAlong, along, direction);
        previousAlong = along;
        const first = latest === null;
        latest = { latLng, direction };
        if (first) send();
      },
      error => {
        if (token !== generation || mode !== 'gps') return;
        const refused = error.code === error.PERMISSION_DENIED;
        setMessage(message, refused
          ? "Location access was refused. Allow it in your browser's settings, or use Simulate a drive."
          : "Your location could not be found yet. " + error.message, true);
        if (refused) stop(false);
      },
      { enableHighAccuracy: true, maximumAge: SEND_INTERVAL_MS, timeout: 20000 }
    );
    timer = setInterval(send, SEND_INTERVAL_MS);
  }

  // For demonstrations away from a bus: drives the route from the first
  // stop at the average speed, sending each position as if from the GPS.
  function startSimulation() {
    if (mode || stopping) return;
    begin("simulation", "Simulating a drive from " + route.stops[0]);
    const startedAt = Date.now();
    const tick = () => {
      const travelled = (Date.now() - startedAt) / 1000 * AVERAGE_SPEED_METRES_PER_SECOND;
      latest = {
        latLng: positionOnRoads(findPositionFromTravelled(route, path, travelled), roadLegs),
        direction: getDirectionFromTravelled(path, travelled)
      };
      send();
    };
    tick();
    timer = setInterval(tick, SEND_INTERVAL_MS);
  }

  async function stop(tellServer) {
    generation++;
    stopping = Boolean(tellServer);
    clearInterval(timer);
    timer = null;
    if (watchId !== null) window.navigator.geolocation.clearWatch(watchId);
    watchId = null;
    latest = null;
    mode = null;
    if (wakeLock) wakeLock.release().catch(() => {});
    wakeLock = null;
    showSharing("Not sharing");
    gpsButton.disabled = simulateButton.disabled = stopping;
    if (!tellServer) return;

    try {
      const pending = pendingSend;
      if (pending) await pending.catch(() => {});
      await api.stopSharingLocation();
      setMessage(message, "Sharing stopped. Your bus is off the map.", false);
    } catch (error) {
      console.error("Could not stop sharing.", error);
      setMessage(message, "Sharing stopped here. Your bus leaves the map within a minute.", false);
    } finally {
      stopping = false;
      gpsButton.disabled = simulateButton.disabled = false;
    }
  }

  gpsButton.addEventListener("click", startGps);
  simulateButton.addEventListener("click", startSimulation);
  stopButton.addEventListener("click", () => stop(true));

  // The screen lock is let go when the page is hidden; take it again on return.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && mode) keepScreenOn();
  });
  // Best effort: a closed tab otherwise leaves the bus on the map for up to a minute.
  window.addEventListener("pagehide", () => {
    if (mode) stop(true).catch(() => {});
  });


  showSharing("Not sharing");
  document.getElementById("driver-content").hidden = false;
  return () => stop(Boolean(mode));
}
