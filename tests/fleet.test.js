import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fleet from '../JS/fleet.js';

const route = { id: 'r1', stops: ['A', 'B', 'C'] };
const coordinates = { A: [18, -76.8], B: [18.01, -76.8], C: [18.02, -76.8] };
const now = Date.parse('2026-11-08T12:00:00Z');
const bus = { id: 'b1', routeId: 'r1', label: 'Bus 01', engineOn: true, status: 'on_time',
  startedAt: new Date(now - 60000).toISOString(), progressSeconds: 0,
  lat: 18.004, lng: -76.8, nextStop: 'B', updatedAt: new Date(now).toISOString() };

test('driver simulation advances a running bus and freezes a stopped bus', () => {
  assert.equal(typeof fleet.simulateBus, 'function');
  const running = fleet.simulateBus(bus, route, coordinates, now);
  assert.ok(running.lat > 18);
  const stopped = fleet.simulateBus({ ...bus, engineOn: false, startedAt: null, progressSeconds: 0 }, route, coordinates, now);
  assert.equal(stopped.lat, 18);
});
test('different buses on the same route have independent positions', () => {
  assert.equal(typeof fleet.simulateBus, 'function');
  assert.notEqual(fleet.simulateBus(bus, route, coordinates, now).lat,
    fleet.simulateBus({ ...bus, progressSeconds: 80 }, route, coordinates, now).lat);
});

test('autonomous simulation advances without a driver publishing locations', () => {
  assert.equal(typeof fleet.projectSimulatedBus, 'function');
  const saved = { ...bus, autonomousSimulation: true, updatedAt: new Date(now - 3600000).toISOString() };
  const first = fleet.projectSimulatedBus(saved, route, coordinates, now);
  const later = fleet.projectSimulatedBus(saved, route, coordinates, now + 5000);
  assert.notEqual(first.lat, later.lat);
  assert.equal(first.source, 'simulation');
  assert.equal(fleet.isFresh(first, now), true);
  assert.notEqual(fleet.busEtaMinutes(first, route, coordinates, 'C', 0, now), null);
  assert.equal(saved.updatedAt, new Date(now - 3600000).toISOString(), 'projection must not rewrite the saved state');
});

test('manual stop stays frozen and driver feeds do not gain simulated freshness', () => {
  assert.equal(typeof fleet.projectSimulatedBus, 'function');
  const stopped = { ...bus, autonomousSimulation: true, engineOn: false, startedAt: null, progressSeconds: 60 };
  assert.deepEqual(fleet.projectSimulatedBus(stopped, route, coordinates, now + 300000), stopped);
  assert.equal(fleet.busEtaMinutes(stopped, route, coordinates, 'C', 0, now), null);
  const driverFeed = { ...bus, source: 'driver', updatedAt: new Date(now - 61000).toISOString() };
  assert.deepEqual(fleet.projectSimulatedBus(driverFeed, route, coordinates, now), driverFeed);
  assert.equal(fleet.isFresh(driverFeed, now), false);
});
test('passenger ETA uses the selected bus progress and includes delay', () => {
  assert.equal(typeof fleet.busEtaMinutes, 'function');
  assert.equal(fleet.busEtaMinutes({ ...bus, engineOn: false }, route, coordinates, 'C', 0, now), null);
  const first = fleet.busEtaMinutes(bus, route, coordinates, 'C', 0, now);
  assert.equal(fleet.busEtaMinutes(bus, route, coordinates, 'C', 7, now), first + 7);
  assert.equal(fleet.busEtaMinutes({ ...bus, updatedAt: new Date(now - 61000).toISOString() }, route, coordinates, 'C', 0, now), null);
});
test('proximity alerts include the 1km boundary and exclude stopped/stale buses', () => {
  assert.equal(typeof fleet.getBusAlerts, 'function');
  assert.equal(fleet.getBusAlerts(bus, 1000, false, now)[0].type, 'nearby');
  assert.deepEqual(fleet.getBusAlerts(bus, 1001, false, now), []);
  assert.deepEqual(fleet.getBusAlerts({ ...bus, engineOn: false }, 50, false, now), []);
  assert.deepEqual(fleet.getBusAlerts({ ...bus, updatedAt: null }, 50, false, now), []);
  assert.equal(fleet.getBusAlerts({ ...bus, status: 'delayed' }, 3000, false, now)[0].type, 'delay');
  assert.equal(fleet.getBusAlerts(bus, 3000, true, now)[0].type, 'delay');
});
test('stop validation rejects invalid coordinates and duplicate names', () => {
  assert.equal(typeof fleet.validateStop, 'function');
  assert.ok(fleet.validateStop('New stop', '', '-76', []).error);
  assert.ok(fleet.validateStop('New stop', '91', '-76', []).error);
  assert.ok(fleet.validateStop('New stop', '18', '181', []).error);
  assert.ok(fleet.validateStop(' papine ', '18', '-76', [{ name: 'Papine' }]).error);
  assert.deepEqual(fleet.validateStop(' New stop ', '18', '-76', []), { name: 'New stop', lat: 18, lng: -76 });
});
test('route-shared positions stay separate from individual fleet buses and retain their coordinates', () => {
  const locations = new Map([['r1', { latLng: [18.005, -76.8], direction: 'outbound', updatedAt: new Date(now).toISOString() }]]);
  const shared = fleet.routeSharedBuses([route], coordinates, locations);
  assert.equal(shared.length, 1);
  assert.equal(shared[0].id, 'route-shared:r1');
  assert.equal(shared[0].source, 'driver');
  assert.equal(shared[0].lat, 18.005);
  assert.equal(shared[0].lng, -76.8);
  assert.ok(fleet.busEtaMinutes(shared[0], route, coordinates, 'C', 0, now) >= 0);
  assert.deepEqual(fleet.routeSharedBuses([route], coordinates, new Map()), []);
});
