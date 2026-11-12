import { makeSampleData, SAMPLE_ROUTE_NUMBERS } from './sample-data.js';
import { elapsedSeconds, projectSimulatedBus, simulateBus, validateFleetNumber } from './fleet.js';
import { validateAlert, validateRoute, validateRouteNumber, validateStop } from './planner.js';
import { makeRoutePath } from './simulation.js';

const DATA_KEY = 'jutc-demo-data-v1';
const SESSION_KEY = 'jutc-demo-session-v1';
const DEMO_DRIVER = { id: 'demo-driver', name: 'Demo Driver', email: 'driver@jutc.example.invalid' };

function resolveDriver(identifier) {
  const value = identifier?.trim().toLowerCase();
  if (!value) return null;
  if (value === DEMO_DRIVER.name.toLowerCase() || value === DEMO_DRIVER.email) return DEMO_DRIVER.id;
  throw new Error('No driver matches that name or email. Use Demo Driver or driver@jutc.example.invalid.');
}

export function createDemoStore({ storage, sessionStorage, now = Date.now }) {
  function read() {
    const saved = storage.getItem(DATA_KEY);
    if (saved) {
      try {
        const state = JSON.parse(saved);
        if (state.version === 1) {
          // Upgrade saved demo data without resetting routes, assignments or positions:
          // "JUTC-1001" becomes fleet number "1001", "JUTC-DEMO-01" gets the next free
          // number, and the sample routes gain their route numbers.
          let number = 1001, changed = false;
          const used = new Set(state.buses.map(bus => bus.label.replace(/^JUTC-(?=\d+$)/i, '')));
          for (const bus of state.buses) {
            if (bus.autonomousSimulation === undefined) { bus.autonomousSimulation = true; changed = true; }
            const legacy = bus.label.match(/^JUTC-(\d+)$/i);
            if (legacy) { bus.label = legacy[1]; changed = true; continue; }
            if (!/^JUTC-DEMO-\d+$/.test(bus.label)) continue;
            while (used.has(String(number))) number++;
            bus.label = String(number++); used.add(bus.label); changed = true;
          }
          const usedNumbers = new Set(state.routes.map(route => route.number).filter(Boolean));
          for (const route of state.routes) {
            if (route.number !== undefined) continue;
            const sample = SAMPLE_ROUTE_NUMBERS[route.name];
            route.number = sample && !usedNumbers.has(sample) ? sample : null;
            if (route.number) usedNumbers.add(route.number);
            changed = true;
          }
          if (changed) storage.setItem(DATA_KEY, JSON.stringify(state));
          return state;
        }
      } catch { /* Explain corrupt data instead of overwriting it. */ }
      throw new Error('Local demo data could not be read. Clear this site\'s demo data in browser settings to reset it.');
    }
    const state = makeSampleData(now()); storage.setItem(DATA_KEY, JSON.stringify(state)); return state;
  }
  function mutate(action) { const state = read(); const result = action(state); storage.setItem(DATA_KEY, JSON.stringify(state)); return result; }
  function session() { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)) || null; } catch { return null; } }
  function admin() { if (session()?.role !== 'admin') throw new Error('An administrator must sign in to make this change.'); }
  function authorisedBus(state, id) {
    const user = session(); if (!user) throw new Error('Sign in before updating a bus.');
    const bus = state.buses.find(b => b.id === id); if (!bus) throw new Error('Bus not found.');
    if (user.role !== 'admin' && !state.assignments.some(a => a.busId === id && a.driverId === user.user.id)) throw new Error('This bus is not assigned to you.');
    return bus;
  }
  function id() { return globalThis.crypto.randomUUID(); }
  return {
    getSession: session,
    signIn(role) {
      if (!['admin', 'driver'].includes(role)) throw new Error('Choose a valid demo role.');
      const value = { user: { id: `demo-${role}` }, role }; sessionStorage.setItem(SESSION_KEY, JSON.stringify(value)); return value;
    },
    signOut() { sessionStorage.removeItem(SESSION_KEY); },
    loadStops: () => read().stops,
    loadRoutes: () => read().routes,
    loadAlerts: () => read().alerts,
    loadBuses() {
      const state = read(); const coords = Object.fromEntries(state.stops.map(s => [s.name, [s.lat, s.lng]]));
      return state.buses.map(bus => projectSimulatedBus(bus, state.routes.find(r => r.id === bus.routeId), coords, now()));
    },
    loadAssignedBuses() {
      const state = read(), user = session(); if (!user) throw new Error('Sign in first.');
      return this.loadBuses().filter(bus => user.role === 'admin' || state.assignments.some(a => a.busId === bus.id && a.driverId === user.user.id));
    },
    loadAssignments() { admin(); return read().assignments.map(a => ({ busId: a.busId, driverName: DEMO_DRIVER.name, driverEmail: DEMO_DRIVER.email })); },
    saveStop(name, lat, lng) {
      admin(); return mutate(state => { const value = validateStop(name, lat, lng, state.stops); if (value.error) throw new Error(value.error);
        state.stops.push({ id: id(), ...value }); });
    },
    updateStop(stopId, name, lat, lng) {
      admin(); return mutate(state => {
        const stop = state.stops.find(s => s.id === stopId); if (!stop) throw new Error('Stop not found.');
        const value = validateStop(name, lat, lng, state.stops, stopId);
        if (value.error) throw new Error(value.error);
        const oldName = stop.name;
        const affected = state.routes.filter(route => route.stops.includes(oldName));
        const coords = Object.fromEntries(state.stops.map(s => [s.id === stopId ? value.name : s.name, s.id === stopId ? [value.lat, value.lng] : [s.lat, s.lng]]));
        for (const route of affected) makeRoutePath({ ...route, stops: route.stops.map(n => n === oldName ? value.name : n) }, coords);
        Object.assign(stop, value);
        for (const route of affected) {
          route.stops = route.stops.map(n => n === oldName ? value.name : n);
          const first = state.stops.find(s => s.name === route.stops[0]);
          state.buses.filter(b => b.routeId === route.id).forEach(b => Object.assign(b, { engineOn: false, preview: false, startedAt: null, progressSeconds: 0, locationProgressSeconds: 0, lat: first.lat, lng: first.lng, nextStop: route.stops[1], updatedAt: new Date(now()).toISOString() }));
        }
      });
    },
    deleteStop(stopId) {
      admin(); return mutate(state => {
        const stop = state.stops.find(s => s.id === stopId); if (!stop) throw new Error('Stop not found.');
        if (state.routes.some(route => route.stops.includes(stop.name))) throw new Error('A route still uses this stop. Remove it from the route first.');
        state.stops = state.stops.filter(s => s.id !== stopId);
      });
    },
    saveRoute(routeId, name, stopNames, number) {
      admin(); return mutate(state => {
        const result = validateRoute(name, stopNames.join(','), state.stops.map(s => s.name), state.routes, routeId);
        if (result.error) throw new Error(result.error);
        // Leaving the number out keeps the route's current number, like stop edits in the database.
        let routeNumber = state.routes.find(r => r.id === routeId)?.number ?? null;
        if (number !== undefined && number !== null && String(number).trim() !== '') {
          const checkedNumber = validateRouteNumber(number, state.routes, routeId);
          if (checkedNumber.error) throw new Error(checkedNumber.error);
          routeNumber = checkedNumber.number;
        }
        const route = { id: routeId || id(), number: routeNumber, name: result.name, stops: result.stops };
        makeRoutePath(route, Object.fromEntries(state.stops.map(s => [s.name, [s.lat, s.lng]])));
        if (routeId) { const index = state.routes.findIndex(r => r.id === routeId); if (index < 0) throw new Error('Route not found.'); state.routes[index] = route;
          state.buses.filter(b => b.routeId === routeId).forEach(b => Object.assign(b, { engineOn: false, preview: false, startedAt: null, progressSeconds: 0, locationProgressSeconds: 0, lat: state.stops.find(s => s.name === route.stops[0]).lat, lng: state.stops.find(s => s.name === route.stops[0]).lng, nextStop: route.stops[1], updatedAt: new Date(now()).toISOString() }));
        } else state.routes.push(route);
        return route.id;
      });
    },
    deleteRoute(routeId) { admin(); mutate(s => { s.routes = s.routes.filter(r => r.id !== routeId); s.alerts = s.alerts.filter(a => a.routeId !== routeId);
      s.buses = s.buses.filter(b => b.routeId !== routeId); s.assignments = s.assignments.filter(a => s.buses.some(b => b.id === a.busId)); }); },
    saveAlert(routeId, type, message, delayMinutes) { admin(); mutate(s => {
      const result = validateAlert(message, delayMinutes); if (result.error) throw new Error(result.error);
      if (!['delay', 'route_change', 'disruption'].includes(type)) throw new Error('Invalid alert type.');
      if (routeId && !s.routes.some(r => r.id === routeId)) throw new Error('Route not found.');
      s.alerts.unshift({ id: id(), routeId: routeId || null, routeName: s.routes.find(r => r.id === routeId)?.name || 'All routes', type, ...result });
    }); },
    deleteAlert(alertId) { admin(); mutate(s => { s.alerts = s.alerts.filter(a => a.id !== alertId); }); },
    saveBus(label, routeId, driver) { admin(); return mutate(s => {
      const fleetNumber = validateFleetNumber(label, s.buses); if (fleetNumber.error) throw new Error(fleetNumber.error);
      label = fleetNumber.number;
      const route = s.routes.find(r => r.id === routeId); if (!route) throw new Error('Choose an available route.');
      makeRoutePath(route, Object.fromEntries(s.stops.map(stop => [stop.name, [stop.lat, stop.lng]])));
      const driverId = resolveDriver(driver);
      const stop = s.stops.find(x => x.name === route.stops[0]); const busId = id();
      s.buses.push({ id: busId, label, routeId, engineOn: true, autonomousSimulation: true, status: 'on_time', startedAt: new Date(now()).toISOString(), progressSeconds: 0, locationProgressSeconds: 0, lat: stop.lat, lng: stop.lng, nextStop: route.stops[1], updatedAt: new Date(now()).toISOString() });
      if (driverId) s.assignments.push({ busId, driverId }); return busId;
    }); },
    assignBus(busId, driver) { admin(); mutate(s => { if (!s.buses.some(b => b.id === busId)) throw new Error('Bus not found.');
      const driverId = resolveDriver(driver);
      const bus = s.buses.find(b => b.id === busId); if (bus.engineOn && !bus.preview) throw new Error('Stop the bus before changing its driver.');
      s.assignments = s.assignments.filter(a => a.busId !== busId); if (driverId) s.assignments.push({ busId, driverId }); }); },
    updateBus(busId, action, status) { return mutate(s => {
      const bus = authorisedBus(s, busId), route = s.routes.find(r => r.id === bus.routeId);
      const coords = Object.fromEntries(s.stops.map(stop => [stop.name, [stop.lat, stop.lng]]));
      if (!['start', 'stop', 'publish', 'status'].includes(action)) throw new Error('Invalid driver action.');
      if (status && !['on_time', 'delayed'].includes(status)) throw new Error('Invalid bus status.');
      if (action === 'publish' && !bus.engineOn) throw new Error('Start the engine before updating location.');
      Object.assign(bus, simulateBus(bus, route, coords, now()));
      bus.locationProgressSeconds = elapsedSeconds(bus, now());
      if (action === 'start' && !bus.engineOn) { bus.startedAt = new Date(now()).toISOString(); bus.engineOn = true; }
      if (action === 'stop') { bus.progressSeconds = elapsedSeconds(bus, now()); bus.startedAt = null; bus.engineOn = false; }
      bus.preview = false; bus.updatedAt = new Date(now()).toISOString(); if (status) bus.status = status; return { ...bus };
    }); }
  };
}
