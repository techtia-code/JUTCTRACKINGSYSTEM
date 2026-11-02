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

export async function loadRoutes() {
  const rows = checkResult(await getSupabase()
    .from("routes")
    .select("id, name, route_stops(position, stops(name))")
    .order("name"));

  const routes = rows.map(row => ({
    id: row.id,
    name: row.name,
    stops: [...row.route_stops]
      .sort((first, second) => first.position - second.position)
      .map(routeStop => routeStop.stops.name)
  }));

  // A bus needs at least two stops to travel between.
  return routes.filter(route => route.stops.length >= 2);
}

async function saveRouteStops(routeId, stopNames, allStops) {
  const rows = stopNames.map((stopName, index) => ({
    route_id: routeId,
    stop_id: allStops.find(stop => stop.name === stopName).id,
    position: index + 1
  }));
  checkResult(await getSupabase().from("route_stops").insert(rows));
}

export async function saveRoute(routeId, name, stopNames, allStops) {
  const supabase = getSupabase();
  if (!routeId) {
    const newRoute = checkResult(await supabase.from("routes").insert({ name }).select("id").single());
    await saveRouteStops(newRoute.id, stopNames, allStops);
    return;
  }

  checkChanged(await supabase.from("routes").update({ name }).eq("id", routeId).select("id"));
  checkChanged(await supabase.from("route_stops").delete().eq("route_id", routeId).select("route_id"));
  await saveRouteStops(routeId, stopNames, allStops);
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

export async function logIn(email, password) {
  checkResult(await getSupabase().auth.signInWithPassword({ email, password }));
}

export async function logOut() {
  const { error } = await getSupabase().auth.signOut();
  if (error) throw new Error(error.message);
}
