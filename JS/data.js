import { getSupabase } from "./supabase.js";

export const ALERT_TYPES = {
  delay: "Delay",
  route_change: "Route change",
  disruption: "Service disruption"
};

function checkResult({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

// Row Level Security hides rows from users who cannot change them, so an
// update or delete that was refused returns no rows instead of an error.
function checkChanged(result) {
  const rows = checkResult(result);
  if (rows.length === 0) throw new Error("The change was not saved. Log in again and try again.");
}

export async function loadStops() {
  return checkResult(await getSupabase().from("stops").select("id, name, lat, lng").order("name"));
}

// Postgres error codes the admin page explains in plain words
const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";

// Inserts a new stop (stopId null) or updates one.
export async function saveStop(stopId, name, lat, lng) {
  const query = stopId
    ? getSupabase().from("stops").update({ name, lat, lng }).eq("id", stopId).select("id")
    : getSupabase().from("stops").insert({ name, lat, lng }).select("id");
  const result = await query;
  if (result.error?.code === UNIQUE_VIOLATION) throw new Error("A stop already uses that name.");
  checkChanged(result);
}

export async function deleteStop(stopId) {
  const result = await getSupabase().from("stops").delete().eq("id", stopId).select("id");
  if (result.error?.code === FOREIGN_KEY_VIOLATION) {
    throw new Error("A route still uses this stop. Remove it from the route first.");
  }
  checkChanged(result);
}

function toRoute(row) {
  return {
    id: row.id,
    name: row.name,
    stops: [...row.route_stops]
      .sort((first, second) => first.position - second.position)
      .map(routeStop => routeStop.stops.name)
  };
}

export async function loadRoutes() {
  const rows = checkResult(await getSupabase()
    .from("routes")
    .select("id, name, route_stops(position, stops(name))")
    .order("name"));

  // A bus needs at least two stops to travel between.
  return rows.map(toRoute).filter(route => route.stops.length >= 2);
}

// Bus positions shared by drivers in the last minute, by route id. The
// live_bus_locations view (supabase/schema.sql) leaves out older ones, so
// the database's clock decides what is live, not the visitor's.
export async function loadLiveBusLocations() {
  const rows = checkResult(await getSupabase()
    .from("live_bus_locations")
    .select("route_id, lat, lng, direction, updated_at"));
  return new Map(rows.map(row => [row.route_id, {
    latLng: [row.lat, row.lng],
    direction: row.direction,
    updatedAt: row.updated_at
  }]));
}

// The route the logged-in driver drives, or null for anyone who is not a
// driver. Administrators can see every driver's row, so ask for our own.
export async function loadMyRoute() {
  const session = await getSession();
  if (!session) return null;
  const row = checkResult(await getSupabase()
    .from("drivers")
    .select("routes(id, name, route_stops(position, stops(name)))")
    .eq("user_id", session.user.id)
    .maybeSingle());
  if (!row || !row.routes) return null;
  const route = toRoute(row.routes);
  return route.stops.length >= 2 ? route : null;
}

// share_bus_location() works out the driver's route itself and stamps the
// time, so a driver can only move their own bus.
export async function shareBusLocation(lat, lng, direction) {
  checkResult(await getSupabase().rpc("share_bus_location", { p_lat: lat, p_lng: lng, p_direction: direction }));
}

export async function stopSharingLocation() {
  checkResult(await getSupabase().rpc("stop_sharing_location"));
}

// save_route (supabase/schema.sql) saves the name and stops together, so
// the route is left unchanged if any part of the save fails.
export async function saveRoute(routeId, name, stopNames) {
  checkResult(await getSupabase().rpc("save_route", {
    target_route_id: routeId,
    route_name: name,
    stop_names: stopNames
  }));
}

export async function deleteRoute(routeId) {
  checkChanged(await getSupabase().from("routes").delete().eq("id", routeId).select("id"));
}

export async function loadAlerts() {
  const rows = checkResult(await getSupabase()
    .from("alerts")
    .select("id, route_id, type, message, delay_minutes, routes(name)")
    .order("created_at", { ascending: false }));

  return rows.map(row => ({
    id: row.id,
    routeId: row.route_id,
    routeName: row.routes ? row.routes.name : "All routes",
    type: row.type,
    message: row.message,
    delayMinutes: row.delay_minutes
  }));
}

export async function saveAlert(routeId, type, message, delayMinutes) {
  checkResult(await getSupabase().from("alerts").insert({
    route_id: routeId || null,
    type,
    message,
    delay_minutes: delayMinutes
  }));
}

export async function deleteAlert(alertId) {
  checkChanged(await getSupabase().from("alerts").delete().eq("id", alertId).select("id"));
}

export async function getSession() {
  const { session } = checkResult(await getSupabase().auth.getSession());
  return session;
}

// The admins table only shows users their own row, so any row means the
// logged-in user is an administrator.
export async function isAdmin() {
  const rows = checkResult(await getSupabase().from("admins").select("user_id"));
  return rows.length > 0;
}

export async function logIn(email, password) {
  checkResult(await getSupabase().auth.signInWithPassword({ email, password }));
}

export async function logOut() {
  const { error } = await getSupabase().auth.signOut();
  if (error) throw new Error(error.message);
}
