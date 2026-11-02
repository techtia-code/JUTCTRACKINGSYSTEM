import { ALERT_TYPES, loadAlerts, loadRoutes, loadStops } from "./data.js";
import { makeElement } from "./dom.js";
import { findJourneys, routeMatchesSearch } from "./planner.js";
import { getDelayMinutes, getEtaMinutes, makeRoutePath } from "./simulation.js";

const ETA_UPDATE_INTERVAL_MS = 5000;
const ALERT_UPDATE_INTERVAL_MS = 30000;

export async function initHome() {
  const [allStops, routes, loadedAlerts] = await Promise.all([loadStops(), loadRoutes(), loadAlerts()]);
  let alerts = loadedAlerts;
  let etaTime = null;
  let etaDetails = null;

  const stopCoordinates = Object.fromEntries(allStops.map(stop => [stop.name, [stop.lat, stop.lng]]));
  const paths = new Map(routes.map(route => [route.id, makeRoutePath(route, stopCoordinates)]));
  const stops = [...new Set(routes.flatMap(route => route.stops))];
  const stopList = document.getElementById("stop-list");
  const routeList = document.getElementById("routes-list");
  const routeFilter = document.getElementById("route-filter");
  const routeSelect = document.getElementById("eta-route");
  const stopSelect = document.getElementById("eta-stop");
  const etaResults = document.getElementById("eta-results");
  const searchResults = document.getElementById("search-results");
  const alertsList = document.getElementById("alerts-list");

  stops.forEach(stop => stopList.append(makeElement("option", "", stop)));

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

    routeFilter.addEventListener("input", () => {
      cards.forEach(({ route, card }) => {
        card.hidden = !routeMatchesSearch(route, routeFilter.value);
      });
      noMatches.hidden = cards.some(({ card }) => !card.hidden);
    });
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
    if (!route || !stop || !etaTime) return;

    const delay = getDelayMinutes(alerts, route.id);
    const minutes = getEtaMinutes(route, paths.get(route.id), stop, Date.now(), delay);
    setText(etaTime, minutes < 1 ? "Arriving now" : "About " + minutes + " min");
    setText(etaDetails, "Estimate for " + stop + (delay > 0 ? " (includes a " + delay + " min delay)" : ""));
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

  populateRouteSelect();
  renderRoutes();
  setEtaStops();
  renderAlerts();

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
  routeSelect.addEventListener("change", setEtaStops);
  stopSelect.addEventListener("change", renderEtas);
  setInterval(updateEta, ETA_UPDATE_INTERVAL_MS);
  setInterval(refreshAlerts, ALERT_UPDATE_INTERVAL_MS);

  // Loaded on demand so the admin page does not download Leaflet.
  import("./map.js")
    .then(({ initMap }) => initMap(routes, stopCoordinates))
    .catch(error => {
      console.error("Could not load the map.", error);
      document.querySelector(".map-sidebar").replaceChildren(
        makeElement("p", "empty-state", "The map could not be loaded.")
      );
    });
}
