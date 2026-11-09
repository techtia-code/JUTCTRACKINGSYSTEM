import { isDemoMode } from './supabase.js';

function showAppError(error) {
  const notice = document.getElementById("app-error");
  if (!notice) return;
  notice.hidden = false;
  notice.textContent = "The bus information could not be loaded. " + error.message;
}

if (document.getElementById('loading-root')) {
  import('./loading-ui.jsx').then(({ mountLoadingSkeleton }) => {
    if (document.documentElement.dataset.jutcReady !== 'true') mountLoadingSkeleton(document.body.dataset.page);
  }).catch(error => console.error('Could not load the loading indicator', error));
}

const notice = document.createElement('p');
notice.className = 'prototype-notice';
notice.textContent = isDemoMode()
  ? 'Local demonstration · Sample data is saved only in this browser. Demo roles are not real accounts.'
  : 'Academic demonstration · Buses show saved simulation data or a driver-shared location, as labelled. Estimates are not official JUTC service information.';
document.querySelector('.site-header')?.after(notice);

async function initializePage() {
  try {
    if (document.body.dataset.page === 'home') await (await import('./home.js')).initHome();
    if (document.body.dataset.page === 'admin') await (await import('./admin.js')).initAdmin();
    if (document.body.dataset.page === 'driver') await (await import('./driver.js')).initDriver();
  } catch (error) {
    console.error("Could not initialize the JUTC bus tracker demonstration.", error);
    showAppError(error);
  } finally {
    document.documentElement.dataset.jutcReady = 'true';
    window.dispatchEvent(new window.Event('jutc:ready'));
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializePage, { once: true });
else await initializePage();
