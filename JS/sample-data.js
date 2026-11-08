export function makeSampleData(now = Date.now()) {
  const stops = [
    ['Downtown Kingston', 17.9706, -76.7934], ['Cross Roads', 17.9935, -76.7877],
    ['Half-Way Tree', 18.0119, -76.7969], ['Liguanea', 18.0194, -76.768],
    ['University of Technology', 18.0165, -76.7435], ['Papine', 18.0168, -76.7422],
    ['Spanish Town', 17.9957, -76.9541], ['Angels', 18.0357, -76.9678], ['Ferry', 18.0235, -76.877]
  ].map(([name, lat, lng], i) => ({ id: i + 1, name, lat, lng }));
  const routes = [
    ['Downtown Kingston to Half-Way Tree', ['Downtown Kingston', 'Cross Roads', 'Half-Way Tree']],
    ['Half-Way Tree to Papine', ['Half-Way Tree', 'Liguanea', 'University of Technology', 'Papine']],
    ['Spanish Town to Downtown Kingston', ['Spanish Town', 'Angels', 'Ferry', 'Downtown Kingston']],
    ['Cross Roads to Papine', ['Cross Roads', 'Half-Way Tree', 'Liguanea', 'Papine']]
  ].map(([name, stops], i) => ({ id: `route-${i + 1}`, name, stops }));
  const buses = [...routes, routes[0]].map((route, i) => ({
    id: `bus-${i + 1}`, label: `JUTC-DEMO-${String(i + 1).padStart(2, '0')}`, routeId: route.id,
    engineOn: true, status: 'on_time', startedAt: new Date(now).toISOString(), progressSeconds: i * 90,
    locationProgressSeconds: i * 90, updatedAt: new Date(now).toISOString(), preview: true,
    lat: stops.find(s => s.name === route.stops[0]).lat, lng: stops.find(s => s.name === route.stops[0]).lng
  }));
  return { version: 1, stops, routes, buses,
    assignments: [{ busId: buses[0].id, driverId: 'demo-driver' }],
    alerts: [{ id: 'alert-1', routeId: routes[1].id, routeName: routes[1].name, type: 'delay', message: 'Sample traffic delay near Liguanea.', delayMinutes: 5 }] };
}
