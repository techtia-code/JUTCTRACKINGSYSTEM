# JUTC Bus Tracker

A bus journey planner and tracking demo for the Kingston Metropolitan Area. Riders can find a route between two stops, watch buses move on a map, check arrival estimates, read service alerts and ask to be told when their bus is near. Bus drivers share their bus's location from their phone. Administrators log in to manage stops, routes and alerts.

This is a school project, not affiliated with the Jamaica Urban Transit Company. A bus's position comes from its driver's phone while the driver is sharing it; every other bus is simulated.

## Features

**Journey planner (`index.html`)**
- Find a direct route between two stops, in either direction.
- Search the route list by route name or stop.
- Map of Kingston with each route, its stops and its bus, plus a list showing each bus's next stop and whether it is live from the driver or simulated.
- Arrival estimates for any stop, updated every 5 seconds and including any delays from service alerts.
- **Notify me when it's near:** a message (and a browser notification, if allowed) when the bus is within 1 km of the chosen stop, or when a new delay is reported for the route. It works while the page is open.
- Service alerts, refreshed every 30 seconds.

**Bus drivers (`driver.html`)**
- Driver login.
- **Share my location:** sends the phone's GPS position every 5 seconds while sharing is on.
- **Simulate a drive:** moves the driver's bus along the route from its first stop, for demonstrations away from a bus.
- **Stop sharing:** takes the bus off the map. A bus that has not been updated for a minute goes back to the simulation.

**Route management (`admin.html`)**
- Administrator login.
- Add, edit and delete stops (a stop a route uses cannot be deleted).
- Add, edit and delete routes.
- Publish and remove service alerts (delays, route changes and disruptions) for one route or all routes.

## Built with

- HTML, CSS and JavaScript, bundled with [Vite](https://vite.dev)
- [Supabase](https://supabase.com) for the database and login
- [Leaflet](https://leafletjs.com) with [OpenStreetMap](https://www.openstreetmap.org) map tiles
- [Tailwind CSS](https://tailwindcss.com), plus React and Framer Motion for the loading screen
- Node's built-in test runner for unit tests

## Setup

You need [Node.js](https://nodejs.org) 22.12 or newer and a free Supabase account.

1. **Install the packages**

   ```sh
   npm install
   ```

2. **Create the database**

   1. Create a project in Supabase.
   2. Open the **SQL Editor**, paste in the contents of [`supabase/schema.sql`](supabase/schema.sql) and run it. This creates the tables, the access rules and the sample routes.

3. **Create the administrator login**

   1. In **Authentication**, turn off **Allow new users to sign up**.
   2. Add a user with an email address and password. This is the login for `admin.html`.
   3. In the **SQL Editor**, make that user an administrator:

      ```sql
      insert into admins (user_id)
      select id from auth.users where email = 'admin@example.com';
      ```

4. **Create a driver login**

   1. In **Authentication**, add a user for the driver.
   2. In the **SQL Editor**, give them the route they drive:

      ```sql
      insert into drivers (user_id, route_id)
      select users.id, routes.id
      from auth.users users, routes
      where users.email = 'driver@example.com'
        and routes.name = 'Half-Way Tree to Papine';
      ```

5. **Connect the website to Supabase**

   Copy `.env.example` to `.env`, then fill in your project URL and its anon (public) key, both found in the project's API settings in Supabase. Don't commit `.env`; it's already in `.gitignore`.

6. **Start the website**

   ```sh
   npm run dev
   ```

   Open the address it prints (usually http://127.0.0.1:5173). The admin page is at `/admin.html` and the driver page at `/driver.html`. Phones only share GPS with a secure (https) site or `localhost`, so test sharing from a phone on the published site; Simulate a drive works anywhere.

**Upgrading an older database:** run these in the SQL Editor, in this order, if your database is older than them. Both are safe to run again; they only add what is missing.
1. [`supabase/update-admin-access.sql`](supabase/update-admin-access.sql), if any logged-in user can still change data (edit the email at the bottom first).
2. [`supabase/add-driver-tracking.sql`](supabase/add-driver-tracking.sql), if there is no `drivers` table yet. Until it runs, every bus is simulated and the driver page can't log in.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Starts the development server |
| `npm test` | Runs the unit tests for the journey planner, form checks, bus positions, arrival estimates and notifications |
| `npm run build` | Builds the finished website into `dist/` |
| `npm run preview` | Serves the `dist/` build locally |

## How it works

**Live buses.** While a driver is sharing, their page sends the bus's position and direction to the database every 5 seconds through `share_bus_location()`. The function works out the driver's route and stamps the time itself, so a driver can only move their own bus. The planner reads `live_bus_locations`, which only returns positions from the last minute, so a bus whose driver stopped or lost signal goes back to the simulation on its own. A shared position is matched to the nearest point on the route line to work out the next stop and the arrival estimate.

**Simulated buses.** A route with no live driver has one simulated bus that drives from its first stop to its last and back, at an average speed of 30 km/h. Its position is worked out from the current time, so every visitor sees the bus in the same place.

**Arrival estimates.** For the chosen stop, the site finds how far the bus still has to travel to reach it, in whichever direction gets there first:

```
ETA (minutes) = distance to the stop ÷ average speed + delays from service alerts
```

Distances are straight lines between stops, worked out from their coordinates with the haversine formula.

**Notify me.** Every 5 seconds, with the arrival estimate, the page checks how far the bus is from the chosen stop. At 1 km or less it shows the message once and stops watching; a new delay alert for the route is announced as it appears.

**Who can change data.** Supabase row level security rules mean anyone can read stops, routes, alerts and bus locations, but only users listed in the `admins` table can change stops, routes and alerts, and only drivers listed in the `drivers` table can share a location, for their own route only. The rules are enforced by the database, so they can't be bypassed from the browser. Route changes are saved by a single database function (`save_route`), so a route is either fully saved or left unchanged.

## Project structure

```
index.html                    Journey planner page
driver.html                   Bus driver page
admin.html                    Route management page
JS/main.js                    Starts the right page
JS/home.js                    Journey planner, route list, arrivals, Notify me and alerts
JS/map.js                     Leaflet map and moving buses
JS/driver.js                  Driver login and location sharing
JS/admin.js                   Login, stop, route and alert management
JS/data.js                    All reading and writing of Supabase data
JS/planner.js                 Journey search and form checks
JS/simulation.js              Bus positions (live and simulated) and arrival estimates
JS/notify.js                  When to tell a commuter their bus is near
JS/supabase.js                Supabase connection
JS/dom.js                     Helpers for building page elements
JS/loading-ui.jsx             Loading screen
STYLES/style.css              Styles
supabase/schema.sql           Database tables, access rules and sample data
supabase/add-driver-tracking.sql  Adds drivers and bus locations to an older database
tests/                        Unit tests
```

## Limitations

- Each route has one bus. A route with no driver sharing shows a simulated bus.
- Notify me only works while the page is open; there is no push to a closed phone.
- Route lines are drawn straight between stops rather than following the roads.
- Stop locations are approximate.
- The journey planner only finds direct routes, not trips that need a change of bus.
