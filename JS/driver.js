import {
  getSession,
  loadMyRoute,
  loadStops,
  logIn,
  logOut,
  shareBusLocation,
  stopSharingLocation
} from "./data.js";
import { setMessage } from "./dom.js";
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

async function showDriver(route) {
  const allStops = await loadStops();
  const stopCoordinates = Object.fromEntries(allStops.map(stop => [stop.name, [stop.lat, stop.lng]]));
  const path = makeRoutePath(route, stopCoordinates);

  const status = document.getElementById("driver-status");
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
  let wakeLock = null;

  async function keepScreenOn() {
    // The phone stops sharing its location when the screen locks.
    try {
      wakeLock = navigator.wakeLock ? await navigator.wakeLock.request("screen") : null;
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
    if (!latest || sending) return;
    sending = true;
    try {
      await shareBusLocation(latest.latLng[0], latest.latLng[1], latest.direction);
      lastSent.textContent = "Last shared at " + formatTime(new Date()) + ", heading " +
        (latest.direction === "outbound" ? "to " + route.stops[route.stops.length - 1] : "to " + route.stops[0]) + ".";
      setMessage(message, "", false);
    } catch (error) {
      console.error("Could not share the bus location.", error);
      setMessage(message, "Your location could not be shared. " + error.message, true);
      if (STOP_SHARING_ERRORS.test(error.message)) await stop(false);
    } finally {
      sending = false;
    }
  }

  function begin(newMode, text) {
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
    if (!("geolocation" in navigator)) {
      setMessage(message, "This browser cannot share its location. Use Simulate a drive instead.", true);
      return;
    }
    begin("gps", "Sharing your location");
    watchId = navigator.geolocation.watchPosition(
      position => {
        const latLng = [position.coords.latitude, position.coords.longitude];
        const along = getDistanceAlongRoute(path, latLng);
        direction = getDirectionFromMove(previousAlong, along, direction);
        previousAlong = along;
        const first = latest === null;
        latest = { latLng, direction };
        if (first) send();
      },
      error => {
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
    begin("simulation", "Simulating a drive from " + route.stops[0]);
    const startedAt = Date.now();
    const tick = () => {
      const travelled = (Date.now() - startedAt) / 1000 * AVERAGE_SPEED_METRES_PER_SECOND;
      latest = {
        latLng: findPositionFromTravelled(route, path, travelled).latLng,
        direction: getDirectionFromTravelled(path, travelled)
      };
      send();
    };
    tick();
    timer = setInterval(tick, SEND_INTERVAL_MS);
  }

  async function stop(tellServer) {
    clearInterval(timer);
    timer = null;
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    latest = null;
    mode = null;
    if (wakeLock) wakeLock.release().catch(() => {});
    wakeLock = null;
    showSharing("Not sharing");
    if (!tellServer) return;

    try {
      await stopSharingLocation();
      setMessage(message, "Sharing stopped. Your bus is off the map.", false);
    } catch (error) {
      console.error("Could not stop sharing.", error);
      setMessage(message, "Sharing stopped here. Your bus leaves the map within a minute.", false);
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
    if (mode) stopSharingLocation().catch(() => {});
  });

  document.getElementById("sign-out").addEventListener("click", async () => {
    await stop(Boolean(mode));
    try {
      await logOut();
      window.location.reload();
    } catch (error) {
      console.error("Could not sign out.", error);
      setMessage(message, "You could not be signed out. " + error.message, true);
    }
  });

  showSharing("Not sharing");
  document.getElementById("login-card").hidden = true;
  document.getElementById("driver-content").hidden = false;
  document.getElementById("sign-out").hidden = false;
}

function showLogin() {
  const form = document.getElementById("login-form");
  const message = document.getElementById("login-message");
  const button = document.getElementById("login-button");

  document.getElementById("login-card").hidden = false;

  form.addEventListener("submit", async event => {
    event.preventDefault();
    button.disabled = true;
    setMessage(message, "", false);
    try {
      await logIn(document.getElementById("login-email").value.trim(), document.getElementById("login-password").value);
      const route = await loadMyRoute();
      if (!route) {
        await logOut();
        setMessage(message, "This account is not set up as a bus driver. Ask the control centre to give it a route.", true);
        return;
      }
      await showDriver(route);
    } catch (error) {
      console.error("Could not log in.", error);
      setMessage(message, "You could not be logged in. " + error.message, true);
    } finally {
      button.disabled = false;
    }
  });
}

export async function initDriver() {
  const session = await getSession();
  if (session) {
    const route = await loadMyRoute();
    if (route) {
      await showDriver(route);
      return;
    }
  }
  showLogin();
  // Logged in, but not as a driver (an administrator, say). They stay logged
  // in; logging in here with a driver account replaces that login.
  if (session) {
    setMessage(document.getElementById("login-message"), "You're logged in with an account that isn't a bus driver. Log in with your driver account.", false);
  }
}
