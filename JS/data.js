import { getSupabase, isDemoMode } from './supabase.js';
import { createDemoStore } from './demo-store.js';
import { loginEmail } from './login.js';

export const ALERT_TYPES = { delay: 'Delay', route_change: 'Route change', disruption: 'Service disruption' };
let demo;
function local() {
  if (!demo) demo = createDemoStore({ storage: window.localStorage, sessionStorage: window.sessionStorage });
  return demo;
}
function checked({ data, error }) {
  if (error) {
    if (['PGRST205', 'PGRST202', '42P01', '42883'].includes(error.code)) throw new Error('The database setup is incomplete. Ask the project administrator to check the tables and functions defined in supabase/schema.sql.');
    throw new Error(error.message);
  }
  return data;
}
function changed(result) { const rows = checked(result); if (!rows?.length) throw new Error('The change was not saved. Check your account permissions and try again.'); }
export function busFromRow(input) {
  if (Array.isArray(input) && input.length !== 1) throw new Error('Expected one saved bus record.');
  const row = Array.isArray(input) ? input[0] : input;
  if (!row?.id || !Number.isFinite(row.lat) || !Number.isFinite(row.lng)) throw new Error('The bus response did not contain a valid saved location.');
  return { id: row.id, label: row.label, routeId: row.route_id, engineOn: row.engine_on,
    status: row.status, startedAt: row.started_at, progressSeconds: row.progress_seconds,
    locationProgressSeconds: row.location_progress_seconds, lat: row.lat, lng: row.lng,
    nextStop: row.next_stop, updatedAt: row.location_updated_at };
}
export async function loadStops() {
  if (isDemoMode()) return local().loadStops();
  return checked(await getSupabase().from('stops').select('id,name,lat,lng').order('name'));
}
export async function loadRoutes() {
  if (isDemoMode()) return local().loadRoutes();
  return checked(await getSupabase().from('routes').select('id,name,route_stops(position,stops(name))').order('name'))
    .map(row => ({ id: row.id, name: row.name, stops: [...row.route_stops].sort((a, b) => a.position - b.position).map(s => s.stops.name) })).filter(r => r.stops.length >= 2);
}
export async function saveRoute(routeId, name, stops) {
  if (isDemoMode()) return local().saveRoute(routeId, name, stops);
  return checked(await getSupabase().rpc('jutc_save_route', { p_route_id: routeId || null, p_name: name.trim(), p_stops: stops }));
}
export async function deleteRoute(id) {
  if (isDemoMode()) return local().deleteRoute(id);
  changed(await getSupabase().from('routes').delete().eq('id', id).select('id'));
}
export async function loadAlerts() {
  if (isDemoMode()) return local().loadAlerts();
  return checked(await getSupabase().from('alerts').select('id,route_id,type,message,delay_minutes,routes(name)').order('created_at', { ascending: false }))
    .map(row => ({ id: row.id, routeId: row.route_id, routeName: row.routes?.name || 'All routes', type: row.type, message: row.message, delayMinutes: row.delay_minutes }));
}
export async function saveAlert(routeId, type, message, delayMinutes) {
  if (isDemoMode()) return local().saveAlert(routeId, type, message, delayMinutes);
  checked(await getSupabase().from('alerts').insert({ route_id: routeId || null, type, message, delay_minutes: delayMinutes }));
}
export async function deleteAlert(id) {
  if (isDemoMode()) return local().deleteAlert(id);
  changed(await getSupabase().from('alerts').delete().eq('id', id).select('id'));
}
export async function getSession() {
  if (isDemoMode()) return local().getSession();
  const session = checked(await getSupabase().auth.getSession()).session;
  if (!session) return null;
  const role = checked(await getSupabase().from('user_roles').select('role').eq('user_id', session.user.id).maybeSingle());
  return { ...session, role: role?.role || 'unassigned' };
}
export async function logIn(email, password) {
  if (isDemoMode()) throw new Error('Use the labelled demo access buttons.');
  checked(await getSupabase().auth.signInWithPassword({ email: loginEmail(email), password }));
}
export async function logOut() {
  if (isDemoMode()) return local().signOut();
  checked(await getSupabase().auth.signOut());
}
export function demoLogIn(role) {
  if (!isDemoMode()) throw new Error('Demo access is disabled when using Supabase.');
  return local().signIn(role);
}
export async function loadBuses() {
  if (isDemoMode()) return local().loadBuses();
  return checked(await getSupabase().from('buses').select('*').order('label')).map(busFromRow);
}
export async function loadAssignedBuses() {
  if (isDemoMode()) return local().loadAssignedBuses();
  const session = await getSession(); if (!session || !['admin', 'driver'].includes(session.role)) throw new Error('A driver or administrator account is required.');
  if (session.role === 'admin') return loadBuses();
  const assignments = checked(await getSupabase().from('bus_assignments').select('bus_id').eq('driver_id', session.user.id));
  const buses = await loadBuses(); return buses.filter(b => assignments.some(a => a.bus_id === b.id));
}
export async function saveStop(name, lat, lng) {
  if (isDemoMode()) return local().saveStop(name, lat, lng);
  checked(await getSupabase().from('stops').insert({ name, lat, lng }));
}
export async function saveBus(label, routeId, driverId) {
  if (isDemoMode()) return local().saveBus(label, routeId, driverId);
  checked(await getSupabase().rpc('create_bus', { p_label: label.trim(), p_route_id: routeId, p_driver_id: driverId || null }));
}
export async function loadAssignments() {
  if (isDemoMode()) return local().loadAssignments();
  return checked(await getSupabase().from('bus_assignments').select('bus_id,driver_id')).map(a => ({ busId: a.bus_id, driverId: a.driver_id }));
}
export async function assignBus(busId, driverId) {
  if (isDemoMode()) return local().assignBus(busId, driverId);
  checked(await getSupabase().rpc('assign_bus', { p_bus_id: busId, p_driver_id: driverId || null }));
}
export async function updateBus(busId, action, status = null) {
  if (isDemoMode()) return local().updateBus(busId, action, status);
  return busFromRow(checked(await getSupabase().rpc('driver_update_bus', { p_bus_id: busId, p_action: action, p_status: status })));
}
