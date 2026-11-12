import { assignBus, loadAssignments, loadBuses, loadRoutes, saveBus } from './data.js';
import { makeElement } from './dom.js';
import { busName, validateFleetNumber } from './fleet.js';
import { routeLabel } from './planner.js';
import { isDemoMode } from './supabase.js';

function option(select, value, name) { const item = makeElement('option', '', name); item.value = value; select.append(item); }

// Wires up the "Buses and drivers" forms in admin.html.
export async function initFleetManagement() {
  const $ = id => document.getElementById(id);
  if ($('fleet-management').dataset.ready) return;
  $('fleet-management').dataset.ready = 'true';
  const fleetForm = $('fleet-form'), fleetFeedback = $('fleet-feedback'), assignForm = $('assignment-form'), assignFeedback = $('assignment-feedback');
  const label = $('new-bus-label'), route = $('new-bus-route'), driver = $('new-bus-driver');
  const busSelect = $('assign-bus'), assignedDriver = $('assign-driver'), list = $('fleet-list');
  const busSave = fleetForm.querySelector('[type="submit"]'), assignSave = assignForm.querySelector('[type="submit"]');
  driver.placeholder = assignedDriver.placeholder = isDemoMode() ? 'Demo Driver or driver@jutc.example.invalid' : 'Full name or email address';
  let routes = await loadRoutes(), buses = [];
  routes.forEach(r => option(route, r.id, routeLabel(r)));
  async function refresh() {
    let assignments;
    [buses, assignments] = await Promise.all([loadBuses(), loadAssignments()]);
    busSelect.replaceChildren(); list.replaceChildren();
    buses.forEach(b => {
      option(busSelect, b.id, busName(b));
      const assigned = assignments.find(a => a.busId === b.id);
      const driver = assigned ? assigned.driverName || assigned.driverEmail || 'Driver' : 'Unassigned';
      list.append(makeElement('li', '', `${busName(b)} · ${routeLabel(routes.find(r => r.id === b.routeId)) || 'Unknown route'} · ${b.engineOn ? 'Engine on' : 'Parked'} · Driver: ${driver}`));
    });
    function setDriver() { const assigned = assignments.find(a => a.busId === busSelect.value); assignedDriver.value = assigned?.driverEmail || assigned?.driverName || ''; }
    busSelect.onchange = setDriver; setDriver();
    assignSave.disabled = !buses.length;
  }
  fleetForm.addEventListener('submit', async event => {
    event.preventDefault();
    const fleetNumber = validateFleetNumber(label.value, buses);
    if (fleetNumber.error) { fleetFeedback.textContent = fleetNumber.error; label.focus(); return; }
    busSave.disabled = true;
    try { await saveBus(fleetNumber.number, route.value, driver.value.trim()); fleetForm.reset(); await refresh(); fleetFeedback.textContent = 'Bus added.'; }
    catch (error) { fleetFeedback.textContent = error.message; } finally { busSave.disabled = false; }
  });
  assignForm.addEventListener('submit', async event => {
    event.preventDefault();
    assignSave.disabled = true;
    try { await assignBus(busSelect.value, assignedDriver.value.trim()); await refresh(); assignFeedback.textContent = 'Driver assignment saved.'; }
    catch (error) { assignFeedback.textContent = error.message; } finally { assignSave.disabled = false; }
  });
  await refresh();
  async function refreshRoutes() {
    try {
      routes = await loadRoutes();
      const selected = route.value; route.replaceChildren();
      routes.forEach(r => option(route, r.id, routeLabel(r)));
      if (routes.some(r => r.id === selected)) route.value = selected;
      busSave.disabled = !routes.length;
      await refresh();
    } catch (error) { fleetFeedback.textContent = error.message; }
  }
  window.addEventListener('jutc:routes-changed', refreshRoutes);
  window.addEventListener('pagehide', () => window.removeEventListener('jutc:routes-changed', refreshRoutes), { once: true });
}
