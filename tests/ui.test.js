import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

test('passenger, admin and driver pages complete the local demonstration workflows', async () => {
  process.env.VITE_DEMO_MODE = 'true';
  const server = await createServer({ server: { middlewareMode: true }, mode: 'test' });
  const intervals = new Map(); let intervalId = 0;
  const originalInterval = globalThis.setInterval, originalClear = globalThis.clearInterval;
  globalThis.setInterval = (callback, ms) => { intervals.set(++intervalId, { callback, ms }); return intervalId; };
  globalThis.clearInterval = id => intervals.delete(id);
  let dom;
  function loadDOM(html) {
    dom?.window.dispatchEvent(new dom.window.Event('pagehide')); dom?.window.close();
    dom = new JSDOM(html, { url: 'http://localhost:5173' });
    globalThis.window = dom.window; globalThis.document = dom.window.document;
  }
  async function settle() { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); }
  try {
    loadDOM(await readFile(new URL('../index.html', import.meta.url), 'utf8'));
    const { initHome } = await server.ssrLoadModule('/JS/home.js');
    await initHome({ loadMap: async () => ({ initMap: () => ({ update() {} }) }) });
    assert.equal(document.querySelectorAll('.route-card').length, 4);
    assert.ok(document.getElementById('eta-bus').options.length > 0);
    document.getElementById('start-stop').value = 'Cross Roads'; document.getElementById('end-stop').value = 'Papine';
    document.getElementById('route-search-form').dispatchEvent(new window.Event('submit', { cancelable: true }));
    assert.match(document.getElementById('search-results').textContent, /Papine/);
    document.getElementById('watch-bus').click(); assert.equal(document.getElementById('stop-watch').hidden, false);
    document.getElementById('stop-watch').click(); assert.equal(document.getElementById('stop-watch').hidden, true);
    document.getElementById('enable-notifications').click(); await settle();
    assert.match(document.getElementById('notification-message').textContent, /unsupported/);
    const data = await server.ssrLoadModule('/JS/data.js');
    data.demoLogIn('driver');
    loadDOM(await readFile(new URL('../driver.html', import.meta.url), 'utf8'));
    const { initDriver } = await server.ssrLoadModule('/JS/driver.js');
    await initDriver();
    assert.equal(document.getElementById('driver-console').hidden, false);
    const { initRouteSharing } = await server.ssrLoadModule('/JS/route-sharing.js');
    let finishPublish, sharingVisible = false, sharingStopped = false;
    const routeForSharing = (await data.loadRoutes())[0];
    await initRouteSharing(routeForSharing, {
      loadStops: data.loadStops,
      fetchRoadLegs: async () => null,
      shareBusLocation: async () => { await new Promise(resolve => { finishPublish = resolve; }); sharingVisible = true; },
      stopSharingLocation: async () => { sharingVisible = false; sharingStopped = true; }
    });
    document.getElementById('simulate-drive').click(); await settle();
    document.getElementById('stop-sharing').click(); await settle();
    finishPublish(); await settle();
    assert.equal(sharingStopped, true);
    assert.equal(sharingVisible, false, 'stopping must delete after the last in-flight publish');
    assert.doesNotMatch(document.getElementById('driver-message').textContent, /Cannot read|could not/i);
    document.getElementById('engine-stop').click(); await settle();
    assert.equal((await data.loadAssignedBuses())[0].engineOn, false);
    document.getElementById('engine-start').click(); await settle();
    assert.equal((await data.loadAssignedBuses())[0].engineOn, true);
    document.getElementById('driver-status').value = 'delayed'; document.getElementById('driver-save-status').click(); await settle();
    assert.equal((await data.loadAssignedBuses())[0].status, 'delayed');
    data.demoLogIn('admin');
    loadDOM(await readFile(new URL('../admin.html', import.meta.url), 'utf8'));
    const { initAdmin } = await server.ssrLoadModule('/JS/admin.js'); await initAdmin();
    assert.equal(document.getElementById('admin-content').hidden, false);
    assert.ok(document.getElementById('stop-form'), 'the incoming stop editor is present alongside fleet management');
    document.getElementById('stop-name').value = 'Merge Test Stop';
    document.getElementById('stop-lat').value = '18.025';
    document.getElementById('stop-lng').value = '-76.81';
    document.getElementById('stop-form').dispatchEvent(new window.Event('submit', { cancelable: true })); await settle();
    assert.ok((await data.loadStops()).some(s => s.name === 'Merge Test Stop'));
    const addedStopCard = [...document.querySelectorAll('#admin-stops article')].find(card => card.textContent.includes('Merge Test Stop'));
    addedStopCard.querySelector('button[title="Edit stop"]').click();
    document.getElementById('stop-name').value = 'Renamed Merge Stop';
    document.getElementById('stop-form').dispatchEvent(new window.Event('submit', { cancelable: true })); await settle();
    assert.ok((await data.loadStops()).some(s => s.name === 'Renamed Merge Stop'));
    document.getElementById('route-name').value = 'UI newly created route';
    document.getElementById('route-stops').value = 'Cross Roads, Papine';
    document.getElementById('route-form').dispatchEvent(new window.Event('submit', { cancelable: true })); await settle();
    assert.ok([...document.getElementById('new-bus-route').options].some(option => option.textContent === 'UI newly created route'), 'fleet controls must immediately include a newly saved route');
    document.getElementById('new-bus-label').value = 'UI-TEST-BUS';
    document.getElementById('new-bus-driver').value = 'demo-driver';
    document.getElementById('new-bus-label').closest('form').dispatchEvent(new window.Event('submit', { cancelable: true })); await settle();
    assert.ok((await data.loadBuses()).some(bus => bus.label === 'UI-TEST-BUS'));
    assert.ok([...intervals.values()].every(timer => timer.ms === 5000 || timer.ms === 30000));
    data.demoLogIn('driver');
    loadDOM(await readFile(new URL('../admin.html', import.meta.url), 'utf8')); await initAdmin();
    assert.equal(document.getElementById('admin-content').hidden, true);
    assert.match(document.getElementById('login-message').textContent, /administrator role/);
    loadDOM(await readFile(new URL('../driver.html', import.meta.url), 'utf8'));
    await assert.doesNotReject(server.ssrLoadModule('/JS/main.js'), 'the driver entry point must work without a loading skeleton container');
    data.demoLogIn('admin');
    loadDOM(await readFile(new URL('../index.html', import.meta.url), 'utf8'));
    await initHome({ loadMap: async () => ({ initMap: () => ({ update() {} }) }) });
    document.getElementById('watch-bus').click();
    const watchedRoute = document.getElementById('eta-route').value;
    await data.deleteRoute(watchedRoute);
    const fleetRefresh = [...intervals.values()].find(timer => timer.ms === 5000);
    await fleetRefresh.callback();
    assert.equal(document.getElementById('stop-watch').hidden, true, 'a removed watched route must cancel the watch instead of switching to another bus');
    assert.equal(document.getElementById('bus-notifications').textContent, '');
    for (const route of await data.loadRoutes()) await data.deleteRoute(route.id);
    await fleetRefresh.callback();
    assert.equal(document.getElementById('bus-notifications').textContent, '');
  } finally {
    dom?.window.dispatchEvent(new dom.window.Event('pagehide')); dom?.window.close();
    globalThis.setInterval = originalInterval; globalThis.clearInterval = originalClear;
    delete globalThis.window; delete globalThis.document; delete process.env.VITE_DEMO_MODE;
    await server.close();
  }
});
