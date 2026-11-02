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
  const distances = [0];
  points.slice(1).forEach((point, index) => {
    distances.push(distances[index] + getDistanceMetres(points[index], point));
  });
  return { points, distances };
}

// Each bus runs to the end of its route and back. Using the clock means
// every open tab shows the buses in the same place.
function getTravelledMetres(path, time) {
  const routeLength = path.distances[path.distances.length - 1];
  return (time / 1000 * AVERAGE_SPEED_METRES_PER_SECOND) % (routeLength * 2);
}

export function findBusPosition(route, path, time) {
  const { points, distances } = path;
  const routeLength = distances[distances.length - 1];
  const travelled = getTravelledMetres(path, time);
  const outbound = travelled < routeLength;
  const distance = outbound ? travelled : routeLength * 2 - travelled;

  const segment = Math.max(distances.findIndex(value => value >= distance), 1);
  const from = points[segment - 1];
  const to = points[segment];
  const progress = (distance - distances[segment - 1]) / (distances[segment] - distances[segment - 1]);

  return {
    latLng: [from[0] + (to[0] - from[0]) * progress, from[1] + (to[1] - from[1]) * progress],
    nextStop: route.stops[outbound ? segment : segment - 1]
  };
}

export function getDelayMinutes(alerts, routeId) {
  return alerts
    .filter(alert => alert.routeId === routeId || alert.routeId === null)
    .reduce((total, alert) => total + alert.delayMinutes, 0);
}

// ETA = (distance / average speed) + traffic delay
export function getEtaMinutes(route, path, stop, time, delayMinutes) {
  const roundTrip = path.distances[path.distances.length - 1] * 2;
  const stopDistance = path.distances[route.stops.indexOf(stop)];
  const travelled = getTravelledMetres(path, time);

  // The bus passes each stop twice per round trip, once in each direction.
  const toOutboundPass = (stopDistance - travelled + roundTrip) % roundTrip;
  const toInboundPass = (roundTrip - stopDistance - travelled + roundTrip) % roundTrip;
  const distance = Math.min(toOutboundPass, toInboundPass);

  return Math.round(distance / AVERAGE_SPEED_METRES_PER_SECOND / 60) + delayMinutes;
}
