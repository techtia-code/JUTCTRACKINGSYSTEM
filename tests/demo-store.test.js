import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as demo from '../JS/demo-store.js';

function storage() { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }; }
function makeStore(shared = storage()) {
  assert.equal(typeof demo.createDemoStore, 'function');
  return demo.createDemoStore({ storage: shared, sessionStorage: storage(), now: () => Date.parse('2026-11-08T12:00:00Z') });
}

test('new unassigned buses run without a driver and explicit stops survive reopening', () => {
  let clock = Date.parse('2026-11-08T12:00:00Z');
  const shared = storage(), sessionStorage = storage();
  const store = demo.createDemoStore({ storage: shared, sessionStorage, now: () => clock });
  store.signIn('admin');
  const busId = store.saveBus('JUTC-2001', store.loadRoutes()[0].id, null);
  const first = store.loadBuses().find(b => b.id === busId);
  assert.equal(first.engineOn, true);
  store.signOut(); clock += 5000;
  assert.notEqual(store.loadBuses().find(b => b.id === busId).lat, first.lat);
  store.signIn('admin'); store.updateBus(busId, 'stop'); store.signOut();
  const stopped = store.loadBuses().find(b => b.id === busId);
  clock += 120000;
  const reopened = demo.createDemoStore({ storage: shared, sessionStorage, now: () => clock });
  assert.deepEqual(reopened.loadBuses().find(b => b.id === busId), stopped);
  reopened.signIn('admin'); reopened.updateBus(busId, 'start'); reopened.signOut();
  clock += 5000;
  assert.notEqual(reopened.loadBuses().find(b => b.id === busId).lat, stopped.lat);
});
test('public visitors can read fleet but cannot make management changes', () => {
  const store = makeStore();
  assert.ok(store.loadBuses().length >= 4);
  assert.ok(store.loadRoutes().length >= 4);
  assert.throws(() => store.saveStop('Depot', 18, -76), /administrator/i);
  assert.throws(() => store.updateBus(store.loadBuses()[0].id, 'start'), /sign in/i);
});

test('driver assignments accept names or emails and return no account IDs', () => {
  const store = makeStore();
  assert.throws(() => store.loadAssignments(), /administrator/i);
  store.signIn('admin');
  const busId = store.saveBus('JUTC-3001', store.loadRoutes()[0].id, ' DRIVER@JUTC.EXAMPLE.INVALID ');
  const assignment = store.loadAssignments().find(a => a.busId === busId);
  assert.deepEqual(assignment, { busId, driverName: 'Demo Driver', driverEmail: 'driver@jutc.example.invalid' });
  assert.equal(JSON.stringify(store.loadAssignments()).includes('demo-driver'), false);
  store.updateBus(busId, 'stop');
  store.assignBus(busId, 'demo driver');
  assert.equal(store.loadAssignments().find(a => a.busId === busId).driverName, 'Demo Driver');
  const before = store.loadAssignments();
  assert.throws(() => store.assignBus(busId, 'Unknown Person'), /name or email/i);
  assert.deepEqual(store.loadAssignments(), before);
  store.assignBus(busId, '');
  assert.equal(store.loadAssignments().some(a => a.busId === busId), false);
  store.signIn('driver');
  assert.throws(() => store.loadAssignments(), /administrator/i);
});
test('driver can start and stop assigned bus but cannot change another bus', () => {
  const store = makeStore(); store.signIn('driver');
  const assigned = store.loadAssignedBuses()[0];
  store.updateBus(assigned.id, 'start');
  assert.equal(store.loadBuses().find(b => b.id === assigned.id).engineOn, true);
  store.updateBus(assigned.id, 'stop');
  assert.equal(store.loadBuses().find(b => b.id === assigned.id).engineOn, false);
  const other = store.loadBuses().find(b => b.id !== assigned.id);
  assert.throws(() => store.updateBus(other.id, 'start'), /assigned/i);
  assert.throws(() => store.saveStop('Depot', 18, -76), /administrator/i);
});
test('admin creates stops and buses persistently and route deletion removes dependent fleet', () => {
  const shared = storage(); const store = makeStore(shared); store.signIn('admin');
  store.saveStop('Test stop', 18.1, -76.9);
  const routeId = store.saveRoute(null, 'Test route', ['Test stop', 'Papine']);
  store.saveBus('JUTC-TEST', routeId, null);
  const reopened = makeStore(shared);
  assert.ok(reopened.loadStops().some(s => s.name === 'Test stop'));
  assert.ok(reopened.loadBuses().some(b => b.label === 'JUTC-TEST'));
  store.deleteRoute(routeId);
  assert.ok(!store.loadBuses().some(b => b.routeId === routeId));
});
test('invalid route changes preserve the existing route and stops', () => {
  const store = makeStore(); store.signIn('admin');
  const original = store.loadRoutes()[0];
  assert.throws(() => store.saveRoute(original.id, 'Changed route', ['Missing', 'Papine']), /stop/i);
  assert.deepEqual(store.loadRoutes()[0], original);
  assert.throws(() => store.saveBus('BUS', 'missing-route', null), /route/i);
});
test('demo authentication is explicit and sign-out removes permissions', () => {
  const store = makeStore();
  assert.throws(() => store.signIn('unknown'), /role/i);
  store.signIn('admin'); store.signOut();
  assert.equal(store.getSession(), null);
  assert.throws(() => store.saveStop('Depot', 18, -76), /administrator/i);
});
test('invalid geometry is rejected before changing a route or creating a bus', () => {
  const store = makeStore(); store.signIn('admin');
  store.saveStop('Point One', 18, -76.8); store.saveStop('Point Two', 18, -76.8);
  const original = store.loadRoutes()[0];
  assert.throws(() => store.saveRoute(original.id, original.name, ['Point One', 'Point Two']), /coordinates|geometry|length/i);
  assert.deepEqual(store.loadRoutes()[0], original);
});
test('stop editing updates route names without allowing deletion of an in-use stop', () => {
  const store = makeStore(); store.signIn('admin');
  const stop = store.loadStops().find(s => s.name === 'Papine');
  store.updateStop(stop.id, 'Papine Terminal', stop.lat, stop.lng);
  assert.ok(store.loadRoutes().some(r => r.stops.includes('Papine Terminal')));
  assert.ok(!store.loadRoutes().some(r => r.stops.includes('Papine')));
  assert.throws(() => store.deleteStop(stop.id), /route still uses/i);
  store.saveStop('Unused stop', 18.05, -76.8);
  const unused = store.loadStops().find(s => s.name === 'Unused stop');
  store.deleteStop(unused.id);
  assert.ok(!store.loadStops().some(s => s.id === unused.id));
});
