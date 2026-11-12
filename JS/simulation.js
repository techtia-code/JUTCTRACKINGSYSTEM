const EARTH_RADIUS_METRES = 6371000;

// About 30 km/h.
export const AVERAGE_SPEED_METRES_PER_SECOND = 8.3;

function toRadians(degrees) {
  return degrees * Math.PI / 180;
}

// Straight-line distance between two [latitude, longitude] points (haversine formula).
export function getDistanceMetres(from, to) {
  const latChange = toRadians(to[0] - from[0]);
  const lngChange = toRadians(to[1] - from[1]);
  const a = Math.sin(latChange / 2) ** 2 +
    Math.cos(toRadians(from[0])) * Math.cos(toRadians(to[0])) * Math.sin(lngChange / 2) ** 2;
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.sqrt(a));
}

// points holds each stop's coordinates. distances holds how far each stop is
// from the start of the route.
export function makeRoutePath(route, stopCoordinates) {
  const points = route.stops.map(stop => stopCoordinates[stop]);
  if (points.length < 2 || points.some(point => !Array.isArray(point) || point.length !== 2 ||
    !Number.isFinite(point[0]) || !Number.isFinite(point[1]) || Math.abs(point[0]) > 90 || Math.abs(point[1]) > 180)) {
    throw new Error('A route requires at least two stops with valid coordinates.');
  }
  const distances = [0];
  points.slice(1).forEach((point, index) => {
    const segment = getDistanceMetres(points[index], point);
    if (!Number.isFinite(segment) || segment <= 0) throw new Error('Consecutive route stops must have distinct coordinates and positive travel length.');
    distances.push(distances[index] + segment);
  });
  return { points, distances };
}

function getRouteLength(path) {
  return path.distances[path.distances.length - 1];
}

// A bus runs to the end of its route and back, so its trip is described by
// the metres travelled on that round trip: from 0 at the first stop, to the
// route length at the last stop, to twice the route length back at the start.
function normaliseTravelled(path, travelled) {
  const roundTrip = getRouteLength(path) * 2;
  return ((travelled % roundTrip) + roundTrip) % roundTrip;
}

// The simulated bus. Using the clock means every open tab shows the bus in
// the same place.
export function getSimulatedTravelled(path, time) {
  return normaliseTravelled(path, time / 1000 * AVERAGE_SPEED_METRES_PER_SECOND);
}

// How far along the route (from the first stop) the point on the route line
// nearest to latLng is. Over a few kilometres the earth is flat enough to
// treat latitude and longitude as x and y in metres.
export function getDistanceAlongRoute(path, latLng) {
  const { points, distances } = path;
  const metresPerDegree = EARTH_RADIUS_METRES * Math.PI / 180;
  const lngScale = Math.cos(toRadians(latLng[0]));
  let best = { gap: Infinity, along: 0 };

  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1];
    const to = points[index];
    const segmentX = (to[1] - from[1]) * lngScale * metresPerDegree;
    const segmentY = (to[0] - from[0]) * metresPerDegree;
    const pointX = (latLng[1] - from[1]) * lngScale * metresPerDegree;
    const pointY = (latLng[0] - from[0]) * metresPerDegree;
    const lengthSquared = segmentX ** 2 + segmentY ** 2;
    const share = lengthSquared === 0
      ? 0
      : Math.min(Math.max((pointX * segmentX + pointY * segmentY) / lengthSquared, 0), 1);
    const gap = Math.hypot(pointX - share * segmentX, pointY - share * segmentY);
    if (gap < best.gap) {
      best = { gap, along: distances[index - 1] + share * (distances[index] - distances[index - 1]) };
    }
  }
  return best.along;
}

// A shared location turned into metres travelled on the round trip.
export function getTravelledFromLocation(path, latLng, direction) {
  const along = getDistanceAlongRoute(path, latLng);
  return normaliseTravelled(path, direction === "inbound" ? getRouteLength(path) * 2 - along : along);
}

// Which way a bus is going, from two positions along its route. Moves under
// 20 metres are GPS noise, so the direction stays as it was.
const DIRECTION_NOISE_METRES = 20;

export function getDirectionFromMove(previousAlong, along, previousDirection) {
  if (previousAlong === null || previousAlong === undefined) return previousDirection;
  if (along - previousAlong > DIRECTION_NOISE_METRES) return "outbound";
  if (previousAlong - along > DIRECTION_NOISE_METRES) return "inbound";
  return previousDirection;
}

export function getDirectionFromTravelled(path, travelled) {
  return normaliseTravelled(path, travelled) < getRouteLength(path) ? "outbound" : "inbound";
}

// Where a route's bus is: the driver's shared location when there is one,
// otherwise the simulation.
export function getBusTravelled(path, liveLocation, time) {
  if (liveLocation) {
    return { travelled: getTravelledFromLocation(path, liveLocation.latLng, liveLocation.direction), live: true };
  }
  return { travelled: getSimulatedTravelled(path, time), live: false };
}

export function findBusPosition(route, path, time) {
  return findPositionFromTravelled(route, path, getSimulatedTravelled(path, time));
}

export function findPositionFromTravelled(route, path, travelledMetres) {
  const { points, distances } = path;
  const routeLength = getRouteLength(path);
  const travelled = normaliseTravelled(path, travelledMetres);
  const outbound = travelled < routeLength;
  const distance = outbound ? travelled : routeLength * 2 - travelled;

  const segment = Math.max(distances.findIndex(value => value >= distance), 1);
  const from = points[segment - 1];
  const to = points[segment];
  const progress = (distance - distances[segment - 1]) / (distances[segment] - distances[segment - 1]);

  return {
    latLng: [from[0] + (to[0] - from[0]) * progress, from[1] + (to[1] - from[1]) * progress],
    nextStop: route.stops[outbound ? segment : segment - 1],
    // Which pair of stops the bus is between, and how far (0 to 1) from the first.
    leg: segment - 1,
    progress
  };
}

export function getDelayMinutes(alerts, routeId) {
  return alerts
    .filter(alert => alert.routeId === routeId || alert.routeId === null)
    .reduce((total, alert) => total + alert.delayMinutes, 0);
}

// A bus passes each stop twice per round trip, once in each direction.
// Returns how far it still has to drive to each pass.
function getMetresToPasses(route, path, stop, travelledMetres) {
  const roundTrip = getRouteLength(path) * 2;
  const stopDistance = path.distances[route.stops.indexOf(stop)];
  const travelled = normaliseTravelled(path, travelledMetres);
  return {
    outbound: (stopDistance - travelled + roundTrip) % roundTrip,
    inbound: (roundTrip - stopDistance - travelled + roundTrip) % roundTrip
  };
}

// How far the bus still has to drive to reach the stop: the nearer pass.
export function getMetresToStop(route, path, stop, travelledMetres) {
  const passes = getMetresToPasses(route, path, stop, travelledMetres);
  return Math.min(passes.outbound, passes.inbound);
}

// Which way the bus will be going when it next leaves the stop. It turns
// round at each end, so it always leaves the first stop outbound and the
// last stop inbound.
export function getDirectionAtStop(route, path, stop, travelledMetres) {
  const index = route.stops.indexOf(stop);
  if (index === 0) return "outbound";
  if (index === route.stops.length - 1) return "inbound";
  const passes = getMetresToPasses(route, path, stop, travelledMetres);
  return passes.outbound <= passes.inbound ? "outbound" : "inbound";
}

// ETA = (distance / average speed) + traffic delay
export function getEtaFromTravelled(route, path, stop, travelledMetres, delayMinutes) {
  const distance = getMetresToStop(route, path, stop, travelledMetres);
  return Math.round(distance / AVERAGE_SPEED_METRES_PER_SECOND / 60) + delayMinutes;
}

export function getEtaMinutes(route, path, stop, time, delayMinutes) {
  return getEtaFromTravelled(route, path, stop, getSimulatedTravelled(path, time), delayMinutes);
}
