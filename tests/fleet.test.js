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
test('a bus heads for the end of the route it is driving towards, and turns round at each end', () => {
  assert.equal(fleet.busHeading(bus, route, coordinates, null, now), 'C');
  assert.equal(fleet.busHeading({ ...bus, progressSeconds: 300 }, route, coordinates, null, now), 'A', 'past C, it is on the way back');
  // Given a stop, the way the bus will be going when it gets there.
  assert.equal(fleet.busHeading(bus, route, coordinates, 'B', now), 'C');
  assert.equal(fleet.busHeading({ ...bus, progressSeconds: 150 }, route, coordinates, 'B', now), 'A', 'just past B, it next reaches B on the way back');
  assert.equal(fleet.busHeading({ ...bus, progressSeconds: 150 }, route, coordinates, 'A', now), 'C');
  assert.equal(fleet.busHeading(bus, route, coordinates, 'C', now), 'A');
  assert.equal(fleet.busHeading({ ...bus, engineOn: false }, route, coordinates, null, now), null);
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
test('buses are named by fleet number, including older JUTC- labels', () => {
  assert.equal(fleet.busName({ label: '1004' }), 'Bus 1004');
  assert.equal(fleet.busName({ label: 'JUTC-1001' }), 'Bus 1001');
  assert.equal(fleet.busName({ label: 'Live driver bus' }), 'Live driver bus');
  assert.match(fleet.getBusAlerts({ ...bus, label: '1004' }, 500, false, now)[0].message, /^Bus 1004 is within 1 km/);
});
test('fleet numbers are 3 to 5 unique digits', () => {
  assert.deepEqual(fleet.validateFleetNumber(' 1005 ', []), { number: '1005' });
  assert.deepEqual(fleet.validateFleetNumber('JUTC-1005', []), { number: '1005' });
  for (const bad of ['', '12', '123456', 'JUTC-SAMPLE-1a2b3c4d', 'BUS']) assert.ok(fleet.validateFleetNumber(bad, []).error, bad);
  assert.match(fleet.validateFleetNumber('1001', [{ label: 'JUTC-1001' }]).error, /already/);
});
test('arrivals list the route buses soonest first, with parked and stale buses last', () => {
  const buses = [
    { ...bus, id: 'parked', label: '1001', engineOn: false, startedAt: null },
    { ...bus, id: 'far', label: '1003', progressSeconds: 0 },
    { ...bus, id: 'stale', label: '1004', updatedAt: new Date(now - 120000).toISOString() },
    { ...bus, id: 'near', label: '1002', progressSeconds: 200, status: 'delayed' },
    { ...bus, id: 'other-route', label: '1005', routeId: 'r2' }
  ];
  const arrivals = fleet.arrivalsAtStop(buses, route, coordinates, 'C', 0, now);
  assert.deepEqual(arrivals.map(a => a.bus.id), ['near', 'far', 'parked', 'stale']);
  assert.deepEqual(arrivals.map(a => a.state), ['delayed', 'running', 'parked', 'stale']);
  assert.ok(arrivals[0].minutes < arrivals[1].minutes);
  assert.equal(arrivals[2].minutes, null);
  assert.equal(arrivals[3].minutes, null);
  assert.equal(fleet.arrivalsAtStop(buses, route, coordinates, 'C', 5, now)[0].minutes, arrivals[0].minutes + 5, 'route delays are included');
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
