import { assignBus, loadAssignments, loadBuses, loadRoutes, loadStops, saveBus, saveStop } from './data.js';
import { makeElement } from './dom.js';
import { validateStop } from './fleet.js';
import { isDemoMode } from './supabase.js';

function field(form, labelText, id, type = 'text') {
  const group = makeElement('div', 'field'), label = makeElement('label', '', labelText);
  label.htmlFor = id;
  const input = document.createElement(type === 'select' ? 'select' : 'input');
  input.id = id; if (type !== 'select') input.type = type;
  input.required = true; group.append(label, input); form.append(group); return input;
}
function panel(title, id) {
  const section = makeElement('section', 'admin-card'); section.id = id;
  section.append(makeElement('h2', '', title));
  const form = makeElement('form', 'route-form'); section.append(form);
  const feedback = makeElement('p', 'admin-message'); feedback.setAttribute('role', 'status'); section.append(feedback);
  document.getElementById('admin-content').append(section); return { section, form, feedback };
}
function submit(form, text) { const button = makeElement('button', 'btn btn-primary', text); button.type = 'submit'; form.append(button); return button; }
function option(select, value, name) { const item = makeElement('option', '', name); item.value = value; select.append(item); }
function validDriver(value) { return !value || (isDemoMode() ? value === 'demo-driver' : /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)); }

export async function initFleetManagement() {
  if (document.getElementById('stop-management')) return;
  const stops = await loadStops();
  let routes = await loadRoutes();
  const stopPanel = panel('Add a bus stop', 'stop-management');
  const name = field(stopPanel.form, 'Stop name', 'new-stop-name'); name.maxLength = 100;
  const lat = field(stopPanel.form, 'Latitude', 'new-stop-lat', 'number'); lat.min = '-90'; lat.max = '90'; lat.step = 'any';
  const lng = field(stopPanel.form, 'Longitude', 'new-stop-lng', 'number'); lng.min = '-180'; lng.max = '180'; lng.step = 'any';
  const stopSave = submit(stopPanel.form, 'Add stop');
  stopPanel.form.addEventListener('submit', async event => {
    event.preventDefault(); const value = validateStop(name.value, lat.value, lng.value, stops);
    if (value.error) { stopPanel.feedback.textContent = value.error; return; }
    stopSave.disabled = true;
    try { await saveStop(value.name, value.lat, value.lng); window.location.reload(); }
    catch (error) { stopPanel.feedback.textContent = error.message; } finally { stopSave.disabled = false; }
  });
  const fleet = panel('Add a bus', 'fleet-management');
  fleet.section.prepend(makeElement('p', 'fine-print', 'Sample buses start parked. Start a bus in the driver console to publish simulated locations.'));
  const label = field(fleet.form, 'Bus label', 'new-bus-label'); label.maxLength = 60;
  const route = field(fleet.form, 'Route', 'new-bus-route', 'select');
  routes.forEach(r => option(route, r.id, r.name));
  const driver = field(fleet.form, 'Driver account ID (optional)', 'new-bus-driver'); driver.required = false;
  driver.placeholder = isDemoMode() ? 'demo-driver' : 'UUID from Supabase Authentication';
  const busSave = submit(fleet.form, 'Add bus');
  const assignment = panel('Assign a driver', 'assignment-management');
  const busSelect = field(assignment.form, 'Bus', 'assign-bus', 'select');
  const driverId = field(assignment.form, 'Driver account ID (leave empty to unassign)', 'assign-driver'); driverId.required = false;
  driverId.placeholder = driver.placeholder;
  const assignSave = submit(assignment.form, 'Save assignment');
  const list = makeElement('ul', 'fleet-list'); assignment.section.append(list);
  async function refresh() {
    const [buses, assignments] = await Promise.all([loadBuses(), loadAssignments()]);
    busSelect.replaceChildren(); list.replaceChildren();
    buses.forEach(b => {
      option(busSelect, b.id, b.label);
      const driver = assignments.find(a => a.busId === b.id)?.driverId || 'Unassigned';
      list.append(makeElement('li', '', `${b.label} · ${routes.find(r => r.id === b.routeId)?.name || 'Unknown route'} · ${b.engineOn ? 'Engine on' : 'Parked'} · Driver: ${driver}`));
    });
    function setDriver() { driverId.value = assignments.find(a => a.busId === busSelect.value)?.driverId || ''; }
    busSelect.onchange = setDriver; setDriver();
    assignSave.disabled = !buses.length;
  }
  fleet.form.addEventListener('submit', async event => {
    event.preventDefault(); if (!validDriver(driver.value.trim())) { fleet.feedback.textContent = 'Enter a valid driver account ID.'; return; }
    busSave.disabled = true;
    try { await saveBus(label.value, route.value, driver.value.trim()); fleet.form.reset(); await refresh(); fleet.feedback.textContent = 'Bus added.'; }
    catch (error) { fleet.feedback.textContent = error.message; } finally { busSave.disabled = false; }
  });
  assignment.form.addEventListener('submit', async event => {
    event.preventDefault(); if (!validDriver(driverId.value.trim())) { assignment.feedback.textContent = 'Enter a valid driver account ID.'; return; }
    assignSave.disabled = true;
    try { await assignBus(busSelect.value, driverId.value.trim()); await refresh(); assignment.feedback.textContent = 'Driver assignment saved.'; }
    catch (error) { assignment.feedback.textContent = error.message; } finally { assignSave.disabled = false; }
  });
  await refresh();
  async function refreshRoutes() {
    try {
      routes = await loadRoutes();
      const selected = route.value; route.replaceChildren();
      routes.forEach(r => option(route, r.id, r.name));
      if (routes.some(r => r.id === selected)) route.value = selected;
      busSave.disabled = !routes.length;
      await refresh();
    } catch (error) { fleet.feedback.textContent = error.message; }
  }
  window.addEventListener('jutc:routes-changed', refreshRoutes);
  window.addEventListener('pagehide', () => window.removeEventListener('jutc:routes-changed', refreshRoutes), { once: true });
}
