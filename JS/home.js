import { ALERT_TYPES, loadAlerts, loadBuses, loadLiveBusLocations, loadRoutes, loadStops } from "./data.js";
import { makeElement } from "./dom.js";
import { findJourneys, routeMatchesSearch } from "./planner.js";
import { getDelayMinutes, getDistanceMetres } from "./simulation.js";
import { busEtaMinutes, getBusAlerts, isFresh, routeSharedBuses } from './fleet.js';

const ETA_UPDATE_INTERVAL_MS = 5000;
const ALERT_UPDATE_INTERVAL_MS = 30000;

export async function initHome({ loadMap = () => import('./map.js') } = {}) {
  let [allStops, routes, loadedAlerts] = await Promise.all([loadStops(), loadRoutes(), loadAlerts()]);
  let buses = [], mapView = null, watching = false, watchedSelection = null, delivered = new Set(), refreshing = false;
  let alerts = loadedAlerts;
  let etaTime = null;
  let etaDetails = null;

  let stopCoordinates = Object.fromEntries(allStops.map(stop => [stop.name, [stop.lat, stop.lng]]));
  let stops = [...new Set(routes.flatMap(route => route.stops))];
  const stopList = document.getElementById("stop-list");
  const routeList = document.getElementById("routes-list");
  const routeFilter = document.getElementById("route-filter");
  const routeSelect = document.getElementById("eta-route");
  const stopSelect = document.getElementById("eta-stop");
  const busSelect = document.getElementById('eta-bus');
  const notificationList = document.getElementById('bus-notifications');
  const notificationMessage = document.getElementById('notification-message');
  const etaResults = document.getElementById("eta-results");
  const searchResults = document.getElementById("search-results");
  const alertsList = document.getElementById("alerts-list");

  stops.forEach(stop => stopList.append(makeElement("option", "", stop)));

  function populateBusSelect() {
    const previous = busSelect.value; busSelect.replaceChildren();
    const available = buses.filter(bus => bus.routeId === routeSelect.value);
    available.forEach(bus => { const option = makeElement('option', '', bus.label); option.value = bus.id; busSelect.append(option); });
    if (available.some(b => b.id === previous)) busSelect.value = previous;
    if (!available.length) busSelect.append(makeElement('option', '', 'No buses available'));
    busSelect.disabled = !available.length;
  }

  function populateRouteSelect() {
    routeSelect.replaceChildren();
    routes.forEach(route => {
      const option = makeElement("option", "", route.name);
      option.value = route.id;
      routeSelect.append(option);
    });

    if (routes.length === 0) {
      const option = makeElement("option", "", "No sample routes available");
      option.value = "";
      routeSelect.append(option);
    }
  }

  function setEtaStops() {
    const route = routes.find(item => item.id === routeSelect.value);
    stopSelect.replaceChildren();
    populateBusSelect();
    if (!route) {
      stopSelect.append(makeElement("option", "", "No stops available"));
      stopSelect.disabled = true;
      renderEtas();
      return;
    }

    stopSelect.disabled = false;
    route.stops.forEach(stop => {
      const option = makeElement("option", "", stop);
      option.value = stop;
      stopSelect.append(option);
    });
    renderEtas();
  }

  function renderRoutes() {
    routeList.replaceChildren();
    if (routes.length === 0) {
      routeList.append(makeElement("p", "empty-state", "There are no sample routes to display yet."));
      return;
    }

    const noMatches = makeElement("p", "empty-state", "No sample routes match that search.");
    noMatches.hidden = true;

    const cards = routes.map(route => {
      const card = makeElement("article", "route-card");
      const heading = makeElement("h3", "", route.name);
      const details = makeElement("p", "", route.stops.length + " sample stops");
      const stopListElement = makeElement("ul", "route-stops");
      route.stops.forEach(stop => stopListElement.append(makeElement("li", "", stop)));
      card.append(heading, details, stopListElement);
      routeList.append(card);
      return { route, card };
    });
    routeList.append(noMatches);

    routeFilter.oninput = () => {
      cards.forEach(({ route, card }) => {
        card.hidden = !routeMatchesSearch(route, routeFilter.value);
      });
      noMatches.hidden = cards.some(({ card }) => !card.hidden);
    };
  }

  function renderSearchMessage(message, isError) {
    searchResults.replaceChildren();
    const result = makeElement("p", isError ? "message error" : "message", message);
    searchResults.append(result);
  }

  function renderJourneyResults(matches) {
    searchResults.replaceChildren();
    if (matches.length === 0) {
      renderSearchMessage("No direct sample route connects those stops. Try another pair of locations.", true);
      return;
    }

    matches.forEach(({ route, path }) => {
      const card = makeElement("article", "result-card");
      card.append(
        makeElement("p", "result-label", "Sample route"),
        makeElement("h3", "", route.name),
        makeElement("p", "", path.join(" to "))
      );
      searchResults.append(card);
    });
  }

  function setText(element, text) {
    // The results area is read aloud by screen readers, so only change it when needed.
    if (element.textContent !== text) element.textContent = text;
  }

  function updateEta() {
    const route = routes.find(item => item.id === routeSelect.value);
    const stop = stopSelect.value;
    if (!route || !stop || !etaTime) { notificationList.replaceChildren(); return; }

    const bus = buses.find(b => b.id === busSelect.value);
    if (!bus) { notificationList.replaceChildren(); setText(etaTime, 'Unavailable'); setText(etaDetails, 'No bus is available for this route.'); return; }
    const delay = getDelayMinutes(alerts, route.id);
    const minutes = busEtaMinutes(bus, route, stopCoordinates, stop, delay);
    setText(etaTime, minutes === null ? 'Unavailable' : minutes < 1 ? 'Arriving now' : 'About ' + minutes + ' min');
    setText(etaDetails, !bus.engineOn ? `${bus.label} is parked. No arrival estimate.` : !isFresh(bus) ? `${bus.label}: location updates are stale. Waiting for the driver.` : `${bus.label} · Estimate for ${stop}${delay > 0 ? ` (includes a ${delay} min delay)` : ''}${bus.status === 'delayed' ? ' · Driver reports a delay' : ''}`);
    checkNotifications(bus, stop, delay > 0 || alerts.some(a => a.type === 'delay' && (a.routeId === route.id || a.routeId === null)));
  }

  function checkNotifications(bus, stop, delayed) {
    if (!watching) return;
    if (watchedSelection?.busId !== bus.id || watchedSelection?.stop !== stop || watchedSelection?.routeId !== bus.routeId) {
      clearWatch('The watched selection changed. Choose a bus and stop, then watch again.'); return;
    }
    const coordinate = stopCoordinates[stop];
    const distance = coordinate ? getDistanceMetres([bus.lat, bus.lng], coordinate) : Infinity;
    const active = getBusAlerts(bus, distance, delayed);
    const activeKeys = new Set(active.map(alert => `${bus.id}:${stop}:${alert.type}`));
    for (const key of delivered) if (!activeKeys.has(key)) delivered.delete(key);
    notificationList.replaceChildren();
    active.forEach(alert => {
      notificationList.append(makeElement('p', 'alert', alert.message));
      const key = `${bus.id}:${stop}:${alert.type}`;
      if (!delivered.has(key)) {
        delivered.add(key);
        if ('Notification' in window && Notification.permission === 'granted') {
          try { new Notification('JUTC demonstration', { body: alert.message, tag: key }); }
          catch { notificationMessage.textContent = 'Device notifications are unavailable here. Alerts are shown on this page.'; }
        }
      }
    });
  }

  function renderEtas() {
    etaResults.replaceChildren();
    etaTime = null;
    const route = routes.find(item => item.id === routeSelect.value);
    const stop = stopSelect.value;
    if (!route || !stop) {
      etaResults.append(makeElement("p", "empty-state", "Select a route with available stops to view a sample arrival estimate."));
      return;
    }

    const item = makeElement("article", "eta-item");
    const description = makeElement("div", "");
    etaDetails = makeElement("p", "muted-copy");
    etaTime = makeElement("span", "eta-time");
    description.append(makeElement("strong", "", route.name), etaDetails);
    item.append(description, etaTime);
    etaResults.append(item);
    updateEta();
  }

  function renderAlerts() {
    alertsList.replaceChildren();
    if (alerts.length === 0) {
      alertsList.append(makeElement("p", "empty-state", "There are no service alerts right now."));
      return;
    }

    alerts.forEach(alert => {
      const card = makeElement("article", "alert");
      const delay = alert.delayMinutes > 0 ? " - about " + alert.delayMinutes + " min delay" : "";
      card.append(
        makeElement("p", "alert-type", ALERT_TYPES[alert.type]),
        makeElement("h3", "", alert.message),
        makeElement("p", "muted-copy", alert.routeName + delay)
      );
      alertsList.append(card);
    });
  }

  async function refreshAlerts() {
    try {
      alerts = await loadAlerts();
      renderAlerts();
      updateEta();
    } catch (error) {
      // Keep showing the last alerts and try again at the next update.
      console.error("Could not update the service alerts.", error);
    }
  }

  async function refreshFleet() {
    if (refreshing) return; refreshing = true;
    try {
      const [fleetBuses, nextStops, nextRoutes, liveLocations] = await Promise.all([loadBuses(), loadStops(), loadRoutes(), loadLiveBusLocations()]);
      const nextCoordinates = Object.fromEntries(nextStops.map(stop => [stop.name, [stop.lat, stop.lng]]));
      const nextBuses = [...fleetBuses, ...routeSharedBuses(nextRoutes, nextCoordinates, liveLocations)];
      if (watching && (!nextBuses.some(bus => bus.id === watchedSelection?.busId && bus.routeId === watchedSelection?.routeId) ||
        !nextRoutes.some(route => route.id === watchedSelection?.routeId && route.stops.includes(watchedSelection?.stop)))) {
        clearWatch('The watched bus, route or stop is no longer available. Select another bus to watch.');
      }
      buses = nextBuses; allStops = nextStops;
      stopCoordinates = Object.fromEntries(allStops.map(stop => [stop.name, [stop.lat, stop.lng]]));
      if (JSON.stringify(routes) !== JSON.stringify(nextRoutes)) {
        const routeId = routeSelect.value, stopName = stopSelect.value;
        routes = nextRoutes; stops = [...new Set(routes.flatMap(r => r.stops))];
        stopList.replaceChildren(); stops.forEach(stop => stopList.append(makeElement('option', '', stop)));
        renderRoutes(); populateRouteSelect();
        if (routes.some(r => r.id === routeId)) routeSelect.value = routeId;
        setEtaStops(); if (routes.find(r => r.id === routeSelect.value)?.stops.includes(stopName)) stopSelect.value = stopName;
      }
      populateBusSelect(); updateEta();
      document.getElementById('fleet-message').textContent = 'Bus locations refresh every five seconds. Parked buses have no arrival estimate.';
      mapView?.update(routes, stopCoordinates, buses);
    } catch (error) {
      console.error('Could not refresh fleet', error);
      document.getElementById('fleet-message').textContent = 'Bus tracking is unavailable. Route searches and service information may still be available. Ask the administrator to check the connection and database setup.';
      updateEta();
    } finally { refreshing = false; }
  }

  populateRouteSelect();
  renderRoutes();
  setEtaStops();
  renderAlerts();
  await refreshFleet();

  document.getElementById("route-search-form").addEventListener("submit", event => {
    event.preventDefault();
    const result = findJourneys(
      routes,
      stops,
      document.getElementById("start-stop").value,
      document.getElementById("end-stop").value
    );
    if (result.error) {
      renderSearchMessage(result.error, true);
      return;
    }
    renderJourneyResults(result.matches);
  });
  function clearWatch(reason) { watching = false; watchedSelection = null; delivered.clear(); notificationList.replaceChildren(); document.getElementById('stop-watch').hidden = true; document.getElementById('watch-bus').disabled = false; if (reason) notificationMessage.textContent = reason; }
  routeSelect.addEventListener('change', () => { clearWatch(); setEtaStops(); });
  stopSelect.addEventListener('change', () => { clearWatch(); renderEtas(); });
  busSelect.addEventListener('change', () => { clearWatch(); renderEtas(); });
  document.getElementById('watch-bus').addEventListener('click', () => {
    if (!buses.some(b => b.id === busSelect.value)) { notificationMessage.textContent = 'Select an available bus first.'; return; }
    watching = true; watchedSelection = { busId: busSelect.value, routeId: routeSelect.value, stop: stopSelect.value }; delivered.clear(); document.getElementById('stop-watch').hidden = false;
    document.getElementById('watch-bus').disabled = true; notificationMessage.textContent = 'Watching the selected bus and stop. Keep this page open for alerts.'; updateEta();
  });
  document.getElementById('stop-watch').addEventListener('click', () => { clearWatch(); notificationMessage.textContent = 'Bus alerts stopped.'; });
  document.getElementById('enable-notifications').addEventListener('click', async () => {
    if (!('Notification' in window)) { notificationMessage.textContent = 'Device notifications are unsupported. You can still watch this bus for in-page alerts.'; return; }
    try { const permission = await Notification.requestPermission(); notificationMessage.textContent = permission === 'granted' ? 'Device notifications enabled. Select Watch this bus to receive alerts while this page stays open.' : 'Device notifications are blocked. In-page alerts remain available.'; }
    catch { notificationMessage.textContent = 'Device notifications are unavailable. In-page alerts remain available.'; }
  });
  const fleetTimer = setInterval(refreshFleet, ETA_UPDATE_INTERVAL_MS);
  const alertTimer = setInterval(refreshAlerts, ALERT_UPDATE_INTERVAL_MS);
  window.addEventListener('pagehide', () => { clearInterval(fleetTimer); clearInterval(alertTimer); }, { once: true });

  // Loaded on demand so the admin page does not download Leaflet.
  loadMap()
    .then(({ initMap }) => { mapView = initMap(routes, stopCoordinates, buses); })
    .catch(error => {
      console.error("Could not load the map.", error);
      document.querySelector(".map-sidebar").replaceChildren(
        makeElement("p", "empty-state", "The map could not be loaded.")
      );
    });
}
