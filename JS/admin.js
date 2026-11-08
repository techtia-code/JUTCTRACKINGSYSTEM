import {
  ALERT_TYPES,
  deleteAlert,
  deleteRoute,
  getSession,
  isAdmin,
  loadAlerts,
  loadRoutes,
  loadStops,
  logIn,
  logOut,
  saveAlert,
  saveRoute
} from "./data.js";
import { makeElement, makeIcon, setHeading } from "./dom.js";
import { validateAlert, validateRoute } from "./planner.js";

function setMessage(element, text, isError) {
  element.textContent = text;
  element.classList.toggle("error", Boolean(isError));
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
  const validStops = allStops.map(stop => stop.name);
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

  document.getElementById("available-stops").textContent = validStops.join(", ");

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
    populateAlertRoutes();
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
  renderAdminRoutes();
  renderAdminAlerts();
}

async function showManagement() {
  await initManagement();
  document.getElementById("login-card").hidden = true;
  document.getElementById("admin-content").hidden = false;
  document.getElementById("sign-out").hidden = false;
}

function showLogin() {
  const form = document.getElementById("login-form");
  const message = document.getElementById("login-message");
  const button = document.getElementById("login-button");

  document.getElementById("login-card").hidden = false;

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
  if (session && await isAdmin()) {
    await showManagement();
    return;
  }

  // Someone who is logged in but not an administrator gets the login form.
  if (session) await logOut();
  showLogin();
}
