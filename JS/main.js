import { isDemoMode } from './supabase.js';

function showAppError(error) {
  const notice = document.getElementById("app-error");
  if (!notice) return;
  notice.hidden = false;
  notice.textContent = "The bus information could not be loaded. " + error.message;
}

const notice = document.createElement('p');
notice.className = 'prototype-notice';
notice.textContent = isDemoMode()
  ? 'Local demo · Data is saved only in this browser.'
  : 'Academic demo · Not official JUTC service information.';
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
    // Ends the loading shimmer on empty lists (see style.css).
    document.documentElement.dataset.jutcReady = 'true';
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializePage, { once: true });
else await initializePage();
