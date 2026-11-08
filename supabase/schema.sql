-- JUTC Bus Tracker database. Run this once in the Supabase SQL editor.
--
-- After running it, open Authentication in the Supabase dashboard:
--   1. Turn off "Allow new users to sign up".
--   2. Add a user. This is the administrator login.
--   3. Make that user an administrator by running this in the SQL editor
--      with their email address:
--        insert into admins (user_id)
--        select id from auth.users where email = 'admin@example.com';
--   4. For each bus driver, add a user, then give them a route:
--        insert into drivers (user_id, route_id)
--        select users.id, routes.id
--        from auth.users users, routes
--        where users.email = 'driver@example.com'
--          and routes.name = 'Half-Way Tree to Papine';

create table stops (
  id bigint generated always as identity primary key,
  name text not null unique,
  lat double precision not null,
  lng double precision not null
);

create table routes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table route_stops (
  route_id uuid not null references routes (id) on delete cascade,
  stop_id bigint not null references stops (id),
  position integer not null,
  primary key (route_id, position),
  unique (route_id, stop_id)
);

-- An alert with no route_id applies to all routes.
create table alerts (
  id bigint generated always as identity primary key,
  route_id uuid references routes (id) on delete cascade,
  type text not null check (type in ('delay', 'route_change', 'disruption')),
  message text not null,
  delay_minutes integer not null default 0 check (delay_minutes >= 0),
  created_at timestamptz not null default now()
);

-- Only users listed here can change data. Add administrators in the SQL
-- editor; the website cannot change this table.
create table admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

-- Anyone can read. Only administrators can make changes.
alter table stops enable row level security;
alter table routes enable row level security;
alter table route_stops enable row level security;
alter table alerts enable row level security;
alter table admins enable row level security;

create function is_admin() returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

create policy "Anyone can read stops" on stops for select using (true);
create policy "Anyone can read routes" on routes for select using (true);
create policy "Anyone can read route stops" on route_stops for select using (true);
create policy "Anyone can read alerts" on alerts for select using (true);
-- Lets the admin page check whether the logged-in user is an administrator.
create policy "Users can see if they are an administrator" on admins for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Administrators can change stops" on stops for all to authenticated using (is_admin()) with check (is_admin());
create policy "Administrators can change routes" on routes for all to authenticated using (is_admin()) with check (is_admin());
create policy "Administrators can change route stops" on route_stops for all to authenticated using (is_admin()) with check (is_admin());
create policy "Administrators can change alerts" on alerts for all to authenticated using (is_admin()) with check (is_admin());

-- Saves a route and its stops in one step, so a failed save never leaves a
-- route half changed. Pass null as target_route_id to add a new route.
-- It runs with the caller's permissions, so the policies above still apply.
create function save_route(target_route_id uuid, route_name text, stop_names text[])
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  saved_id uuid := target_route_id;
begin
  if coalesce(cardinality(stop_names), 0) < 2 then
    raise exception 'A route needs at least two stops.';
  end if;

  if saved_id is null then
    insert into public.routes (name) values (route_name) returning id into saved_id;
  else
    update public.routes set name = route_name where id = saved_id;
    -- Row level security skips rows the user cannot change instead of raising an error.
    if not found then
      raise exception 'The route was not found, or you are not allowed to change it.';
    end if;
    delete from public.route_stops where route_id = saved_id;
  end if;

  insert into public.route_stops (route_id, stop_id, position)
  select saved_id, stops.id, stop_list.position
  from unnest(stop_names) with ordinality as stop_list (name, position)
  join public.stops on stops.name = stop_list.name;

  if (select count(*) from public.route_stops where route_id = saved_id) <> cardinality(stop_names) then
    raise exception 'One or more of the stops do not exist.';
  end if;

  return saved_id;
end;
$$;

grant select on stops, routes, route_stops, alerts to anon;
grant select, insert, update, delete on stops, routes, route_stops, alerts to authenticated;
grant select on admins to authenticated;
revoke execute on function save_route(uuid, text, text[]) from public, anon;
grant execute on function save_route(uuid, text, text[]) to authenticated;

-- Sample data.
insert into stops (name, lat, lng) values
  ('Downtown Kingston', 17.9706, -76.7934),
  ('Cross Roads', 17.9935, -76.7877),
  ('Half-Way Tree', 18.0119, -76.7969),
  ('Liguanea', 18.0194, -76.7680),
  ('University of Technology', 18.0165, -76.7435),
  ('Papine', 18.0168, -76.7422),
  ('Spanish Town', 17.9957, -76.9541),
  ('Angels', 18.0406, -76.9795),
  ('Ferry', 18.0235, -76.8770);

insert into routes (name) values
  ('Downtown Kingston to Half-Way Tree'),
  ('Half-Way Tree to Papine'),
  ('Spanish Town to Downtown Kingston');

insert into route_stops (route_id, stop_id, position)
select routes.id, stops.id, sample.position
from (values
  ('Downtown Kingston to Half-Way Tree', 'Downtown Kingston', 1),
  ('Downtown Kingston to Half-Way Tree', 'Cross Roads', 2),
  ('Downtown Kingston to Half-Way Tree', 'Half-Way Tree', 3),
  ('Half-Way Tree to Papine', 'Half-Way Tree', 1),
  ('Half-Way Tree to Papine', 'Liguanea', 2),
  ('Half-Way Tree to Papine', 'University of Technology', 3),
  ('Half-Way Tree to Papine', 'Papine', 4),
  ('Spanish Town to Downtown Kingston', 'Spanish Town', 1),
  ('Spanish Town to Downtown Kingston', 'Angels', 2),
  ('Spanish Town to Downtown Kingston', 'Ferry', 3),
  ('Spanish Town to Downtown Kingston', 'Downtown Kingston', 4)
) as sample (route_name, stop_name, position)
join routes on routes.name = sample.route_name
join stops on stops.name = sample.stop_name;

insert into alerts (route_id, type, message, delay_minutes)
select id, 'delay', 'Heavy traffic near Liguanea is delaying this sample route.', 5
from routes
where name = 'Half-Way Tree to Papine';

-- Bus drivers and live bus locations (also in add-driver-tracking.sql for
-- databases created before drivers were added).
-- Which route each driver drives. Drivers are added in the SQL editor, like
-- administrators; the website cannot change this table.
create table drivers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  route_id uuid not null references routes (id) on delete cascade
);

-- The last position a driver shared for their route: one bus per route.
-- The limits are Jamaica (JAMAICA_BOUNDS in JS/planner.js).
create table bus_locations (
  route_id uuid primary key references routes (id) on delete cascade,
  lat double precision not null check (lat between 17.6 and 18.6),
  lng double precision not null check (lng between -78.4 and -76.1),
  direction text not null check (direction in ('outbound', 'inbound')),
  updated_at timestamptz not null default now()
);

alter table drivers enable row level security;
alter table bus_locations enable row level security;

-- Lets the driver page find the logged-in driver's route.
create policy "Drivers can see their own route" on drivers for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Administrators can see drivers" on drivers for select to authenticated
  using (is_admin());
-- Anyone can read bus locations. Nobody writes them directly: only through
-- share_bus_location() and stop_sharing_location() below.
create policy "Anyone can read bus locations" on bus_locations for select using (true);

-- Positions shared in the last minute. The database's clock decides what
-- is live, so a wrong clock on a visitor's phone does not matter.
create view live_bus_locations with (security_invoker = true) as
  select route_id, lat, lng, direction, updated_at
  from public.bus_locations
  where updated_at > now() - interval '60 seconds';

-- Saves the logged-in driver's position for their own route, stamped with
-- the database's time. It runs as the table owner so drivers need no write
-- access to bus_locations, which means they cannot move another route's
-- bus or change the time.
create function share_bus_location(p_lat double precision, p_lng double precision, p_direction text)
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
create function stop_sharing_location()
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
