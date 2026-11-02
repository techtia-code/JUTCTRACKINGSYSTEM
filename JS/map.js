import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { makeElement } from "./dom.js";

const KINGSTON_CENTER = [18.0, -76.8];
const BUS_SPEED_METRES_PER_SECOND = 120;
const UPDATE_INTERVAL_MS = 100;
const REDUCED_MOTION_UPDATE_INTERVAL_MS = 3000;
const ROUTE_COLOURS = ["#0b6e4f", "#d98a00", "#b83b32", "#2563a8", "#7a3e9d"];

// Every stop in VALID_STOPS (main.js) needs an entry here.
const STOP_COORDINATES = {
  "Downtown Kingston": [17.9706, -76.7934],
  "Cross Roads": [17.9935, -76.7877],
  "Half-Way Tree": [18.0119, -76.7969],
  "Liguanea": [18.0194, -76.7680],
  "University of Technology": [18.0165, -76.7435],
  "Papine": [18.0168, -76.7422],
  "Spanish Town": [17.9957, -76.9541],
  "Angels": [18.0357, -76.9678],
  "Ferry": [18.0235, -76.8770]
};

function addStops(map, routes) {
  const stops = [...new Set(routes.flatMap(route => route.stops))];
  stops.forEach(stop => {
    L.circleMarker(STOP_COORDINATES[stop], {
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

function makeBus(map, route, colour) {
  const points = route.stops.map(stop => L.latLng(STOP_COORDINATES[stop]));
  const distances = [0];
  points.slice(1).forEach((point, index) => {
    distances.push(distances[index] + points[index].distanceTo(point));
  });

  L.polyline(points, { color: colour, weight: 4, opacity: 0.75 }).addTo(map);

  const marker = L.marker(points[0], { icon: makeBusIcon(colour), zIndexOffset: 1000 })
    .bindTooltip(makeElement("span", "", route.name))
    .addTo(map);

  return { route, points, distances, marker, nextStop: null };
}

function findBusPosition(bus, time) {
  const { route, points, distances } = bus;
  const routeLength = distances[distances.length - 1];

  // Each bus runs to the end of its route and back. Using the clock means
  // every open tab shows the buses in the same place.
  const travelled = (time / 1000 * BUS_SPEED_METRES_PER_SECOND) % (routeLength * 2);
  const outbound = travelled < routeLength;
  const distance = outbound ? travelled : routeLength * 2 - travelled;

  const segment = Math.max(distances.findIndex(value => value >= distance), 1);
  const from = points[segment - 1];
  const to = points[segment];
  const progress = (distance - distances[segment - 1]) / (distances[segment] - distances[segment - 1]);

  return {
    latLng: L.latLng(from.lat + (to.lat - from.lat) * progress, from.lng + (to.lng - from.lng) * progress),
    nextStop: route.stops[outbound ? segment : segment - 1]
  };
}

function renderBusList(sidebar, buses, colours) {
  sidebar.replaceChildren(makeElement("h3", "bus-list-heading", "Sample buses"));
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
    details.append(makeElement("strong", "", bus.route.name), bus.nextStopElement);
    item.append(dot, details);
    list.append(item);
  });
  sidebar.append(list);
}

function updateBuses(buses) {
  const time = Date.now();
  buses.forEach(bus => {
    const { latLng, nextStop } = findBusPosition(bus, time);
    bus.marker.setLatLng(latLng);
    if (nextStop !== bus.nextStop) {
      bus.nextStop = nextStop;
      bus.nextStopElement.textContent = "Next stop: " + nextStop;
    }
  });
}

export function initMap(routes) {
  const sidebar = document.querySelector(".map-sidebar");
  const map = L.map("map", { scrollWheelZoom: false }).setView(KINGSTON_CENTER, 12);

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  const colours = routes.map((route, index) => ROUTE_COLOURS[index % ROUTE_COLOURS.length]);
  const buses = routes.map((route, index) => makeBus(map, route, colours[index]));
  addStops(map, routes);
  renderBusList(sidebar, buses, colours);

  if (buses.length > 0) {
    const bounds = L.latLngBounds(buses.flatMap(bus => bus.points));
    map.fitBounds(bounds, { padding: [24, 24] });
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  updateBuses(buses);
  setInterval(() => updateBuses(buses), reduceMotion ? REDUCED_MOTION_UPDATE_INTERVAL_MS : UPDATE_INTERVAL_MS);
}
