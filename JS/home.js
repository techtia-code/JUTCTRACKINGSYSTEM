import { ALERT_TYPES, loadAlerts, loadBuses, loadLiveBusLocations, loadRoutes, loadStops } from "./data.js";
import { initArrivals } from "./arrivals.js";
import { makeElement, makeRouteHeading } from "./dom.js";
import { findJourneys, routeMatchesSearch } from "./planner.js";
import { routeSharedBuses } from './fleet.js';

const ETA_UPDATE_INTERVAL_MS = 5000;
const ALERT_UPDATE_INTERVAL_MS = 30000;

export async function initHome({ loadMap = () => import('./map.js') } = {}) {
  let [allStops, routes, loadedAlerts] = await Promise.all([loadStops(), loadRoutes(), loadAlerts()]);
  let buses = [], mapView = null, refreshing = false;
  let alerts = loadedAlerts;
  let mapRouteIds = null, pendingMapFit = false;

  let stopCoordinates = Object.fromEntries(allStops.map(stop => [stop.name, [stop.lat, stop.lng]]));
  let stops = [...new Set(routes.flatMap(route => route.stops))];
  const stopSelects = ["start-stop", "end-stop"].map(id => document.getElementById(id));
  const routeList = document.getElementById("routes-list");
  const routeFilter = document.getElementById("route-filter");
  const searchResults = document.getElementById("search-results");
  const alertsList = document.getElementById("alerts-list");
  const arrivals = initArrivals();

  function updateArrivals() {
    arrivals.setData({ routes, buses, coordinates: stopCoordinates, alerts });
  }

  function updateMap(fit = false) {
    const visibleRoutes = mapRouteIds === null ? routes : routes.filter(route => mapRouteIds.includes(route.id));
    const visibleIds = new Set(visibleRoutes.map(route => route.id));
    const visibleBuses = buses.filter(bus => visibleIds.has(bus.routeId));
    const only = visibleRoutes[0];
    const onlyName = only ? (only.number ? `Route ${only.number} · ` : '') + only.name : '';
    document.getElementById('map-selection').textContent = mapRouteIds === null ? 'Showing all routes and buses.' :
      !visibleRoutes.length ? 'No matching routes. Try another search or show all routes.' :
      `Showing ${visibleRoutes.length === 1 ? onlyName : `${visibleRoutes.length} matching routes`} · ${visibleBuses.length} ${visibleBuses.length === 1 ? 'bus' : 'buses'}.`;
    document.getElementById('show-all-routes').hidden = mapRouteIds === null;
    if (mapView) {
      mapView.update(visibleRoutes, stopCoordinates, visibleBuses, { fit: fit || pendingMapFit });
      pendingMapFit = false;
    } else pendingMapFit ||= fit;
  }

  function showRoutesOnMap(ids, destination = null, scroll = true) {
    mapRouteIds = ids.filter(id => routes.some(route => route.id === id));
    if (mapRouteIds.length) arrivals.select(mapRouteIds[0], destination);
    updateMap(true);
    if (scroll) {
      const tracker = document.getElementById('tracker');
      tracker.focus({ preventScroll: true });
      tracker.scrollIntoView?.({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    }
  }

  document.getElementById('show-all-routes').addEventListener('click', () => {
    routeFilter.value = ''; renderRoutes(); mapRouteIds = null; updateMap(true);
  });

  // Native selects: easier than typing stop names on a phone keyboard.
  function populateStopSelects() {
    stopSelects.forEach(select => {
      const selected = select.value, blank = makeElement("option", "", "Choose a stop");
      blank.value = "";
      select.replaceChildren(blank, ...stops.map(stop => makeElement("option", "", stop)));
      if (stops.includes(selected)) select.value = selected;
    });
  }
  populateStopSelects();

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
      const heading = makeRouteHeading("h3", route);
      card.append(heading, makeElement("p", "muted-copy", route.stops.join(" → ")));
      const view = makeElement('button', 'btn btn-secondary', 'View buses on map'); view.type = 'button';
      view.addEventListener('click', () => showRoutesOnMap([route.id])); card.append(view);
      routeList.append(card);
      return { route, card };
    });
    routeList.append(noMatches);

    function filterCards() {
      cards.forEach(({ route, card }) => {
        card.hidden = !routeMatchesSearch(route, routeFilter.value);
      });
      noMatches.hidden = cards.some(({ card }) => !card.hidden);
    }
    filterCards();
    routeFilter.oninput = () => {
      filterCards();
      if (routeFilter.value.trim()) showRoutesOnMap(cards.filter(({ card }) => !card.hidden).map(({ route }) => route.id), null, false);
      else { mapRouteIds = null; updateMap(true); }
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
        makeRouteHeading("h3", route),
        makeElement("p", "", path.join(" → "))
      );
      const view = makeElement('button', 'btn btn-secondary', 'View buses on map'); view.type = 'button';
      view.addEventListener('click', () => showRoutesOnMap([route.id], path.at(-1))); card.append(view);
      searchResults.append(card);
    });
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
      const route = routes.find(item => item.id === alert.routeId);
      card.append(
        makeElement("p", "alert-type", ALERT_TYPES[alert.type]),
        makeElement("h3", "", alert.message),
        makeElement("p", "muted-copy", (route?.number ? "Route " + route.number + " · " : "") + alert.routeName + delay)
      );
      alertsList.append(card);
    });
  }

  async function refreshAlerts() {
    try {
      alerts = await loadAlerts();
      renderAlerts();
      updateArrivals();
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
      buses = [...fleetBuses, ...routeSharedBuses(nextRoutes, nextCoordinates, liveLocations)];
      allStops = nextStops; stopCoordinates = nextCoordinates;
      if (JSON.stringify(routes) !== JSON.stringify(nextRoutes)) {
        routes = nextRoutes; stops = [...new Set(routes.flatMap(r => r.stops))];
        populateStopSelects(); renderRoutes();
      }
      // The arrivals board also cancels a watch whose bus, route or stop has gone.
      updateArrivals();
      if (mapRouteIds?.length) {
        mapRouteIds = mapRouteIds.filter(id => routes.some(route => route.id === id));
        if (!mapRouteIds.length) mapRouteIds = null;
      }
      document.getElementById('fleet-message').textContent = 'Bus positions refresh every 5 seconds.';
      updateMap();
    } catch (error) {
      console.error('Could not refresh fleet', error);
      document.getElementById('fleet-message').textContent = 'Bus tracking is unavailable right now. Route search and service alerts may still work.';
      updateArrivals();
    } finally { refreshing = false; }
  }

  renderRoutes();
  renderAlerts();
  updateArrivals();
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
    showRoutesOnMap(result.matches.map(({ route }) => route.id), result.matches[0]?.path.at(-1), result.matches.length > 0);
  });
  const fleetTimer = setInterval(refreshFleet, ETA_UPDATE_INTERVAL_MS);
  const alertTimer = setInterval(refreshAlerts, ALERT_UPDATE_INTERVAL_MS);
  window.addEventListener('pagehide', () => { clearInterval(fleetTimer); clearInterval(alertTimer); }, { once: true });

  // Loaded on demand so the admin page does not download Leaflet.
  loadMap()
    .then(({ initMap }) => {
      const visibleRoutes = mapRouteIds === null ? routes : routes.filter(route => mapRouteIds.includes(route.id));
      mapView = initMap(visibleRoutes, stopCoordinates, buses.filter(bus => visibleRoutes.some(route => route.id === bus.routeId)));
      updateMap();
    })
    .catch(error => {
      console.error("Could not load the map.", error);
      document.querySelector(".map-sidebar").replaceChildren(
        makeElement("p", "empty-state", "The map could not be loaded.")
      );
    });
}
