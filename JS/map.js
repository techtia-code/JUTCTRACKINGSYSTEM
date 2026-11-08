import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { makeElement } from "./dom.js";
import { fetchRoadLegs, positionOnRoads } from "./roads.js";
import { findPositionFromTravelled, getBusTravelled, makeRoutePath } from "./simulation.js";

const KINGSTON_CENTER = [18.0, -76.8];
const UPDATE_INTERVAL_MS = 5000;
const ROUTE_COLOURS = ["#0b6e4f", "#d98a00", "#b83b32", "#2563a8", "#7a3e9d"];

function addStops(map, routes, stopCoordinates) {
  const stops = [...new Set(routes.flatMap(route => route.stops))];
  stops.forEach(stop => {
    L.circleMarker(stopCoordinates[stop], {
      radius: 5,
      color: "#1c2b26",
      weight: 2,
      fillColor: "#ffffff",
      fillOpacity: 1
    }).bindTooltip(makeElement("span", "", stop)).addTo(map);
  });
}

function makeBusIcon(colour) {
  return L.divIcon({
    className: "bus-marker",
    html: '<span style="background:' + colour + '"></span>',
    iconSize: [18, 18]
  });
}

function makeBus(map, route, stopCoordinates, colour) {
  const path = makeRoutePath(route, stopCoordinates);

  // Straight lines between stops until the roads load.
  const line = L.polyline(path.points, { color: colour, weight: 4, opacity: 0.75 }).addTo(map);

  const marker = L.marker(path.points[0], { icon: makeBusIcon(colour), zIndexOffset: 1000 })
    .bindTooltip(makeElement("span", "", route.name))
    .addTo(map);

  return { route, path, line, roadLegs: null, marker, nextStop: null, live: null };
}

async function loadRoads(bus) {
  const roadLegs = await fetchRoadLegs(bus.path.points);
  if (!roadLegs) return;
  bus.roadLegs = roadLegs;
  bus.line.setLatLngs(roadLegs.flat());
}

function renderBusList(sidebar, buses, colours) {
  sidebar.replaceChildren(makeElement("h3", "bus-list-heading", "Buses"));
  if (buses.length === 0) {
    sidebar.append(makeElement("p", "empty-state", "There are no sample routes to display yet."));
    return;
  }

  const list = makeElement("ul", "bus-list");
  buses.forEach((bus, index) => {
    const item = makeElement("li", "bus-item");
    const dot = makeElement("span", "bus-dot");
    dot.style.background = colours[index];
    const details = makeElement("div", "");
    bus.nextStopElement = makeElement("p", "muted-copy");
    bus.sourceElement = makeElement("span", "bus-source");
    details.append(makeElement("strong", "", bus.route.name), bus.sourceElement, bus.nextStopElement);
    item.append(dot, details);
    list.append(item);
  });
  sidebar.append(list);
}

// A route's bus is drawn where its driver last shared it, when that was in
// the last minute, and otherwise where the simulation puts it.
function updateBuses(buses, liveLocations) {
  const time = Date.now();
  buses.forEach(bus => {
    const { travelled, live } = getBusTravelled(bus.path, liveLocations.get(bus.route.id), time);
    const position = findPositionFromTravelled(bus.route, bus.path, travelled);
    const { nextStop } = position;
    // A live bus is drawn where the driver is, not where they were matched onto the route line.
    bus.marker.setLatLng(live ? liveLocations.get(bus.route.id).latLng : positionOnRoads(position, bus.roadLegs));
    if (nextStop !== bus.nextStop) {
      bus.nextStop = nextStop;
      bus.nextStopElement.textContent = "Next stop: " + nextStop;
    }
    if (live !== bus.live) {
      bus.live = live;
      bus.sourceElement.textContent = live ? "Live from the driver" : "Simulated";
      bus.sourceElement.classList.toggle("is-live", live);
      bus.marker.getElement()?.classList.toggle("is-live", live);
    }
  });
}

// getLiveLocations returns the latest shared positions by route id; home.js
// refreshes them every 5 seconds.
export function initMap(routes, stopCoordinates, getLiveLocations) {
  const sidebar = document.querySelector(".map-sidebar");
  const map = L.map("map", { scrollWheelZoom: false }).setView(KINGSTON_CENTER, 12);

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  const colours = routes.map((route, index) => ROUTE_COLOURS[index % ROUTE_COLOURS.length]);
  const buses = routes.map((route, index) => makeBus(map, route, stopCoordinates, colours[index]));
  addStops(map, routes, stopCoordinates);
  renderBusList(sidebar, buses, colours);

  if (buses.length > 0) {
    const bounds = L.latLngBounds(buses.flatMap(bus => bus.path.points));
    map.fitBounds(bounds, { padding: [24, 24] });
  }

  updateBuses(buses, getLiveLocations());
  buses.forEach(bus => loadRoads(bus).then(() => updateBuses([bus], getLiveLocations())));
  setInterval(() => updateBuses(buses, getLiveLocations()), UPDATE_INTERVAL_MS);
}
