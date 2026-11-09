const MAX_DELAY_MINUTES = 120;

// Stops and shared bus locations must be in Jamaica. share_bus_location()
// and the bus_locations checks in supabase/schema.sql use the same numbers.
export const JAMAICA_BOUNDS = { minLat: 17.6, maxLat: 18.6, minLng: -78.4, maxLng: -76.1 };

export function isInJamaica(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= JAMAICA_BOUNDS.minLat && lat <= JAMAICA_BOUNDS.maxLat &&
    lng >= JAMAICA_BOUNDS.minLng && lng <= JAMAICA_BOUNDS.maxLng;
}

export function findJourneys(routes, stops, startName, endName) {
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

export function routeMatchesSearch(route, search) {
  const normalSearch = search.trim().toLocaleLowerCase();
  return [route.name, ...route.stops].some(text => text.toLocaleLowerCase().includes(normalSearch));
}

// Returns { error, field } when the form is invalid, otherwise { name, stops }.
export function validateRoute(enteredName, enteredStopsText, validStops, routes, editingId) {
  const name = enteredName.trim();
  const enteredStops = enteredStopsText.split(",").map(stop => stop.trim()).filter(Boolean);
  if (name.length < 3) {
    return { error: "Enter a route name with at least three characters.", field: "name" };
  }
  if (enteredStops.length < 2) {
    return { error: "Enter at least two stops, separated by commas.", field: "stops" };
  }

  const canonicalStops = enteredStops.map(entered =>
    validStops.find(stop => stop.toLocaleLowerCase() === entered.toLocaleLowerCase())
  );
  if (canonicalStops.some(stop => !stop)) {
    return { error: "Use only the sample stops listed below the field.", field: "stops" };
  }
  if (new Set(canonicalStops).size !== canonicalStops.length) {
    return { error: "A stop can appear only once in a route.", field: "stops" };
  }
  const duplicateName = routes.some(route =>
    route.id !== editingId && route.name.toLocaleLowerCase() === name.toLocaleLowerCase()
  );
  if (duplicateName) {
    return { error: "A sample route already uses that name.", field: "name" };
  }

  return { name, stops: canonicalStops };
}

// Returns { error, field } when the form is invalid, otherwise { message, delayMinutes }.
export function validateAlert(enteredMessage, enteredDelay) {
  const message = enteredMessage.trim();
  const delayMinutes = Number(enteredDelay);
  if (message.length < 5) {
    return { error: "Enter an alert message with at least five characters.", field: "message" };
  }
  if (!Number.isInteger(delayMinutes) || delayMinutes < 0 || delayMinutes > MAX_DELAY_MINUTES) {
    return { error: "Enter a delay from 0 to " + MAX_DELAY_MINUTES + " whole minutes.", field: "delay" };
  }

  return { message, delayMinutes };
}

// Returns { error, field } when the form is invalid, otherwise { name, lat, lng }.
export function validateStop(enteredName, enteredLat, enteredLng, stops, editingId) {
  const name = enteredName.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 60) {
    return { error: "Enter a stop name from 2 to 60 characters.", field: "name" };
  }
  const duplicateName = stops.some(stop =>
    stop.id !== editingId && stop.name.toLocaleLowerCase() === name.toLocaleLowerCase()
  );
  if (duplicateName) {
    return { error: "A stop already uses that name.", field: "name" };
  }

  const lat = String(enteredLat).trim() === "" ? NaN : Number(enteredLat);
  const lng = String(enteredLng).trim() === "" ? NaN : Number(enteredLng);
  if (!Number.isFinite(lat) || lat < JAMAICA_BOUNDS.minLat || lat > JAMAICA_BOUNDS.maxLat) {
    return {
      error: "Enter a latitude in Jamaica, from " + JAMAICA_BOUNDS.minLat + " to " + JAMAICA_BOUNDS.maxLat + ".",
      field: "lat"
    };
  }
  if (!Number.isFinite(lng) || lng < JAMAICA_BOUNDS.minLng || lng > JAMAICA_BOUNDS.maxLng) {
    return {
      error: "Enter a longitude in Jamaica, from " + JAMAICA_BOUNDS.minLng + " to " + JAMAICA_BOUNDS.maxLng + ".",
      field: "lng"
    };
  }

  return { name, lat, lng };
}
