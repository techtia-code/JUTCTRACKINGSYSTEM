import { makeElement, makeIcon } from './dom.js';
import { arrivalsAtStop, busHeading, busName, getBusAlerts } from './fleet.js';
import { routeLabel } from './planner.js';
import { getDelayMinutes, getDistanceMetres } from './simulation.js';

// The "Estimated arrivals" board on the home page. The rider picks a route
// and a stop; every bus on that route is listed with its estimate, soonest
// first. A bell on a running bus watches it: an alert when it is within 1 km
// of the stop or delayed. Only one bus is watched at a time.
export function initArrivals() {
  const routeSelect = document.getElementById('eta-route');
  const stopSelect = document.getElementById('eta-stop');
  const board = document.getElementById('eta-results');
  const banner = document.getElementById('watch-banner');
  const bannerText = document.getElementById('watch-text');
  const stopButton = document.getElementById('stop-watch');
  const notificationList = document.getElementById('bus-notifications');
  const notificationMessage = document.getElementById('notification-message');

  let routes = [], buses = [], coordinates = {}, alerts = [], routesKey = null;
  let watch = null; // { busId, routeId, stop }
  let shownAlerts = '';
  const delivered = new Set();
  const rows = new Map(); // bus id -> row elements, kept so refreshes update text in place
  const emptyRow = makeElement('li', 'arrival-empty empty-state');

  function setText(element, text) {
    // Only change text that changed, so screen readers are not flooded every refresh.
    if (element.textContent !== text) element.textContent = text;
  }

  const currentRoute = () => routes.find(route => route.id === routeSelect.value);

  function populateRoutes() {
    const selected = routeSelect.value;
    routeSelect.replaceChildren();
    routes.forEach(route => {
      const option = makeElement('option', '', routeLabel(route));
      option.value = route.id;
      routeSelect.append(option);
    });
    if (!routes.length) {
      const option = makeElement('option', '', 'No routes available');
      option.value = '';
      routeSelect.append(option);
    }
    routeSelect.disabled = !routes.length;
    if (routes.some(route => route.id === selected)) routeSelect.value = selected;
  }

  function populateStops(preferredStop = null) {
    const route = currentRoute();
    stopSelect.replaceChildren();
    if (!route) {
      stopSelect.append(makeElement('option', '', 'No stops available'));
      stopSelect.disabled = true;
      return;
    }
    stopSelect.disabled = false;
    route.stops.forEach(stop => {
      const option = makeElement('option', '', stop);
      option.value = stop;
      stopSelect.append(option);
    });
    if (route.stops.includes(preferredStop)) stopSelect.value = preferredStop;
  }

  function makeRow(busId) {
    const item = makeElement('li', 'arrival-row');
    const badge = makeElement('span', 'route-badge');
    const info = makeElement('div', 'arrival-info');
    const name = makeElement('strong', 'arrival-bus');
    const heading = makeElement('span', 'arrival-heading');
    const detail = makeElement('span', 'arrival-detail');
    const time = makeElement('span', 'eta-time');
    const bell = makeElement('button', 'notify-button');
    bell.type = 'button';
    bell.append(makeIcon('bell'));
    bell.addEventListener('click', () => toggleWatch(busId));
    info.append(name, heading, detail);
    item.append(badge, info, time, bell);
    const row = { item, badge, name, heading, detail, time, bell };
    rows.set(busId, row);
    return row;
  }

  function describe(bus, state, delay, turnsAt) {
    if (state === 'parked') return 'Parked · no estimate';
    if (state === 'stale') return 'Location updates paused';
    const parts = [];
    if (bus.source === 'driver') parts.push('Live driver location');
    if (turnsAt) parts.push(`Turns round at ${turnsAt} first`);
    else if (bus.nextStop) parts.push('Next stop: ' + bus.nextStop);
    if (state === 'delayed') parts.push('Driver reports a delay');
    if (delay > 0) parts.push(`Includes ${delay} min delay`);
    return parts.join(' · ') || 'On the route';
  }

  function updateRow(row, { bus, state, minutes, heading }, route, stop, delay) {
    const watched = watch?.busId === bus.id;
    setText(row.badge, route.number || '');
    row.badge.hidden = !route.number;
    setText(row.name, busName(bus));
    // The way the bus will be going at this stop, which can differ from its
    // current direction if it has to turn round at the end of the route first.
    setText(row.heading, heading ? `To ${heading}` : '');
    row.heading.hidden = !heading;
    // A bus heading away reaches the stop only after turning round at the end of the route.
    const goingNow = heading && busHeading(bus, route, coordinates);
    setText(row.detail, describe(bus, state, delay, goingNow !== heading && goingNow !== stop ? goingNow : null));
    setText(row.time, minutes === null ? '—' : minutes < 1 ? 'Arriving' : `${minutes} min`);
    row.item.classList.toggle('is-inactive', minutes === null);
    row.item.classList.toggle('is-watched', watched);
    // No estimate means nothing to watch for.
    row.bell.hidden = minutes === null;
    row.bell.setAttribute('aria-pressed', String(watched));
    const label = watched ? `Stop alerts for ${busName(bus)}` : `Notify me when ${busName(bus)} is near ${stop}`;
    if (row.bell.title !== label) { row.bell.title = label; row.bell.setAttribute('aria-label', label); }
  }

  function render() {
    const route = currentRoute(), stop = stopSelect.value;
    if (!route || !stop) {
      rows.clear();
      setText(emptyRow, 'Choose a route and stop to see arrival estimates.');
      board.replaceChildren(emptyRow);
      updateBanner();
      return;
    }
    const delay = getDelayMinutes(alerts, route.id);
    const arrivals = arrivalsAtStop(buses, route, coordinates, stop, delay);
    const ids = new Set(arrivals.map(({ bus }) => bus.id));
    for (const [id, row] of rows) if (!ids.has(id)) { row.item.remove(); rows.delete(id); }
    if (!arrivals.length) {
      setText(emptyRow, 'No buses are running on this route right now.');
      board.replaceChildren(emptyRow);
    } else {
      emptyRow.remove();
      arrivals.forEach((arrival, index) => {
        const row = rows.get(arrival.bus.id) || makeRow(arrival.bus.id);
        updateRow(row, arrival, route, stop, delay);
        if (board.children[index] !== row.item) board.insertBefore(row.item, board.children[index] ?? null);
      });
    }
    updateBanner();
    checkNotifications(route, stop, delay);
  }

  function deviceAlertsOn() {
    return 'Notification' in window && Notification.permission === 'granted';
  }

  function updateBanner() {
    banner.hidden = !watch;
    if (!watch) return;
    const bus = buses.find(b => b.id === watch.busId);
    const route = routes.find(r => r.id === watch.routeId);
    const who = (bus ? busName(bus) : 'your bus') + (route?.number ? ` (Route ${route.number})` : '');
    setText(bannerText, `Watching ${who} for ${watch.stop}. You'll get an alert when it is within 1 km or delayed. ` +
      (deviceAlertsOn() ? 'Keep this page open.' : 'Alerts will show on this page while it stays open.'));
  }

  function clearWatch(reason = '') {
    watch = null;
    delivered.clear();
    shownAlerts = '';
    notificationList.replaceChildren();
    setText(notificationMessage, reason);
    updateBanner();
  }

  // Asks for device notifications on the first bell tap, so there is no
  // separate permission button. Without permission, alerts stay in the page.
  function requestDeviceAlerts() {
    if (!('Notification' in window) || Notification.permission !== 'default') return Promise.resolve();
    try { return Promise.resolve(Notification.requestPermission()).catch(() => {}); }
    catch { return Promise.resolve(); }
  }

  function toggleWatch(busId) {
    if (watch?.busId === busId) { clearWatch('Bus alerts stopped.'); render(); return; }
    if (!buses.some(bus => bus.id === busId)) return;
    const permission = requestDeviceAlerts();
    clearWatch();
    watch = { busId, routeId: routeSelect.value, stop: stopSelect.value };
    render();
    permission.then(updateBanner);
  }

  function checkNotifications(route, stop, delay) {
    if (!watch || watch.routeId !== route.id || watch.stop !== stop) return;
    const bus = buses.find(b => b.id === watch.busId);
    if (!bus) return;
    const delayed = delay > 0 || alerts.some(a => a.type === 'delay' && (a.routeId === route.id || a.routeId === null));
    const coordinate = coordinates[stop];
    const distance = coordinate ? getDistanceMetres([bus.lat, bus.lng], coordinate) : Infinity;
    const active = getBusAlerts(bus, distance, delayed);
    const keys = active.map(alert => `${bus.id}:${stop}:${alert.type}`);
    for (const key of delivered) if (!keys.includes(key)) delivered.delete(key);
    // Rebuild the live region only when the alerts change.
    const signature = active.map(alert => alert.message).join('\n');
    if (signature !== shownAlerts) {
      shownAlerts = signature;
      notificationList.replaceChildren(...active.map(alert => makeElement('p', 'eta-notice is-alert', alert.message)));
    }
    active.forEach((alert, index) => {
      const key = keys[index];
      if (delivered.has(key)) return;
      delivered.add(key);
      if (deviceAlertsOn()) {
        try { new Notification('JUTC Bus Tracker', { body: alert.message, tag: key }); }
        catch { setText(notificationMessage, 'Device notifications are unavailable here. Alerts are shown on this page.'); }
      }
    });
  }

  routeSelect.addEventListener('change', () => { clearWatch(); populateStops(); render(); });
  stopSelect.addEventListener('change', () => { clearWatch(); render(); });
  stopButton.addEventListener('click', () => { clearWatch('Bus alerts stopped.'); render(); });

  return {
    get routeId() { return routeSelect.value; },
    get stop() { return stopSelect.value; },

    // Called after every fleet or alert refresh.
    setData(next) {
      ({ routes, buses, coordinates, alerts } = next);
      const key = JSON.stringify(routes);
      if (key !== routesKey) {
        routesKey = key;
        const stop = stopSelect.value;
        populateRoutes();
        populateStops(stop);
      }
      if (watch && (!buses.some(bus => bus.id === watch.busId && bus.routeId === watch.routeId) ||
        !routes.some(route => route.id === watch.routeId && route.stops.includes(watch.stop)))) {
        clearWatch('The bus you were watching is no longer available. Choose another bus.');
      }
      render();
    },

    // Shows a route chosen elsewhere on the page, e.g. from a journey search.
    select(routeId, preferredStop = null) {
      const route = routes.find(r => r.id === routeId);
      if (!route) return;
      const stop = route.stops.includes(preferredStop) ? preferredStop
        : routeSelect.value === routeId ? stopSelect.value : route.stops[0];
      if (routeSelect.value !== routeId || stopSelect.value !== stop) clearWatch();
      routeSelect.value = routeId;
      populateStops(stop);
      render();
    }
  };
}
