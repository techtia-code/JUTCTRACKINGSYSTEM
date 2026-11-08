import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { makeElement } from './dom.js';
import { isFresh } from './fleet.js';

const COLOURS = ['#0b6e4f', '#d98a00', '#b83b32', '#2563a8', '#7a3e9d'];
export function initMap(routes, coordinates, buses = []) {
  const map = L.map('map', { scrollWheelZoom: false }).setView([18, -76.8], 12);
  const sidebar = document.querySelector('.map-sidebar');
  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  tiles.on('tileerror', () => { document.getElementById('fleet-message').textContent = 'Some map tiles could not load. Bus and route details remain available below.'; });
  const routeLayers = L.layerGroup().addTo(map), busLayers = L.layerGroup().addTo(map);
  let previousGeometry = '', fit = false;
  function update(nextRoutes, nextCoordinates, nextBuses) {
    const geometry = JSON.stringify([nextRoutes, nextCoordinates]);
    if (geometry !== previousGeometry) {
      routeLayers.clearLayers();
      const points = [];
      nextRoutes.forEach((route, index) => {
        const path = route.stops.map(stop => nextCoordinates[stop]).filter(Boolean); points.push(...path);
        if (path.length > 1) L.polyline(path, { color: COLOURS[index % COLOURS.length], weight: 4, opacity: 0.65 }).addTo(routeLayers);
      });
      [...new Set(nextRoutes.flatMap(r => r.stops))].forEach(stop => {
        if (nextCoordinates[stop]) L.circleMarker(nextCoordinates[stop], { radius: 5, color: '#1c2b26', fillColor: '#fff', fillOpacity: 1 }).bindTooltip(makeElement('span', '', stop)).addTo(routeLayers);
      });
      if (!fit && points.length) { map.fitBounds(L.latLngBounds(points), { padding: [24, 24] }); fit = true; }
      previousGeometry = geometry;
    }
    busLayers.clearLayers(); sidebar.replaceChildren(makeElement('h3', 'bus-list-heading', 'Sample buses'));
    if (!nextBuses.length) sidebar.append(makeElement('p', 'empty-state', 'No bus locations are available.'));
    const list = makeElement('ul', 'bus-list');
    nextBuses.forEach(bus => {
      const index = nextRoutes.findIndex(r => r.id === bus.routeId), colour = COLOURS[Math.max(0, index) % COLOURS.length];
      const state = !bus.engineOn ? 'Parked' : !isFresh(bus) ? 'Location stale' : bus.status === 'delayed' ? 'Delayed' : 'Running';
      if (Number.isFinite(bus.lat) && Number.isFinite(bus.lng)) L.circleMarker([bus.lat, bus.lng], { radius: 9, color: '#fff', weight: 2, fillColor: colour, fillOpacity: bus.engineOn && isFresh(bus) ? 1 : 0.35 })
        .bindTooltip(makeElement('span', '', `${bus.label} · ${state}`)).addTo(busLayers);
      const item = makeElement('li', 'bus-item'), dot = makeElement('span', 'bus-dot'); dot.style.backgroundColor = colour;
      const details = makeElement('div'); details.append(makeElement('strong', '', bus.label), makeElement('p', 'muted-copy', `${state} · ${nextRoutes[index]?.name || 'Route unavailable'}`), makeElement('p', 'muted-copy', `Next stop: ${bus.nextStop || 'Not available'}`));
      item.append(dot, details); list.append(item);
    }); sidebar.append(list);
  }
  update(routes, coordinates, buses); return { update };
}
