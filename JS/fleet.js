import { findBusPosition, getEtaMinutes, makeRoutePath } from './simulation.js';

export const BUS_UPDATE_INTERVAL_MS = 5000;
export const STALE_AFTER_MS = 60000;

export function elapsedSeconds(bus, now = Date.now()) {
  const elapsed = bus.engineOn && bus.startedAt ? Math.max(0, (now - Date.parse(bus.startedAt)) / 1000) : 0;
  return (bus.progressSeconds || 0) + elapsed;
}

export function simulateBus(bus, route, coordinates, now = Date.now()) {
  const position = findBusPosition(route, makeRoutePath(route, coordinates), elapsedSeconds(bus, now) * 1000);
  return { lat: position.latLng[0], lng: position.latLng[1], nextStop: position.nextStop };
}

export function isFresh(bus, now = Date.now()) {
  const timestamp = Date.parse(bus.updatedAt);
  return Number.isFinite(timestamp) && now - timestamp <= STALE_AFTER_MS && now - timestamp >= -10000;
}

export function busEtaMinutes(bus, route, coordinates, stop, delay = 0, now = Date.now()) {
  if (!bus || !bus.engineOn || !isFresh(bus, now) || !route.stops.includes(stop)) return null;
  // Persisted progress corresponds to the last published coordinates, not a wall-clock projection.
  const seconds = bus.preview ? elapsedSeconds(bus, now) : (bus.locationProgressSeconds ?? bus.progressSeconds ?? 0);
  return getEtaMinutes(route, makeRoutePath(route, coordinates), stop, seconds * 1000, delay);
}

export function getBusAlerts(bus, distanceMetres, routeDelayed = false, now = Date.now()) {
  if (!bus || !bus.engineOn || !isFresh(bus, now)) return [];
  const alerts = [];
  if (Number.isFinite(distanceMetres) && distanceMetres <= 1000) alerts.push({ type: 'nearby', message: `${bus.label} is within 1 km of your selected stop.` });
  if (bus.status === 'delayed' || routeDelayed) alerts.push({ type: 'delay', message: `${bus.label} has a reported delay.` });
  return alerts;
}

export function validateStop(name, latitude, longitude, stops) {
  name = name.trim();
  if (name.length < 3 || name.length > 100) return { error: 'Enter a stop name between 3 and 100 characters.' };
  if (String(latitude).trim() === '' || String(longitude).trim() === '') return { error: 'Enter both latitude and longitude.' };
  const lat = Number(latitude), lng = Number(longitude);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) return { error: 'Enter valid latitude (-90 to 90) and longitude (-180 to 180).' };
  if (stops.some(stop => stop.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return { error: 'A stop already uses that name.' };
  return { name, lat, lng };
}
