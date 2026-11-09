import {
  ALERT_TYPES,
  deleteAlert,
  deleteRoute,
  deleteStop,
  getSession,
  isAdmin,
  loadAlerts,
  loadRoutes,
  loadStops,
  logIn,
  logOut,
  saveAlert,
  saveRoute,
  saveStop
} from "./data.js";
import { demoLogIn } from './data.js';
import { isDemoMode } from './supabase.js';
import { initFleetManagement } from './management.js';
import { makeElement, makeIcon, setHeading, setMessage } from "./dom.js";
import { validateAlert, validateRoute, validateStop } from "./planner.js";

function makeEditButton(label, title) {
  const button = makeElement("button", "admin-icon-button");
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.title = title;
  button.prepend(makeIcon("pencil"));
  return button;
}

function makeDeleteButton(label, title) {
  const button = makeElement("button", "admin-icon-button delete-route-button");
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.title = title;
  button.prepend(makeIcon("trash"));
  return button;
}

async function initManagement() {
  const [allStops, routes, alerts] = await Promise.all([loadStops(), loadRoutes(), loadAlerts()]);
  let currentStops = allStops;
  let validStops = allStops.map(stop => stop.name);
  let currentRoutes = routes;
  let currentAlerts = alerts;
  let editingId = null;
  const form = document.getElementById("route-form");
  const nameInput = document.getElementById("route-name");
  const stopsInput = document.getElementById("route-stops");
  const saveButton = document.getElementById("save-route");
  const cancelButton = document.getElementById("cancel-edit");
  const message = document.getElementById("admin-message");
  const list = document.getElementById("admin-routes");
  const count = document.getElementById("route-count");
  const alertForm = document.getElementById("alert-form");
  const alertType = document.getElementById("alert-type");
  const alertRoute = document.getElementById("alert-route");
  const alertMessage = document.getElementById("alert-message");
  const alertDelay = document.getElementById("alert-delay");
  const alertFeedback = document.getElementById("alert-feedback");
  const alertList = document.getElementById("admin-alerts");
  const stopForm = document.getElementById("stop-form");
  const stopNameInput = document.getElementById("stop-name");
  const stopLatInput = document.getElementById("stop-lat");
  const stopLngInput = document.getElementById("stop-lng");
  const saveStopButton = document.getElementById("save-stop");
  const cancelStopButton = document.getElementById("cancel-stop-edit");
  const stopMessage = document.getElementById("stop-message");
  const stopList = document.getElementById("admin-stops");
  const stopCount = document.getElementById("stop-count");
  let editingStopId = null;

  function refreshStopNames() {
    validStops = currentStops.map(stop => stop.name);
    document.getElementById("available-stops").textContent = validStops.join(", ");
  }

  refreshStopNames();

  Object.entries(ALERT_TYPES).forEach(([value, label]) => {
    const option = makeElement("option", "", label);
    option.value = value;
    alertType.append(option);
  });

  function resetForm() {
    editingId = null;
    form.reset();
    saveButton.replaceChildren(makeIcon("plus"), document.createTextNode(" Add route"));
    cancelButton.hidden = true;
    setHeading(document.getElementById("route-form-heading"), "plus", "Add a sample route");
  }

  function populateAlertRoutes() {
    const allRoutes = makeElement("option", "", "All routes");
    allRoutes.value = "";
    alertRoute.replaceChildren(allRoutes);
    currentRoutes.forEach(route => {
      const option = makeElement("option", "", route.name);
      option.value = route.id;
      alertRoute.append(option);
    });
  }

  function renderAdminRoutes() {
    window.dispatchEvent(new window.Event('jutc:routes-changed'));
    populateAlertRoutes();
    // Each stop shows how many routes use it.
    renderAdminStops();
    list.replaceChildren();
    count.textContent = currentRoutes.length + (currentRoutes.length === 1 ? " route" : " routes");
    if (currentRoutes.length === 0) {
      list.append(makeElement("p", "empty-state", "No sample routes have been added."));
      return;
    }

    currentRoutes.forEach(route => {
      const card = makeElement("article", "admin-route");
      const details = makeElement("div", "admin-route-details");
      details.append(
        makeElement("h3", "", route.name),
        makeElement("p", "muted-copy", route.stops.join(" to "))
      );
      const actions = makeElement("div", "admin-route-actions");
      const editButton = makeElement("button", "admin-icon-button");
      editButton.type = "button";
      editButton.setAttribute("aria-label", "Edit " + route.name);
      editButton.title = "Edit route";
      editButton.prepend(makeIcon("pencil"));
      editButton.addEventListener("click", () => {
        editingId = route.id;
        nameInput.value = route.name;
        stopsInput.value = route.stops.join(", ");
        saveButton.replaceChildren(makeIcon("pencil"), document.createTextNode(" Save changes"));
        cancelButton.hidden = false;
        setHeading(document.getElementById("route-form-heading"), "pencil", "Edit sample route");
        setMessage(message, "Editing " + route.name + ".", false);
        nameInput.focus();
      });

      const deleteButton = makeDeleteButton("Delete " + route.name, "Delete route");
      deleteButton.addEventListener("click", async () => {
        if (!window.confirm("Delete the sample route \"" + route.name + "\"?")) return;
        try {
          await deleteRoute(route.id);
          // Alerts for a deleted route are removed with it.
          [currentRoutes, currentAlerts] = await Promise.all([loadRoutes(), loadAlerts()]);
        } catch (error) {
          console.error("Could not delete the sample route.", error);
          setMessage(message, "The route could not be deleted. " + error.message, true);
          return;
        }
        if (editingId === route.id) resetForm();
        renderAdminRoutes();
        renderAdminAlerts();
        setMessage(message, "Sample route deleted.", false);
      });
      actions.append(editButton, deleteButton);
      card.append(details, actions);
      list.append(card);
    });
  }

  function resetStopForm() {
    editingStopId = null;
    stopForm.reset();
    saveStopButton.replaceChildren(makeIcon("plus"), document.createTextNode(" Add stop"));
    cancelStopButton.hidden = true;
    setHeading(document.getElementById("stop-form-heading"), "plus", "Add a stop");
  }

  function routesUsing(stop) {
    return currentRoutes.filter(route => route.stops.includes(stop.name));
  }

  function renderAdminStops() {
    stopList.replaceChildren();
    stopCount.textContent = currentStops.length + (currentStops.length === 1 ? " stop" : " stops");
    if (currentStops.length === 0) {
      stopList.append(makeElement("p", "empty-state", "No stops have been added."));
      return;
    }

    currentStops.forEach(stop => {
      const card = makeElement("article", "admin-route");
      const details = makeElement("div", "admin-route-details");
      const used = routesUsing(stop).length;
      details.append(
        makeElement("h3", "", stop.name),
        makeElement("p", "muted-copy",
          stop.lat.toFixed(4) + ", " + stop.lng.toFixed(4) + " - " +
          (used === 0 ? "not on any route" : "on " + used + (used === 1 ? " route" : " routes")))
      );

      const editButton = makeEditButton("Edit " + stop.name, "Edit stop");
      editButton.addEventListener("click", () => {
        editingStopId = stop.id;
        stopNameInput.value = stop.name;
        stopLatInput.value = stop.lat;
        stopLngInput.value = stop.lng;
        saveStopButton.replaceChildren(makeIcon("pencil"), document.createTextNode(" Save changes"));
        cancelStopButton.hidden = false;
        setHeading(document.getElementById("stop-form-heading"), "pencil", "Edit stop");
        setMessage(stopMessage, "Editing " + stop.name + ". Routes that use it change with it.", false);
        stopNameInput.focus();
      });

      const deleteButton = makeDeleteButton("Delete " + stop.name, "Delete stop");
      deleteButton.addEventListener("click", async () => {
        // The database refuses too (route_stops refers to the stop), but
        // naming the routes here tells the administrator what to change.
        const usedBy = routesUsing(stop);
        if (usedBy.length > 0) {
          setMessage(stopMessage,
            stop.name + " is on " + usedBy.map(route => route.name).join(", ") + ". Remove it from those routes first.", true);
          return;
        }
        if (!window.confirm("Delete the stop \"" + stop.name + "\"?")) return;
        try {
          await deleteStop(stop.id);
          currentStops = await loadStops();
        } catch (error) {
          console.error("Could not delete the stop.", error);
          setMessage(stopMessage, "The stop could not be deleted. " + error.message, true);
          return;
        }
        if (editingStopId === stop.id) resetStopForm();
        refreshStopNames();
        renderAdminStops();
        setMessage(stopMessage, "Stop deleted.", false);
      });

      const actions = makeElement("div", "admin-route-actions");
      actions.append(editButton, deleteButton);
      card.append(details, actions);
      stopList.append(card);
    });
  }

  function renderAdminAlerts() {
    alertList.replaceChildren();
    if (currentAlerts.length === 0) {
      alertList.append(makeElement("p", "empty-state", "There are no service alerts."));
      return;
    }

    currentAlerts.forEach(alert => {
      const card = makeElement("article", "admin-route");
      const details = makeElement("div", "admin-route-details");
      const delay = alert.delayMinutes > 0 ? " - " + alert.delayMinutes + " min delay" : "";
      details.append(
        makeElement("h3", "", alert.message),
        makeElement("p", "muted-copy", ALERT_TYPES[alert.type] + " - " + alert.routeName + delay)
      );

      const deleteButton = makeDeleteButton("Remove alert: " + alert.message, "Remove alert");
      deleteButton.addEventListener("click", async () => {
        if (!window.confirm("Remove this service alert?")) return;
        try {
          await deleteAlert(alert.id);
          currentAlerts = await loadAlerts();
        } catch (error) {
          console.error("Could not remove the service alert.", error);
          setMessage(alertFeedback, "The alert could not be removed. " + error.message, true);
          return;
        }
        renderAdminAlerts();
        setMessage(alertFeedback, "Service alert removed.", false);
      });
      card.append(details, deleteButton);
      alertList.append(card);
    });
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const result = validateRoute(nameInput.value, stopsInput.value, validStops, currentRoutes, editingId);
    if (result.error) {
      setMessage(message, result.error, true);
      (result.field === "name" ? nameInput : stopsInput).focus();
      return;
    }

    saveButton.disabled = true;
    try {
      await saveRoute(editingId, result.name, result.stops);
      currentRoutes = await loadRoutes();
    } catch (error) {
      console.error("Could not save the sample route.", error);
      setMessage(message, "The route could not be saved. " + error.message, true);
      return;
    } finally {
      saveButton.disabled = false;
    }

    resetForm();
    renderAdminRoutes();
    setMessage(message, "Sample route saved.", false);
  });

  cancelButton.addEventListener("click", () => {
    resetForm();
    setMessage(message, "", false);
  });

  stopForm.addEventListener("submit", async event => {
    event.preventDefault();
    const result = validateStop(stopNameInput.value, stopLatInput.value, stopLngInput.value, currentStops, editingStopId);
    if (result.error) {
      setMessage(stopMessage, result.error, true);
      ({ name: stopNameInput, lat: stopLatInput, lng: stopLngInput })[result.field].focus();
      return;
    }

    saveStopButton.disabled = true;
    try {
      await saveStop(editingStopId, result.name, result.lat, result.lng);
      // A renamed stop changes the routes that use it.
      [currentStops, currentRoutes] = await Promise.all([loadStops(), loadRoutes()]);
    } catch (error) {
      console.error("Could not save the stop.", error);
      setMessage(stopMessage, "The stop could not be saved. " + error.message, true);
      return;
    } finally {
      saveStopButton.disabled = false;
    }

    resetStopForm();
    refreshStopNames();
    renderAdminRoutes();
    setMessage(stopMessage, "Stop saved. You can now use it in a route.", false);
  });

  cancelStopButton.addEventListener("click", () => {
    resetStopForm();
    setMessage(stopMessage, "", false);
  });

  alertForm.addEventListener("submit", async event => {
    event.preventDefault();
    const result = validateAlert(alertMessage.value, alertDelay.value);
    if (result.error) {
      setMessage(alertFeedback, result.error, true);
      (result.field === "message" ? alertMessage : alertDelay).focus();
      return;
    }

    try {
      await saveAlert(alertRoute.value, alertType.value, result.message, result.delayMinutes);
      currentAlerts = await loadAlerts();
    } catch (error) {
      console.error("Could not save the service alert.", error);
      setMessage(alertFeedback, "The alert could not be saved. " + error.message, true);
      return;
    }

    alertForm.reset();
    renderAdminAlerts();
    setMessage(alertFeedback, "Service alert published.", false);
  });

  document.getElementById("sign-out").addEventListener("click", async () => {
    try {
      await logOut();
      window.location.reload();
    } catch (error) {
      console.error("Could not sign out.", error);
      setMessage(message, "You could not be signed out. " + error.message, true);
    }
  });

  resetForm();
  resetStopForm();
  renderAdminRoutes();
  renderAdminAlerts();
}

async function showManagement() {
  const session = await getSession();
  if (session?.role !== 'admin') throw new Error('This page requires an administrator role. Ask the project owner to assign your account.');
  await initManagement();
  await initFleetManagement();
  document.getElementById("login-card").hidden = true;
  document.getElementById("admin-content").hidden = false;
  document.getElementById("sign-out").hidden = false;
}

function showLogin() {
  const form = document.getElementById("login-form");
  const message = document.getElementById("login-message");
  const button = document.getElementById("login-button");

  document.getElementById("login-card").hidden = false;
  if (isDemoMode()) {
    form.hidden = true;
    const button = makeElement('button', 'btn btn-primary', 'Enter local demo as administrator');
    button.type = 'button';
    button.addEventListener('click', async () => { try { demoLogIn('admin'); await showManagement(); } catch (error) { setMessage(message, error.message, true); } });
    document.getElementById('login-card').append(button);
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    button.disabled = true;
    setMessage(message, "", false);
    try {
      await logIn(document.getElementById("login-email").value.trim(), document.getElementById("login-password").value);
      if (!await isAdmin()) {
        await logOut();
        setMessage(message, "This account is not an administrator.", true);
        return;
      }
      await showManagement();
    } catch (error) {
      console.error("Could not log in.", error);
      setMessage(message, "You could not be logged in. " + error.message, true);
    } finally {
      button.disabled = false;
    }
  });
}

export async function initAdmin() {
  const session = await getSession();
  if (session) {
    try { await showManagement(); }
    catch (error) {
      showLogin();
      setMessage(document.getElementById('login-message'), error.message, true);
      const out = makeElement('button', 'btn btn-secondary', 'Sign out of this account');
      out.addEventListener('click', async () => { await logOut(); window.location.reload(); });
      document.getElementById('login-card').append(out);
    }
  } else {
    showLogin();
  }
}
