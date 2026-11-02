import { initAdmin } from "./admin.js";
import { initHome } from "./home.js";
import { mountLoadingSkeleton } from "./loading-ui.jsx";

function showAppError(error) {
  const notice = document.getElementById("app-error");
  if (!notice) return;
  notice.hidden = false;
  notice.textContent = "The bus information could not be loaded. " + error.message;
}

mountLoadingSkeleton(document.body.dataset.page);

document.addEventListener("DOMContentLoaded", async () => {
  try {
    if (document.body.dataset.page === "home") await initHome();
    if (document.body.dataset.page === "admin") await initAdmin();
  } catch (error) {
    console.error("Could not initialize the JUTC bus tracker demonstration.", error);
    showAppError(error);
  } finally {
    window.dispatchEvent(new Event("jutc:ready"));
  }
});
