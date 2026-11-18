import { demoLogIn, getSession, loadAssignedBuses, loadMyRoute, loadRoutes, logIn, logOut, updateBus } from './data.js';
import { BUS_UPDATE_INTERVAL_MS, busName } from './fleet.js';
import { makeElement } from './dom.js';
import { routeLabel } from './planner.js';
import { isDemoMode } from './supabase.js';

export async function initDriver() {
  const select = document.getElementById('driver-bus'), details = document.getElementById('driver-bus-details');
  const feedback = document.getElementById('driver-feedback'), start = document.getElementById('engine-start'), stop = document.getElementById('engine-stop');
  const delay = document.getElementById('driver-delay');
  let buses = [], routes = [], busy = false, timer, stopRouteSharing = null;
  function message(text, error = false) { feedback.textContent = text; feedback.classList.toggle('error', error); }
  function render() {
    const bus = buses.find(b => b.id === select.value), delayed = bus?.status === 'delayed';
    details.replaceChildren(); start.disabled = !bus || bus.engineOn; stop.disabled = !bus || !bus.engineOn;
    // Riders only see delays on running buses, so the toggle is off while parked.
    delay.disabled = !bus || !bus.engineOn;
    delay.textContent = delayed ? 'Back on time' : 'Delay expected';
    delay.setAttribute('aria-pressed', String(delayed)); delay.classList.toggle('is-delayed', delayed);
    if (!bus) { details.append(makeElement('p', 'empty-state', 'No buses are assigned to this account. Ask an administrator to assign a bus.')); return; }
    details.append(makeElement('h3', '', busName(bus)),
      makeElement('p', '', routeLabel(routes.find(r => r.id === bus.routeId)) || 'Route unavailable'),
      makeElement('p', '', `Engine ${bus.engineOn ? 'on' : 'off'} · ${delayed ? 'Delay expected' : 'On time'} · Next stop: ${bus.nextStop || 'Not available'}`),
      makeElement('p', 'fine-print', `Last update: ${bus.updatedAt ? new Date(bus.updatedAt).toLocaleTimeString() : 'Not available'}`));
  }
  async function refresh() {
    const previous = select.value; buses = await loadAssignedBuses(); select.replaceChildren();
    buses.forEach(bus => { const option = makeElement('option', '', busName(bus)); option.value = bus.id; select.append(option); });
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
        for (const bus of current.filter(b => b.engineOn && !b.autonomousSimulation)) await updateBus(bus.id, 'publish');
        await refresh(); message('Assigned bus locations checked. Simulated buses run automatically.');
      } catch (error) { message(`Location update failed: ${error.message}`, true); }
      finally { busy = false; }
    }, BUS_UPDATE_INTERVAL_MS);
    window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
  }
  async function action(name, newStatus = null) {
    if (busy || !select.value) return; busy = true; start.disabled = stop.disabled = delay.disabled = true;
    try {
      await updateBus(select.value, name, newStatus); await refresh();
      if (name === 'stop') message('Engine stopped. Location publishing paused.');
      else if (name === 'status') message(newStatus === 'delayed' ? "Delay reported. Riders will see 'Delay expected'." : 'Marked back on time.');
      else message('Bus updated.');
    }
    catch (error) { message(error.message, true); render(); }
    finally { busy = false; }
  }
  select.addEventListener('change', render);
  start.addEventListener('click', () => action('start'));
  // Stopping the engine also clears any expected delay.
  stop.addEventListener('click', () => action('stop', 'on_time'));
  delay.addEventListener('click', () => {
    const bus = buses.find(b => b.id === select.value);
    if (bus) action('status', bus.status === 'delayed' ? 'on_time' : 'delayed');
  });
  document.getElementById('driver-sign-out').addEventListener('click', async () => {
    if (busy) return; busy = true;
    try {
      if (stopRouteSharing) await stopRouteSharing();
      // Autonomous simulations retain their saved state after sign-out.
      const session = await getSession();
      if (session && ['admin', 'driver'].includes(session.role)) for (const bus of (await loadAssignedBuses()).filter(b => b.engineOn && !b.preview && !b.autonomousSimulation)) await updateBus(bus.id, 'stop', 'on_time');
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
