# JUTC Bus Tracker

A bus journey planner and tracking demo for the Kingston Metropolitan Area. Riders can find a route between two stops, watch buses move on a map, check arrival estimates, read service alerts and ask to be told when their bus is near. Bus drivers share their bus's location from their phone. Administrators log in to manage stops, routes and alerts.

This is a school project, not affiliated with the Jamaica Urban Transit Company. As riders do in Jamaica, each route is known by its route number (for example **22** Spanish Town to Downtown Kingston, or **900** Half-Way Tree to Papine), and each bus has its own fleet number (Bus 1001, Bus 1002, ...). The sample numbers are modelled on real JUTC corridors but are illustrative, not official service information. The fleet buses have saved simulated positions. Drivers with a route assignment can also share a phone location or simulate a route drive; that feed is shown separately as a "Live driver bus".

## Features

**Journey planner (`index.html`)**
- Find a direct route between two stops, in either direction, choosing each stop from a list.
- Journey search opens the matching routes and their buses on the map. Use **View buses on map** to focus one route, or **Show all routes** to reset the map. Route-name filtering also filters the map; bus refreshes preserve the selected view.
- Search the route list by route number, route name or stop.
- Map of Kingston with each route drawn along the roads, its stops and its bus, plus a list showing each bus's next stop and whether it is live from the driver or simulated.
- **Arrivals board:** choose a route and your stop to see every bus on that route with its estimate, soonest first, updated every 5 seconds and including any delays from service alerts. Parked buses and buses with paused location updates are listed without an estimate.
- **Notify me:** tap the bell on a bus for a message (and a browser notification, if allowed) when it is within 1 km of your stop or delayed. The browser asks for notification permission on the first tap; without it, alerts show on the page. A banner shows which bus is being watched, with a **Stop** button. It works while the page is open.
- Service alerts, refreshed every 30 seconds.

**Bus drivers (`driver.html`)**
- Driver login.
- **Share my location:** sends the phone's GPS position every 5 seconds while sharing is on.
- **Simulate a drive:** moves the driver's bus along the route's roads from its first stop, for demonstrations away from a bus.
- **Stop sharing:** removes the route-shared bus. Individually managed fleet buses keep their own saved state; stale or parked fleet buses have no arrival estimate.
- Simulated fleet buses run by default without a driver login. Select an assigned bus to stop/restart its engine or update its on-time/delayed status. A stopped bus stays parked until restarted; signing out leaves running simulations active. Administrators can operate any fleet bus.
- **Go Live** starts or resumes the selected bus simulation. Phone GPS sharing remains a separate control.

**Route management (`admin.html`)**
- Administrator login.
- Add, edit and delete stops (a stop a route uses cannot be deleted).
- Add, edit and delete routes, each with a route number such as 22, 21A or 900.
- Publish and remove service alerts (delays, route changes and disruptions) for one route or all routes.
- Add buses by fleet number (3 to 5 digits) and assign parked buses using a driver's name or email. Driver account UUIDs are handled inside the database.

## Built with

- HTML, CSS and JavaScript, bundled with [Vite](https://vite.dev)
- [Supabase](https://supabase.com) for the database and login
- [Leaflet](https://leafletjs.com) with [OpenStreetMap](https://www.openstreetmap.org) map tiles
- The free public [OSRM](https://project-osrm.org) routing service for the roads each route follows
- Node's built-in test runner for unit tests

The pages are designed mobile first: on a phone the journey planner has a bottom tab bar, the map moves with two fingers so one finger scrolls the page, and the admin sections collapse.

## How it works

**Live buses.** While a driver is sharing, their page sends the bus's position and direction to the database every 5 seconds through `share_bus_location()`. The function works out the driver's route and stamps the time itself, so a driver can only move their own bus. The planner reads `live_bus_locations`, which only returns positions from the last minute, so a bus whose driver stopped or lost signal goes back to the simulation on its own. A shared position is matched to the nearest point on the route line to work out the next stop and the arrival estimate.

**Simulated buses.** Each running fleet bus moves from its first stop to its last and back at an average speed of 30 km/h. Its position comes from its saved engine start time and progress, so it keeps moving without a driver page publishing updates. Driver Stop/Start commands save the shared state for everyone. Stopped buses remain parked and have no arrival estimate. Phone GPS feeds remain separate and expire after a minute without updates.

Existing databases need `supabase/update-bus-simulation.sql` once to enable automatic simulation and start the current fleet. Running the script again preserves later manual stops. New installations already include the defaults in `schema.sql`. Editing route geometry still parks affected buses so they can be restarted on the changed route.

**Road lines.** When the map opens, it asks the OSRM routing service for the roads between each pair of stops and redraws each route along them. The answer is saved in the browser, so each route is only fetched once. Simulated buses, including a driver's Simulate a drive, move along those roads. The bus's timing still comes from the straight-line distance between stops, so on a winding stretch it moves a little faster than 30 km/h. If OSRM can't be reached, routes are drawn as straight lines between stops.

**Arrival estimates.** For the chosen stop, the site finds how far the bus still has to travel to reach it, in whichever direction gets there first:

```
ETA (minutes) = distance to the stop ÷ average speed + delays from service alerts
```

Distances are straight lines between stops, worked out from their coordinates with the haversine formula. Real roads are longer, so for a real bus the estimate comes out a little early.

**Notify me.** Every 5 seconds, with the arrival estimates, the page checks how far the watched bus is from the chosen stop. At 1 km or less, or when the bus or route is delayed, it shows the alert and sends one browser notification. Changing the route or stop, or the bus leaving the route, stops the watch.

**Route and fleet numbers.** Existing databases need `supabase/update-route-numbers.sql` once. It adds the route `number` column, gives the sample routes their numbers, and renames generated bus labels such as `JUTC-SAMPLE-1a2b3c4d` or `JUTC-1001` to fleet numbers (1001, 1002, ...). It also adds `jutc_save_numbered_route`, which the admin page uses to save a route and its number together. Until it runs, the site still loads and shows routes without numbers, but saving a route asks for the update. New installations already include it in `schema.sql`.

**Who can change data.** Supabase row level security rules mean anyone can read stops, routes, alerts and bus locations, but only administrator accounts in `user_roles` or the compatible `admins` table can change management data. Fleet drivers can operate only their assigned buses. Drivers listed in `drivers` can share a location for their own route only. The rules are enforced by the database, so they can't be bypassed from the browser. Route changes are saved by a single database function (`jutc_save_route`), so a route is either fully saved or left unchanged.

**Driver assignments.** Administrators enter an existing driver's email or name (from the account's `full_name`, `name` or `display_name` profile field). Names must match exactly, ignoring capitalization and surrounding spaces; use email when names are duplicated. The database resolves the account internally and returns only the bus ID, driver name and email to management. Contact details are administrator-only, and accounts can read only their own raw role/assignment records. Existing databases need `supabase/update-driver-privacy.sql`; fresh installations already include it.

## Merge compatibility

The project preserves the existing per-bus fleet and `JUTCAdmin2026` login alongside the incoming route-based sharing feature. Route-shared positions are labelled separately so one driver feed never replaces every bus on a route. The existing shared database is already configured for the fleet; do not rerun the fresh-only `schema.sql` against populated tables. The optional route-sharing SQL is provided for a project operator to apply if those tables are missing.

Stop editing on an existing fleet database requires `supabase/update-stop-management.sql`. It validates geometry and parks affected fleet buses in the same transaction; new installations already include it in `schema.sql`.

## Assign a driver to a route

Create the driver's application login under Supabase Authentication with **Auto Confirm User** enabled, then run this in the Supabase SQL Editor:

```sql
select add_driver('driver@example.com', 'Half-Way Tree to Papine');
```

The helper checks the email and route name and confirms the assignment. Run it again with a different route to reassign the driver. It is available only to database operators, not browser clients. Existing databases obtain it by running `supabase/add-driver-tracking.sql`; fresh installations include it in `schema.sql`. Individual fleet-bus assignments remain available through the administration page.
