-- Bus drivers and live bus locations. Run this in the Supabase SQL editor
-- on a database created before drivers were added. New databases do not
-- need it: schema.sql already includes it.
--
-- It is safe to run more than once: it only adds what is missing. Run
-- update-admin-access.sql first if the database has no admins table.
--
-- To add a driver afterwards:
--   1. In Authentication, add a user with an email address and password,
--      with "Auto Confirm User" ticked.
--   2. Give them a route in the SQL editor:
--        select add_driver('driver@example.com', 'Half-Way Tree to Papine');

-- Which route each driver drives. Drivers are added in the SQL editor, like
-- administrators; the website cannot change this table.
create table if not exists drivers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  route_id uuid not null references routes (id) on delete cascade
);

-- The last position a driver shared for their route: one bus per route.
-- The limits are Jamaica (JAMAICA_BOUNDS in JS/planner.js).
create table if not exists bus_locations (
  route_id uuid primary key references routes (id) on delete cascade,
  lat double precision not null check (lat between 17.6 and 18.6),
  lng double precision not null check (lng between -78.4 and -76.1),
  direction text not null check (direction in ('outbound', 'inbound')),
  updated_at timestamptz not null default now()
);

alter table drivers enable row level security;
alter table bus_locations enable row level security;

-- Lets the driver page find the logged-in driver's route.
drop policy if exists "Drivers can see their own route" on drivers;
create policy "Drivers can see their own route" on drivers for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "Administrators can see drivers" on drivers;
-- Anyone can read bus locations. Nobody writes them directly: only through
-- share_bus_location() and stop_sharing_location() below.
drop policy if exists "Anyone can read bus locations" on bus_locations;
create policy "Anyone can read bus locations" on bus_locations for select using (true);

-- Positions shared in the last minute. The database's clock decides what
-- is live, so a wrong clock on a visitor's phone does not matter.
create or replace view live_bus_locations with (security_invoker = true) as
  select route_id, lat, lng, direction, updated_at
  from public.bus_locations
  where updated_at > now() - interval '60 seconds';

-- Saves the logged-in driver's position for their own route, stamped with
-- the database's time. It runs as the table owner so drivers need no write
-- access to bus_locations, which means they cannot move another route's
-- bus or change the time.
create or replace function share_bus_location(p_lat double precision, p_lng double precision, p_direction text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  driver_route uuid;
begin
  select route_id into driver_route from public.drivers where user_id = (select auth.uid());
  if driver_route is null then
    raise exception 'This account is not a bus driver.';
  end if;
  if p_lat is null or p_lng is null
     or p_lat not between 17.6 and 18.6 or p_lng not between -78.4 and -76.1 then
    raise exception 'That location is outside Jamaica.';
  end if;
  if p_direction is null or p_direction not in ('outbound', 'inbound') then
    raise exception 'The direction must be outbound or inbound.';
  end if;

  insert into public.bus_locations (route_id, lat, lng, direction, updated_at)
  values (driver_route, p_lat, p_lng, p_direction, now())
  on conflict (route_id) do update
    set lat = excluded.lat, lng = excluded.lng, direction = excluded.direction, updated_at = excluded.updated_at;
end;
$$;

-- Takes the logged-in driver's bus off the map straight away.
create or replace function stop_sharing_location()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.bus_locations
  where route_id = (select route_id from public.drivers where user_id = (select auth.uid()));
end;
$$;

grant select on bus_locations, live_bus_locations to anon, authenticated;
grant select on drivers to authenticated;
revoke insert, update, delete on bus_locations, drivers from anon, authenticated;
revoke execute on function share_bus_location(double precision, double precision, text) from public, anon;
revoke execute on function stop_sharing_location() from public, anon;
grant execute on function share_bus_location(double precision, double precision, text) to authenticated;
grant execute on function stop_sharing_location() to authenticated;

-- Makes a login a bus driver for a route, or moves a driver to another
-- route. Add the login first under Authentication > Add user, then run:
--   select add_driver('driver@example.com', 'Half-Way Tree to Papine');
-- Only the SQL editor can run it; the website cannot.
create or replace function add_driver(driver_email text, route_name text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  driver_id uuid;
  found_route_id uuid;
  found_route_name text;
begin
  select id into driver_id from auth.users where lower(email) = lower(trim(driver_email));
  if driver_id is null then
    raise exception 'No login uses the email %. Add it first under Authentication > Add user.', driver_email;
  end if;

  select id, name into found_route_id, found_route_name
  from public.routes where lower(name) = lower(trim(route_name));
  if found_route_id is null then
    raise exception 'There is no route called "%". Copy the name from the route list on the admin page.', route_name;
  end if;

  insert into public.drivers (user_id, route_id) values (driver_id, found_route_id)
  on conflict (user_id) do update set route_id = excluded.route_id;

  return trim(driver_email) || ' now drives ' || found_route_name || ' and can log in at driver.html.';
end;
$$;

revoke execute on function add_driver(text, text) from public, anon, authenticated;
