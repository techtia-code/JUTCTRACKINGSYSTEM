# JUTC Bus Tracker

A bus journey planner and tracking demo for the Kingston Metropolitan Area. Riders can find a route between two stops, watch buses move on a map, check arrival estimates, read service alerts and ask to be told when their bus is near. Bus drivers share their bus's location from their phone. Administrators log in to manage stops, routes and alerts.

This is a school project, not affiliated with the Jamaica Urban Transit Company. The fleet has individually labelled buses with saved simulated positions. Drivers with a route assignment can also share a phone location or simulate a route drive; that feed is shown separately as a labelled driver-shared bus.

## Features

**Journey planner (`index.html`)**
- Find a direct route between two stops, in either direction.
- Search the route list by route name or stop.
- Map of Kingston with each route drawn along the roads, its stops and its bus, plus a list showing each bus's next stop and whether it is live from the driver or simulated.
- Arrival estimates for any stop, updated every 5 seconds and including any delays from service alerts.
- **Notify me when it's near:** a message (and a browser notification, if allowed) when the bus is within 1 km of the chosen stop, or when a new delay is reported for the route. It works while the page is open.
- Service alerts, refreshed every 30 seconds.

**Bus drivers (`driver.html`)**
- Driver login.
- **Share my location:** sends the phone's GPS position every 5 seconds while sharing is on.
- **Simulate a drive:** moves the driver's bus along the route's roads from its first stop, for demonstrations away from a bus.
- **Stop sharing:** removes the route-shared bus. Individually managed fleet buses keep their own saved state; stale or parked fleet buses have no arrival estimate.
- Existing fleet controls remain available: select an assigned bus, start/stop its engine and update its on-time/delayed status. Administrators can operate any fleet bus.

**Route management (`admin.html`)**
- Administrator login.
- Add, edit and delete stops (a stop a route uses cannot be deleted).
- Add, edit and delete routes.
- Publish and remove service alerts (delays, route changes and disruptions) for one route or all routes.
- Add individually labelled buses and assign parked buses to driver accounts.

## Built with

- HTML, CSS and JavaScript, bundled with [Vite](https://vite.dev)
- [Supabase](https://supabase.com) for the database and login
- [Leaflet](https://leafletjs.com) with [OpenStreetMap](https://www.openstreetmap.org) map tiles
- The free public [OSRM](https://project-osrm.org) routing service for the roads each route follows
- [Tailwind CSS](https://tailwindcss.com), plus React and Framer Motion for the loading screen
- Node's built-in test runner for unit tests

## How it works

**Live buses.** While a driver is sharing, their page sends the bus's position and direction to the database every 5 seconds through `share_bus_location()`. The function works out the driver's route and stamps the time itself, so a driver can only move their own bus. The planner reads `live_bus_locations`, which only returns positions from the last minute, so a bus whose driver stopped or lost signal goes back to the simulation on its own. A shared position is matched to the nearest point on the route line to work out the next stop and the arrival estimate.

**Simulated buses.** A route with no live driver has one simulated bus that drives from its first stop to its last and back, at an average speed of 30 km/h. Its position is worked out from the current time, so every visitor sees the bus in the same place.

**Road lines.** When the map opens, it asks the OSRM routing service for the roads between each pair of stops and redraws each route along them. The answer is saved in the browser, so each route is only fetched once. Simulated buses, including a driver's Simulate a drive, move along those roads. The bus's timing still comes from the straight-line distance between stops, so on a winding stretch it moves a little faster than 30 km/h. If OSRM can't be reached, routes are drawn as straight lines between stops.

**Arrival estimates.** For the chosen stop, the site finds how far the bus still has to travel to reach it, in whichever direction gets there first:

```
ETA (minutes) = distance to the stop ÷ average speed + delays from service alerts
```

Distances are straight lines between stops, worked out from their coordinates with the haversine formula. Real roads are longer, so for a real bus the estimate comes out a little early.

**Notify me.** Every 5 seconds, with the arrival estimate, the page checks how far the bus is from the chosen stop. At 1 km or less it shows the message once and stops watching; a new delay alert for the route is announced as it appears.

**Who can change data.** Supabase row level security rules mean anyone can read stops, routes, alerts and bus locations, but only administrator accounts in `user_roles` or the compatible `admins` table can change management data. Fleet drivers can operate only their assigned buses. Drivers listed in `drivers` can share a location for their own route only. The rules are enforced by the database, so they can't be bypassed from the browser. Route changes are saved by a single database function (`jutc_save_route`), so a route is either fully saved or left unchanged.

## Merge compatibility

The project preserves the existing per-bus fleet and `JUTCAdmin2026` login alongside the incoming route-based sharing feature. Route-shared positions are labelled separately so one driver feed never replaces every bus on a route. The existing shared database is already configured for the fleet; do not rerun the fresh-only `schema.sql` against populated tables. The optional route-sharing SQL is provided for a project operator to apply if those tables are missing.

Stop editing on an existing fleet database requires `supabase/update-stop-management.sql`. It validates geometry and parks affected fleet buses in the same transaction; new installations already include it in `schema.sql`.
