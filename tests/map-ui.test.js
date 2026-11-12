import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

test('map focus draws only selected routes and buses and preserves zoom during refresh', async () => {
  const dom = new JSDOM('<div id="map"></div><aside class="map-sidebar"></aside><p id="fleet-message"></p>', { pretendToBeVisual: true });
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  globalThis.Element = dom.window.Element; // Leaflet's divIcon checks html instanceof Element
  dom.window.SVGSVGElement.prototype.createSVGRect = () => ({});
  Object.defineProperties(document.getElementById('map'), { clientWidth: { value: 800 }, clientHeight: { value: 600 } });
  const originalFetch = globalThis.fetch;
  let deferRoads = false, finishRoads;
  globalThis.fetch = async () => deferRoads ? new Promise(resolve => { finishRoads = resolve; }) : { ok: false };
  // Vite gives map.js its own copy of Leaflet, so the fitBounds spy must go on that copy.
  const leafletCopy = { name: 'test-leaflet', resolveId: id => id === 'virtual:leaflet' ? '\0virtual:leaflet' : null,
    load: id => id === '\0virtual:leaflet' ? "export { default } from 'leaflet';" : null };
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, mode: 'test', plugins: [leafletCopy] });
  const { default: L } = await server.ssrLoadModule('virtual:leaflet');
  const originalFit = L.Map.prototype.fitBounds;
  const fitted = []; let renderedMap;
  L.Map.prototype.fitBounds = function(bounds, options) { renderedMap = this; fitted.push(bounds); return originalFit.call(this, bounds, options); };
  try {
    const { initMap } = await server.ssrLoadModule('/JS/map.js');
    const routes = [{ id: 'one', name: 'First route', stops: ['A', 'B'] }, { id: 'two', name: 'Second route', stops: ['C', 'D'] }];
    const coordinates = { A: [18, -76.8], B: [18.01, -76.8], C: [18.2, -77.2], D: [18.3, -77.2] };
    const buses = routes.map((route, i) => ({ id: `bus-${i}`, label: `${1001+i}`, routeId: route.id, lat: coordinates[route.stops[0]][0], lng: coordinates[route.stops[0]][1], engineOn: true, source: 'driver', updatedAt: new Date().toISOString() }));
    const view = initMap(routes, coordinates, buses);
    assert.equal(fitted.length, 1);
    assert.ok(fitted[0].contains(coordinates.C));
    deferRoads = true;
    view.update([routes[0]], coordinates, [buses[0]], { fit: true });
    deferRoads = false;
    assert.equal(fitted.length, 2);
    assert.equal(fitted[1].contains(coordinates.C), false);
    assert.equal(document.querySelectorAll('.leaflet-overlay-pane path').length, 3, 'one route and two stops');
    assert.equal(document.querySelectorAll('.bus-marker').length, 1, 'one bus');
    assert.ok(document.querySelector('.bus-marker path'), 'a running bus has an arrow showing its direction');
    assert.match(document.querySelector('.map-sidebar').textContent, /Bus 1001 · To B/);
    assert.doesNotMatch(document.querySelector('.map-sidebar').textContent, /Bus 1002/);
    const detour = [18.005, -77.1];
    finishRoads({ ok: true, json: async () => ({ code: 'Ok', routes: [{ geometry: { coordinates: [[-76.8, 18], [-77.1, 18.005], [-76.8, 18.01]] }, legs: [{ annotation: { distance: [100, 100] } }] }] }) });
    for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve));
    assert.equal(fitted.length, 3, 'selection must fit the actual roads when they arrive');
    assert.ok(fitted.at(-1).contains(detour), 'road detours must stay in the viewport');
    view.update([routes[0]], coordinates, [{ ...buses[0], lat: 18.001 }], { fit: false });
    assert.equal(fitted.length, 3, 'bus refresh must leave viewport unchanged');
    view.update([routes[0]], coordinates, [{ ...buses[0], engineOn: false }], { fit: false });
    assert.equal(document.querySelector('.bus-marker path'), null, 'a parked bus has no direction arrow');
    view.update([], coordinates, [], { fit: true });
    assert.equal(document.querySelectorAll('.leaflet-overlay-pane path, .bus-marker').length, 0);
    assert.match(document.querySelector('.map-sidebar').textContent, /show all routes/i);
    view.update(routes, coordinates, buses, { fit: true });
    assert.equal(fitted.length, 4);
    assert.equal(document.querySelectorAll('.leaflet-overlay-pane path').length, 6, 'two routes and four stops');
    assert.equal(document.querySelectorAll('.bus-marker').length, 2);
    deferRoads = true;
    view.update([routes[0]], coordinates, [buses[0]], { fit: true });
    deferRoads = false;
    const beforePan = fitted.length;
    renderedMap.panTo([18.15, -76.8], { animate: false });
    const pannedCenter = renderedMap.getCenter();
    finishRoads({ ok: true, json: async () => ({ code: 'Ok', routes: [{ geometry: { coordinates: [[-76.8, 18], [-77.1, 18.005], [-76.8, 18.01]] }, legs: [{ annotation: { distance: [100, 100] } }] }] }) });
    for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve));
    assert.equal(fitted.length, beforePan, 'late roads must not undo a user pan');
    assert.ok(renderedMap.getCenter().equals(pannedCenter));
  } finally {
    renderedMap?.remove(); L.Map.prototype.fitBounds = originalFit;
    await server.close(); dom.window.close(); globalThis.fetch = originalFetch;
    delete globalThis.window; delete globalThis.document; delete globalThis.Element;
  }
});
