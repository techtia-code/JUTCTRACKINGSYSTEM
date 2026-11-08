# JUTC Bus Tracker

A bus journey planner and tracking demo for the Kingston Metropolitan Area. Riders can find a route between two stops, watch buses move on a live map, check arrival estimates and read service alerts. Administrators log in to manage routes and publish alerts.

This is a school project. Bus positions are simulated, not real GPS data, and the project is not affiliated with the Jamaica Urban Transit Company.

## Features

**Journey planner (`index.html`)**
- Find a direct route between two stops, in either direction.
- Search the route list by route name or stop.
- Live map of Kingston with each route, its stops and a moving bus, plus a list showing each bus's next stop.
- Arrival estimates for any stop, updated every 5 seconds and including any delays from service alerts.
- Service alerts, refreshed every 30 seconds.

**Route management (`admin.html`)**
- Administrator login.
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

4. **Connect the website to Supabase**

   Copy `.env.example` to `.env`, then fill in your project URL and its anon (public) key, both found in the project's API settings in Supabase. Don't commit `.env`; it's already in `.gitignore`.

5. **Start the website**

   ```sh
   npm run dev
   ```

   Open the address it prints (usually http://127.0.0.1:5173). The admin page is at `/admin.html`.

**Upgrading an older database:** if your database was created with an older `schema.sql` that let any logged-in user change data, edit the email at the bottom of [`supabase/update-admin-access.sql`](supabase/update-admin-access.sql) and run that file once in the SQL Editor.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Starts the development server |
| `npm test` | Runs the unit tests for the journey planner, form checks, bus simulation and arrival estimates |
| `npm run build` | Builds the finished website into `dist/` |
| `npm run preview` | Serves the `dist/` build locally |

## How it works

**Simulated buses.** Each route has one bus that drives from its first stop to its last and back, at an average speed of 30 km/h. Its position is worked out from the current time, so every visitor sees the bus in the same place.

**Arrival estimates.** For the chosen stop, the site finds how far the bus still has to travel to reach it, in whichever direction gets there first:

```
ETA (minutes) = distance to the stop ÷ average speed + delays from service alerts
```

Distances are straight lines between stops, worked out from their coordinates with the haversine formula.

**Who can change data.** Supabase row level security rules mean anyone can read stops, routes and alerts, but only users listed in the `admins` table can change them. The rules are enforced by the database, so they can't be bypassed from the browser. Route changes are saved by a single database function (`save_route`), so a route is either fully saved or left unchanged.

## Project structure

```
index.html            Journey planner page
admin.html            Route management page
JS/main.js            Starts the right page
JS/home.js            Journey planner, route list, arrivals and alerts
JS/map.js             Leaflet map and moving buses
JS/admin.js           Login, route and alert management
JS/data.js            All reading and writing of Supabase data
JS/planner.js         Journey search and form checks
JS/simulation.js      Bus positions and arrival estimates
JS/supabase.js        Supabase connection
JS/dom.js             Helpers for building page elements
JS/loading-ui.jsx     Loading screen
STYLES/style.css      Styles
supabase/schema.sql   Database tables, access rules and sample data
tests/                Unit tests
```

## Limitations

- Bus positions are simulated. There is no live GPS feed.
- Route lines are drawn straight between stops rather than following the roads.
- Stop locations are approximate, and new stops can only be added in the Supabase SQL Editor.
- The journey planner only finds direct routes, not trips that need a change of bus.
