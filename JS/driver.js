import { demoLogIn, getSession, loadAssignedBuses, loadMyRoute, loadRoutes, logIn, logOut, updateBus } from './data.js';
import { BUS_UPDATE_INTERVAL_MS } from './fleet.js';
import { makeElement } from './dom.js';
import { isDemoMode } from './supabase.js';

export async function initDriver() {
  const select = document.getElementById('driver-bus'), details = document.getElementById('driver-bus-details');
  const feedback = document.getElementById('driver-feedback'), start = document.getElementById('engine-start'), stop = document.getElementById('engine-stop');
  const saveStatus = document.getElementById('driver-save-status'), status = document.getElementById('driver-status');
  let buses = [], routes = [], busy = false, timer, stopRouteSharing = null;
  function message(text, error = false) { feedback.textContent = text; feedback.classList.toggle('error', error); }
  function render() {
    const bus = buses.find(b => b.id === select.value);
    details.replaceChildren(); start.disabled = !bus || bus.engineOn; stop.disabled = !bus || !bus.engineOn; saveStatus.disabled = !bus;
    if (!bus) { details.append(makeElement('p', 'empty-state', 'No buses are assigned to this account. Ask an administrator to assign a bus.')); return; }
    status.value = bus.status;
    details.append(makeElement('h3', '', bus.label),
      makeElement('p', '', routes.find(r => r.id === bus.routeId)?.name || 'Route unavailable'),
      makeElement('p', '', `Engine ${bus.engineOn ? 'on' : 'off'} · ${bus.status === 'delayed' ? 'Delayed' : 'On time'}`),
      makeElement('p', '', `Saved position: ${bus.lat.toFixed(5)}, ${bus.lng.toFixed(5)} · Next stop: ${bus.nextStop || 'Not available'}`),
      makeElement('p', 'fine-print', `Last location update: ${bus.updatedAt ? new Date(bus.updatedAt).toLocaleTimeString() : 'Not available'}`));
  }
  async function refresh() {
    const previous = select.value; buses = await loadAssignedBuses(); select.replaceChildren();
    buses.forEach(bus => { const option = makeElement('option', '', bus.label); option.value = bus.id; select.append(option); });
    if (buses.some(b => b.id === previous)) select.value = previous;
    render();
  }
  async function showConsole() {
    const session = await getSession();
    if (!session || !['driver', 'admin'].includes(session.role)) throw new Error('This account needs a driver or administrator role. Ask the project owner to assign it.');
    routes = await loadRoutes(); await refresh();
    const sharedRoute = await loadMyRoute();
    if (sharedRoute && !stopRouteSharing) stopRouteSharing = await (await import('./route-sharing.js')).initRouteSharing(sharedRoute);
    document.getElementById('driver-login').hidden = true; document.getElementById('driver-console').hidden = Boolean(sharedRoute && !buses.length);
    document.getElementById('driver-sign-out').hidden = false;
    clearInterval(timer);
    timer = setInterval(async () => {
      if (busy) return; busy = true;
      try { const current = await loadAssignedBuses();
        for (const bus of current.filter(b => b.engineOn)) await updateBus(bus.id, 'publish');
        await refresh(); message('Assigned bus locations checked.');
      } catch (error) { message(`Location update failed: ${error.message}`, true); }
      finally { busy = false; }
    }, BUS_UPDATE_INTERVAL_MS);
    window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
  }
  async function action(name, newStatus = null) {
    if (busy || !select.value) return; busy = true; start.disabled = stop.disabled = saveStatus.disabled = true;
    try { await updateBus(select.value, name, newStatus); await refresh(); message(name === 'stop' ? 'Engine stopped. Location publishing paused.' : 'Bus updated.'); }
    catch (error) { message(error.message, true); render(); }
    finally { busy = false; }
  }
  select.addEventListener('change', render);
  start.addEventListener('click', () => action('start'));
  stop.addEventListener('click', () => action('stop'));
  saveStatus.addEventListener('click', () => action('status', status.value));
  document.getElementById('driver-sign-out').addEventListener('click', async () => {
    if (busy) return; busy = true;
    try {
      if (stopRouteSharing) await stopRouteSharing();
      // Stop owned running buses before ending the session so they do not appear to keep moving.
      const session = await getSession();
      if (session && ['admin', 'driver'].includes(session.role)) for (const bus of (await loadAssignedBuses()).filter(b => b.engineOn && !b.preview)) await updateBus(bus.id, 'stop');
      await logOut(); clearInterval(timer); window.location.reload();
    } catch (error) { message(error.message, true); } finally { busy = false; }
  });
  const form = document.getElementById('driver-login-form');
  form.addEventListener('submit', async event => {
    event.preventDefault(); const button = form.querySelector('button'); button.disabled = true;
    try { await logIn(document.getElementById('driver-email').value.trim(), document.getElementById('driver-password').value); await showConsole(); message('Signed in.'); }
    catch (error) { message(error.message, true); } finally { button.disabled = false; }
  });
  if (isDemoMode()) {
    form.hidden = true; const button = document.getElementById('driver-demo-login'); button.hidden = false;
    button.addEventListener('click', async () => { try { demoLogIn('driver'); await showConsole(); } catch (error) { message(error.message, true); } });
  }
  if (await getSession()) {
    document.getElementById('driver-sign-out').hidden = false;
    try { await showConsole(); } catch (error) { message(error.message, true); }
  }
  return () => clearInterval(timer);
}
