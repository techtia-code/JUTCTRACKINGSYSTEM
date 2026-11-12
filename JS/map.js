import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { makeElement, makeRouteHeading } from './dom.js';
import { BUS_STATE_LABELS, busHeading, busName, busState, busTravelled, isFresh } from './fleet.js';
import { routeLabel } from './planner.js';
import { fetchRoadLegs, positionOnRoads } from './roads.js';
import { findPositionFromTravelled, makeRoutePath } from './simulation.js';

const COLOURS = ['#0b6e4f', '#d98a00', '#b83b32', '#2563a8', '#7a3e9d'];

// Compass bearing in degrees from one [latitude, longitude] point to a nearby one.
function getBearing([lat1, lng1], [lat2, lng2]) {
  return Math.atan2((lng2 - lng1) * Math.cos(lat1 * Math.PI / 180), lat2 - lat1) * 180 / Math.PI;
}

// A disc in the route's colour; while the bus runs, a white arrow points the way it is going.
function busIcon(colour, bearing, active) {
  const arrow = bearing === null ? '' : '<path d="M12 5.5 16.5 16 12 13.5 7.5 16Z" fill="#fff"/>';
  return L.divIcon({ className: 'bus-marker', iconSize: [26, 26], tooltipAnchor: [13, 0],
    html: `<svg viewBox="0 0 24 24" style="transform:rotate(${bearing ?? 0}deg);opacity:${active ? 1 : 0.45}"><circle cx="12" cy="12" r="10.5" fill="${colour}" stroke="#fff" stroke-width="2"/>${arrow}</svg>` });
}
export function initMap(routes, coordinates, buses = []) {
  // On touch screens one finger scrolls the page; two fingers pan and zoom the map.
  const map = L.map('map', { scrollWheelZoom: false, dragging: !L.Browser.mobile }).setView([18, -76.8], 12);
  const sidebar = document.querySelector('.map-sidebar');
  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  tiles.on('tileerror', () => { document.getElementById('fleet-message').textContent = 'Some map tiles could not load. Bus and route details remain available below.'; });
  const routeLayers = L.layerGroup().addTo(map), busLayers = L.layerGroup().addTo(map);
  let previousGeometry = '', fit = false, roadPaths = new Map();
  let visibleRoutes = routes, visibleCoordinates = coordinates, visibleBuses = buses, roadFitView = null;
  function fitVisible() {
    const points = visibleRoutes.flatMap(route => roadPaths.get(route.id)?.flat() || route.stops.map(stop => visibleCoordinates[stop]).filter(Boolean));
    points.push(...visibleBuses.filter(bus => Number.isFinite(bus.lat) && Number.isFinite(bus.lng)).map(bus => [bus.lat, bus.lng]));
    if (!points.length) return;
    map.invalidateSize({ pan: false });
    map.fitBounds(L.latLngBounds(points), { padding: [24, 24], maxZoom: 15, animate: false });
    fit = true; roadFitView = { center: map.getCenter(), zoom: map.getZoom() };
  }
  function update(nextRoutes, nextCoordinates, nextBuses, { fit: requestedFit = false } = {}) {
    visibleRoutes = nextRoutes; visibleCoordinates = nextCoordinates; visibleBuses = nextBuses;
    const geometry = JSON.stringify([nextRoutes, nextCoordinates]);
    if (geometry !== previousGeometry) {
      previousGeometry = geometry;
      roadFitView = null;
      roadPaths = new Map();
      routeLayers.clearLayers();
      const points = [];
      nextRoutes.forEach((route, index) => {
        const path = route.stops.map(stop => nextCoordinates[stop]).filter(Boolean); points.push(...path);
        if (path.length > 1) {
          const line = L.polyline(path, { color: COLOURS[index % COLOURS.length], weight: 4, opacity: 0.65 }).addTo(routeLayers);
          fetchRoadLegs(path).then(legs => {
            if (!legs || geometry !== previousGeometry) return;
            roadPaths.set(route.id, legs); line.setLatLngs(legs.flat());
            // Complete the selection fit after routing, unless the user moved the map.
            if (roadFitView && map.getCenter().equals(roadFitView.center) && map.getZoom() === roadFitView.zoom) fitVisible();
          });
        }
      });
      [...new Set(nextRoutes.flatMap(r => r.stops))].forEach(stop => {
        if (nextCoordinates[stop]) L.circleMarker(nextCoordinates[stop], { radius: 5, color: '#1c2b26', fillColor: '#fff', fillOpacity: 1 }).bindTooltip(makeElement('span', '', stop)).addTo(routeLayers);
      });
    }
    if (!fit || requestedFit) fitVisible();
    busLayers.clearLayers(); sidebar.replaceChildren(nextRoutes.length === 1 ? makeRouteHeading('h3', nextRoutes[0], 'bus-list-heading') : makeElement('h3', 'bus-list-heading', 'Buses on these routes'));
    if (!nextBuses.length) sidebar.append(makeElement('p', 'empty-state', nextRoutes.length ? 'No buses are currently available on these routes.' : 'Search for a route or show all routes.'));
    const list = makeElement('ul', 'bus-list');
    nextBuses.forEach(bus => {
      const index = nextRoutes.findIndex(r => r.id === bus.routeId), colour = COLOURS[Math.max(0, index) % COLOURS.length];
      const state = BUS_STATE_LABELS[busState(bus)], route = nextRoutes[index];
      const heading = busHeading(bus, route, nextCoordinates), toward = heading ? `To ${heading}` : state;
      let position = [bus.lat, bus.lng], bearing = null;
      if (route) {
        const path = makeRoutePath(route, nextCoordinates), roads = roadPaths.get(bus.routeId), travelled = busTravelled(bus);
        const along = metres => positionOnRoads(findPositionFromTravelled(route, path, travelled + metres), roads);
        if (bus.source !== 'driver' && roads) position = along(0);
        // A point a little further along the route gives the direction of travel.
        if (heading) bearing = getBearing(along(0), along(30));
      }
      if (Number.isFinite(position[0]) && Number.isFinite(position[1])) L.marker(position, { icon: busIcon(colour, bearing, bus.engineOn && isFresh(bus)) })
        .bindTooltip(makeElement('span', '', `${route?.number ? `${route.number} · ` : ''}${busName(bus)} · ${toward}`)).addTo(busLayers);
      const item = makeElement('li', 'bus-item'), dot = makeElement('span', 'bus-dot'); dot.style.backgroundColor = colour;
      const details = makeElement('div'); details.append(makeElement('strong', '', busName(bus) + (heading ? ` · To ${heading}` : '')), makeElement('p', 'muted-copy', `${state} · ${routeLabel(route) || 'Route unavailable'}`), makeElement('p', 'muted-copy', `Next stop: ${bus.nextStop || 'Not available'}`));
      item.append(dot, details); list.append(item);
    }); sidebar.append(list);
  }
  update(routes, coordinates, buses); return { update };
}
