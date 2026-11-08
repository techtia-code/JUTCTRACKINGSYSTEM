import { getDistanceMetres } from "./simulation.js";

// The free public OSRM router, which uses OpenStreetMap roads.
const ROUTER_URL = "https://router.project-osrm.org/route/v1/driving/";
const CACHE_PREFIX = "jutc-road-legs:";

function readCache(key) {
  try {
    const saved = localStorage.getItem(CACHE_PREFIX + key);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

function writeCache(key, legs) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(legs));
  } catch {
    // Private windows can block storage; the route is just fetched again next time.
  }
}

// The roads between each pair of neighbouring stops, as one list of
// [latitude, longitude] points per pair, or null when the router can't help.
export async function fetchRoadLegs(points) {
  if (points.length < 2) return null;
  const key = points.map(([lat, lng]) => lng + "," + lat).join(";");
  const cached = readCache(key);
  if (cached) return cached;

  try {
    const response = await fetch(ROUTER_URL + key + "?overview=full&geometries=geojson&annotations=distance");
    if (!response.ok) return null;
    const result = await response.json();
    if (result.code !== "Ok" || !result.routes?.length) return null;

    const { geometry, legs } = result.routes[0];
    const coordinates = geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    // Each leg has one point more than its segments, and shares its first point
    // with the end of the leg before it.
    let start = 0;
    const roadLegs = legs.map(leg => {
      const segments = leg.annotation.distance.length;
      const legPoints = coordinates.slice(start, start + segments + 1);
      start += segments;
      return legPoints;
    });
    if (roadLegs.length !== points.length - 1 || roadLegs.some(leg => leg.length < 2)) return null;

    writeCache(key, roadLegs);
    return roadLegs;
  } catch (error) {
    console.warn("Could not load the roads for a route; drawing it as straight lines.", error);
    return null;
  }
}

// The point share (0 to 1) of the way along a line of [latitude, longitude] points.
export function pointAlongLine(points, share) {
  const lengths = points.slice(1).map((point, index) => getDistanceMetres(points[index], point));
  let remaining = lengths.reduce((total, length) => total + length, 0) * Math.min(Math.max(share, 0), 1);

  for (let index = 0; index < lengths.length; index++) {
    if (remaining <= lengths[index]) {
      const progress = lengths[index] === 0 ? 0 : remaining / lengths[index];
      const from = points[index];
      const to = points[index + 1];
      return [from[0] + (to[0] - from[0]) * progress, from[1] + (to[1] - from[1]) * progress];
    }
    remaining -= lengths[index];
  }
  return points[points.length - 1];
}

// Where to draw a simulated bus: on the roads once they have loaded,
// otherwise on the straight line between stops. position comes from
// findPositionFromTravelled.
export function positionOnRoads(position, roadLegs) {
  return roadLegs ? pointAlongLine(roadLegs[position.leg], position.progress) : position.latLng;
}
