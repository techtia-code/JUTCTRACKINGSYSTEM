import { AVERAGE_SPEED_METRES_PER_SECOND, findBusPosition, findPositionFromTravelled, getDirectionAtStop, getDirectionFromTravelled, getEtaFromTravelled, getTravelledFromLocation, makeRoutePath } from './simulation.js';

export const BUS_UPDATE_INTERVAL_MS = 5000;
export const STALE_AFTER_MS = 60000;

// Riders know a JUTC service by its route number ("the 22"); each bus also
// carries a fleet number. Older saved labels may still read "JUTC-1001".
const FLEET_NUMBER = /^(?:JUTC-)?(\d{3,5})$/i;

export function busName(bus) {
  const label = String(bus?.label ?? '').trim();
  const number = label.match(FLEET_NUMBER)?.[1];
  return number ? `Bus ${number}` : label || 'Bus';
}

// Returns { number } or { error }. Admins enter just the digits, e.g. 1005.
export function validateFleetNumber(entered, buses = []) {
  const number = String(entered ?? '').trim().match(FLEET_NUMBER)?.[1];
  if (!number) return { error: 'Enter a fleet number of 3 to 5 digits, for example 1005.' };
  if (buses.some(bus => String(bus.label ?? '').trim().match(FLEET_NUMBER)?.[1] === number)) return { error: 'Another bus already uses that fleet number.' };
  return { number };
}

export const BUS_STATE_LABELS = { parked: 'Parked', stale: 'Location stale', delayed: 'Delayed', running: 'Running' };

export function busState(bus, now = Date.now()) {
  if (!bus.engineOn) return 'parked';
  if (!isFresh(bus, now)) return 'stale';
  return bus.status === 'delayed' ? 'delayed' : 'running';
}

// Every bus on the route with its estimate for one stop and the way it will
// be going from there: soonest first, buses without an estimate (parked or
// stale) last.
export function arrivalsAtStop(buses, route, coordinates, stop, delay = 0, now = Date.now()) {
  return buses.filter(bus => bus.routeId === route.id)
    .map(bus => {
      const minutes = busEtaMinutes(bus, route, coordinates, stop, delay, now);
      return { bus, state: busState(bus, now), minutes, heading: minutes === null ? null : busHeading(bus, route, coordinates, stop, now) };
    })
    .sort((a, b) => ((a.minutes ?? Infinity) - (b.minutes ?? Infinity)) ||
      busName(a.bus).localeCompare(busName(b.bus), undefined, { numeric: true }));
}

// Route-based driver feeds have no fleet ID. Keep them separate rather than overwrite every bus on that route.
export function routeSharedBuses(routes, coordinates, locations) {
  return routes.flatMap(route => {
    const location = locations.get(route.id); if (!location) return [];
    const path = makeRoutePath(route, coordinates);
    const travelled = getTravelledFromLocation(path, location.latLng, location.direction);
    return [{ id: `route-shared:${route.id}`, label: 'Live driver bus', routeId: route.id,
      engineOn: true, status: 'on_time', lat: location.latLng[0], lng: location.latLng[1],
      updatedAt: location.updatedAt, locationProgressSeconds: travelled / AVERAGE_SPEED_METRES_PER_SECOND,
      nextStop: findPositionFromTravelled(route, path, travelled).nextStop, source: 'driver' }];
  });
}

export function elapsedSeconds(bus, now = Date.now()) {
  const elapsed = bus.engineOn && bus.startedAt ? Math.max(0, (now - Date.parse(bus.startedAt)) / 1000) : 0;
  return (bus.progressSeconds || 0) + elapsed;
}

export function simulateBus(bus, route, coordinates, now = Date.now()) {
  const position = findBusPosition(route, makeRoutePath(route, coordinates), elapsedSeconds(bus, now) * 1000);
  return { lat: position.latLng[0], lng: position.latLng[1], nextStop: position.nextStop };
}

// Fleet simulation follows the saved engine clock; no driver page or public writes are required.
export function projectSimulatedBus(bus, route, coordinates, now = Date.now()) {
  if (!bus.autonomousSimulation || !bus.engineOn || bus.source === 'driver') return bus;
  return { ...bus, ...simulateBus(bus, route, coordinates, now),
    locationProgressSeconds: elapsedSeconds(bus, now), updatedAt: new Date(now).toISOString(),
    preview: true, source: 'simulation' };
}

export function isFresh(bus, now = Date.now()) {
  const timestamp = Date.parse(bus.updatedAt);
  return Number.isFinite(timestamp) && now - timestamp <= STALE_AFTER_MS && now - timestamp >= -10000;
}

// Metres the bus has travelled on its round trip (see simulation.js). Persisted
// progress corresponds to the last published coordinates, not a wall-clock projection.
export function busTravelled(bus, now = Date.now()) {
  return (bus.preview ? elapsedSeconds(bus, now) : (bus.locationProgressSeconds ?? bus.progressSeconds ?? 0)) * AVERAGE_SPEED_METRES_PER_SECOND;
}

export function busEtaMinutes(bus, route, coordinates, stop, delay = 0, now = Date.now()) {
  if (!bus || !bus.engineOn || !isFresh(bus, now) || !route.stops.includes(stop)) return null;
  return getEtaFromTravelled(route, makeRoutePath(route, coordinates), stop, busTravelled(bus, now), delay);
}

// The end of the route a running bus is heading for, like the sign on its
// front. Given a stop, the way it will be going when it leaves that stop.
export function busHeading(bus, route, coordinates, stop = null, now = Date.now()) {
  if (!bus?.engineOn || !route) return null;
  const path = makeRoutePath(route, coordinates), travelled = busTravelled(bus, now);
  const direction = stop ? getDirectionAtStop(route, path, stop, travelled) : getDirectionFromTravelled(path, travelled);
  return direction === 'outbound' ? route.stops.at(-1) : route.stops[0];
}

export function getBusAlerts(bus, distanceMetres, routeDelayed = false, now = Date.now()) {
  if (!bus || !bus.engineOn || !isFresh(bus, now)) return [];
  const alerts = [];
  if (Number.isFinite(distanceMetres) && distanceMetres <= 1000) alerts.push({ type: 'nearby', message: `${busName(bus)} is within 1 km of your stop.` });
  if (bus.status === 'delayed' || routeDelayed) alerts.push({ type: 'delay', message: `${busName(bus)} has a reported delay.` });
  return alerts;
}
