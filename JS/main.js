import { mountLoadingSkeleton } from "./loading-ui.jsx";

const ROUTE_STORAGE_KEY = "jutc-demo-routes";

const DEFAULT_ROUTES = [
  {
    id: "downtown-half-way-tree",
    name: "Downtown Kingston to Half-Way Tree",
    stops: ["Downtown Kingston", "Cross Roads", "Half-Way Tree"]
  },
  {
    id: "half-way-tree-papine",
    name: "Half-Way Tree to Papine",
    stops: ["Half-Way Tree", "Liguanea", "University of Technology", "Papine"]
  },
  {
    id: "spanish-town-downtown",
    name: "Spanish Town to Downtown Kingston",
    stops: ["Spanish Town", "Angels", "Ferry", "Downtown Kingston"]
  }
];

const VALID_STOPS = [
  "Downtown Kingston",
  "Cross Roads",
  "Half-Way Tree",
  "Liguanea",
  "University of Technology",
  "Papine",
  "Spanish Town",
  "Angels",
  "Ferry"
];

const ICON_PATHS = {
  "plus": ["M12 5v14m-7-7h14"],
  "pencil": ["m16 4 4 4", "M4 20l4.5-1 11-11a2.1 2.1 0 0 0-4-4l-11 11L4 20Z"],
  "trash": ["M3 6h18", "M8 6V4h8v2", "m19 6-1 14H6L5 6", "M10 11v5m4-5v5"]
};

function makeElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function makeIcon(name) {
  const namespace = "http://www.w3.org/2000/svg";
  const icon = document.createElementNS(namespace, "svg");
  icon.classList.add("icon");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("focusable", "false");
  icon.setAttribute("fill", "none");
  icon.setAttribute("stroke", "currentColor");
  icon.setAttribute("stroke-width", "1.8");
  icon.setAttribute("stroke-linecap", "round");
  icon.setAttribute("stroke-linejoin", "round");
  ICON_PATHS[name].forEach(data => {
    const path = document.createElementNS(namespace, "path");
    path.setAttribute("d", data);
    icon.append(path);
  });
  return icon;
}

function setHeading(heading, iconName, label) {
  heading.replaceChildren(makeIcon(iconName), document.createTextNode(label));
}

function showAppError(error) {
  const notice = document.getElementById("app-error");
  if (!notice) return;
  notice.hidden = false;
  notice.textContent = "The sample routes could not be loaded. " + error.message;
}

function loadRoutes() {
  const savedRoutes = localStorage.getItem(ROUTE_STORAGE_KEY);
  if (savedRoutes === null) return DEFAULT_ROUTES.map(route => ({ ...route, stops: [...route.stops] }));

  const parsedRoutes = JSON.parse(savedRoutes);
  if (!Array.isArray(parsedRoutes)) {
    throw new Error("Saved route information is not in the expected format.");
  }

  const validRoutes = parsedRoutes.every(route =>
    route &&
    typeof route.id === "string" &&
    typeof route.name === "string" &&
    Array.isArray(route.stops) &&
    route.stops.length >= 2 &&
    route.stops.every(stop => typeof stop === "string" && VALID_STOPS.includes(stop))
  );
  if (!validRoutes) {
    throw new Error("Saved route information contains an invalid route or stop.");
  }

  return parsedRoutes;
}

function saveRoutes(routes, messageElement) {
  try {
    localStorage.setItem(ROUTE_STORAGE_KEY, JSON.stringify(routes));
    return true;
  } catch (error) {
    console.error("Could not save sample routes in this browser.", error);
    if (messageElement) {
      messageElement.textContent = "Changes could not be saved in this browser. Check its storage settings and try again.";
      messageElement.classList.add("error");
    }
    return false;
  }
}

function initHome(routes) {
  const stops = [...new Set(routes.flatMap(route => route.stops))];
  const stopList = document.getElementById("stop-list");
  const routeList = document.getElementById("routes-list");
  const routeSelect = document.getElementById("eta-route");
  const stopSelect = document.getElementById("eta-stop");
  const etaResults = document.getElementById("eta-results");
  const searchResults = document.getElementById("search-results");

  stops.forEach(stop => stopList.append(makeElement("option", "", stop)));

  function populateRouteSelect() {
    routeSelect.replaceChildren();
    routes.forEach(route => {
      const option = makeElement("option", "", route.name);
      option.value = route.id;
      routeSelect.append(option);
    });

    if (routes.length === 0) {
      const option = makeElement("option", "", "No sample routes available");
      option.value = "";
      routeSelect.append(option);
    }
  }

  function setEtaStops() {
    const route = routes.find(item => item.id === routeSelect.value);
    stopSelect.replaceChildren();
    if (!route) {
      stopSelect.append(makeElement("option", "", "No stops available"));
      stopSelect.disabled = true;
      renderEtas();
      return;
    }

    stopSelect.disabled = false;
    route.stops.forEach(stop => {
      const option = makeElement("option", "", stop);
      option.value = stop;
      stopSelect.append(option);
    });
    renderEtas();
  }

  function renderRoutes() {
    routeList.replaceChildren();
    if (routes.length === 0) {
      routeList.append(makeElement("p", "empty-state", "There are no sample routes to display yet."));
      return;
    }

    routes.forEach(route => {
      const card = makeElement("article", "route-card");
      const heading = makeElement("h3", "", route.name);
      const details = makeElement("p", "", route.stops.length + " sample stops");
      const stopListElement = makeElement("ul", "route-stops");
      route.stops.forEach(stop => stopListElement.append(makeElement("li", "", stop)));
      card.append(heading, details, stopListElement);
      routeList.append(card);
    });
  }

  function renderSearchMessage(message, isError) {
    searchResults.replaceChildren();
    const result = makeElement("p", isError ? "message error" : "message", message);
    searchResults.append(result);
  }

  function findJourneys(startName, endName) {
    const normalStart = startName.trim().toLocaleLowerCase();
    const normalEnd = endName.trim().toLocaleLowerCase();
    const start = stops.find(stop => stop.toLocaleLowerCase() === normalStart);
    const end = stops.find(stop => stop.toLocaleLowerCase() === normalEnd);
    if (!start || !end) return { error: "Choose both locations from the available sample stops." };
    if (start === end) return { error: "Choose two different stops for your journey." };

    const matches = [];
    routes.forEach(route => {
      const startIndex = route.stops.indexOf(start);
      const endIndex = route.stops.indexOf(end);
      if (startIndex >= 0 && endIndex >= 0) {
        const path = startIndex < endIndex
          ? route.stops.slice(startIndex, endIndex + 1)
          : route.stops.slice(endIndex, startIndex + 1).reverse();
        matches.push({ route, path });
      }
    });

    return { matches };
  }

  function renderJourneyResults(matches) {
    searchResults.replaceChildren();
    if (matches.length === 0) {
      renderSearchMessage("No direct sample route connects those stops. Try another pair of locations.", true);
      return;
    }

    matches.forEach(({ route, path }) => {
      const card = makeElement("article", "result-card");
      card.append(
        makeElement("p", "result-label", "Sample route"),
        makeElement("h3", "", route.name),
        makeElement("p", "", path.join(" to "))
      );
      searchResults.append(card);
    });
  }

  function renderEtas() {
    etaResults.replaceChildren();
    const route = routes.find(item => item.id === routeSelect.value);
    const stop = stopSelect.value;
    if (!route || !stop) {
      etaResults.append(makeElement("p", "empty-state", "Select a route with available stops to view a sample arrival estimate."));
      return;
    }

    const stopIndex = route.stops.indexOf(stop);
    const minutes = (stopIndex + 1) * 4;
    const item = makeElement("article", "eta-item");
    const description = makeElement("div", "");
    description.append(
      makeElement("strong", "", route.name),
      makeElement("p", "muted-copy", "Estimate for " + stop)
    );
    item.append(description, makeElement("span", "eta-time", "About " + minutes + " min"));
    etaResults.append(item);
  }

  populateRouteSelect();
  renderRoutes();
  setEtaStops();

  document.getElementById("route-search-form").addEventListener("submit", event => {
    event.preventDefault();
    const result = findJourneys(
      document.getElementById("start-stop").value,
      document.getElementById("end-stop").value
    );
    if (result.error) {
      renderSearchMessage(result.error, true);
      return;
    }
    renderJourneyResults(result.matches);
  });
  routeSelect.addEventListener("change", setEtaStops);
  stopSelect.addEventListener("change", renderEtas);
}

function initAdmin(routes) {
  let currentRoutes = routes;
  let editingId = null;
  const form = document.getElementById("route-form");
  const nameInput = document.getElementById("route-name");
  const stopsInput = document.getElementById("route-stops");
  const saveButton = document.getElementById("save-route");
  const cancelButton = document.getElementById("cancel-edit");
  const message = document.getElementById("admin-message");
  const list = document.getElementById("admin-routes");
  const count = document.getElementById("route-count");

  document.getElementById("available-stops").textContent = VALID_STOPS.join(", ");

  function setMessage(text, isError) {
    message.textContent = text;
    message.classList.toggle("error", Boolean(isError));
  }

  function resetForm() {
    editingId = null;
    form.reset();
    saveButton.replaceChildren(makeIcon("plus"), document.createTextNode(" Add route"));
    cancelButton.hidden = true;
    setHeading(document.getElementById("route-form-heading"), "plus", "Add a sample route");
  }

  function renderAdminRoutes() {
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
        setMessage("Editing " + route.name + ".", false);
        nameInput.focus();
      });

      const deleteButton = makeElement("button", "admin-icon-button delete-route-button");
      deleteButton.type = "button";
      deleteButton.setAttribute("aria-label", "Delete " + route.name);
      deleteButton.title = "Delete route";
      deleteButton.prepend(makeIcon("trash"));
      deleteButton.addEventListener("click", () => {
        if (!window.confirm("Delete the sample route \"" + route.name + "\"?")) return;
        const updatedRoutes = currentRoutes.filter(item => item.id !== route.id);
        if (!saveRoutes(updatedRoutes, message)) return;
        currentRoutes = updatedRoutes;
        if (editingId === route.id) resetForm();
        renderAdminRoutes();
        setMessage("Sample route deleted. Refresh the journey planner to see the change.", false);
      });
      actions.append(editButton, deleteButton);
      card.append(details, actions);
      list.append(card);
    });
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    const name = nameInput.value.trim();
    const enteredStops = stopsInput.value.split(",").map(stop => stop.trim()).filter(Boolean);
    if (name.length < 3) {
      setMessage("Enter a route name with at least three characters.", true);
      nameInput.focus();
      return;
    }
    if (enteredStops.length < 2) {
      setMessage("Enter at least two stops, separated by commas.", true);
      stopsInput.focus();
      return;
    }

    const canonicalStops = enteredStops.map(entered =>
      VALID_STOPS.find(stop => stop.toLocaleLowerCase() === entered.toLocaleLowerCase())
    );
    if (canonicalStops.some(stop => !stop)) {
      setMessage("Use only the sample stops listed below the field.", true);
      stopsInput.focus();
      return;
    }
    if (new Set(canonicalStops).size !== canonicalStops.length) {
      setMessage("A stop can appear only once in a route.", true);
      stopsInput.focus();
      return;
    }
    const duplicateName = currentRoutes.some(route =>
      route.id !== editingId && route.name.toLocaleLowerCase() === name.toLocaleLowerCase()
    );
    if (duplicateName) {
      setMessage("A sample route already uses that name.", true);
      nameInput.focus();
      return;
    }

    const updatedRoutes = editingId
      ? currentRoutes.map(route => route.id === editingId
        ? { ...route, name, stops: canonicalStops }
        : route)
      : [...currentRoutes, {
        id: "sample-route-" + Date.now(),
        name,
        stops: canonicalStops
      }];

    if (!saveRoutes(updatedRoutes, message)) return;
    currentRoutes = updatedRoutes;
    resetForm();
    renderAdminRoutes();
    setMessage("Sample route saved. Refresh the journey planner to see the change.", false);
  });

  cancelButton.addEventListener("click", () => {
    resetForm();
    setMessage("", false);
  });

  resetForm();
  renderAdminRoutes();
}

mountLoadingSkeleton(document.body.dataset.page);

document.addEventListener("DOMContentLoaded", () => {
  try {
    const routes = loadRoutes();
    if (document.body.dataset.page === "home") initHome(routes);
    if (document.body.dataset.page === "admin") initAdmin(routes);
  } catch (error) {
    console.error("Could not initialize the JUTC bus tracker demonstration.", error);
    showAppError(error);
  } finally {
    window.dispatchEvent(new Event("jutc:ready"));
  }
});
