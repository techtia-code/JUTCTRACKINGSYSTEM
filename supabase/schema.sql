-- JUTC Bus Tracking System: complete database setup.
-- Run ONLY for a fresh Supabase project. The existing shared database is already configured.
-- This file creates the current tables, roles/policies, functions, validation and sample data.
-- Create application accounts under Authentication > Users, then assign each app role in SQL Editor:
-- insert into public.user_roles(user_id, role)
-- select id, 'admin' from auth.users where email = 'jutcadmin2026@example.invalid'
-- on conflict(user_id) do update set role = excluded.role;
-- Use 'driver' for driver accounts. Supabase organization membership is separate from app roles.

begin;

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

-- Anyone can read. Only logged-in administrators can make changes.
alter table stops enable row level security;
alter table routes enable row level security;
alter table route_stops enable row level security;
alter table alerts enable row level security;

create policy "Anyone can read stops" on stops for select using (true);
create policy "Anyone can read routes" on routes for select using (true);
create policy "Anyone can read route stops" on route_stops for select using (true);
create policy "Anyone can read alerts" on alerts for select using (true);


grant select on stops, routes, route_stops, alerts to anon;
grant select, insert, update, delete on stops, routes, route_stops, alerts to authenticated;

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

-- Fleet, access control and application operations.

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'driver'))
);

-- Compatibility with route-based staff accounts from the incoming branch.
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admins enable row level security;
create policy "Users can see if they are an administrator" on public.admins for select to authenticated using (user_id = auth.uid());
grant select on public.admins to authenticated;
revoke insert, update, delete on public.admins from anon, authenticated;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$ select exists(select 1 from public.user_roles where user_id = auth.uid() and role = 'admin') or exists(select 1 from public.admins where user_id = auth.uid()); $$;

create table if not exists public.buses (
  id uuid primary key default gen_random_uuid(),
  label text not null unique check (length(trim(label)) between 1 and 60),
  route_id uuid not null references public.routes(id) on delete cascade,
  engine_on boolean not null default false,
  status text not null default 'on_time' check (status in ('on_time', 'delayed')),
  started_at timestamptz,
  progress_seconds double precision not null default 0 check (progress_seconds >= 0),
  location_progress_seconds double precision not null default 0 check (location_progress_seconds >= 0),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  next_stop text,
  location_updated_at timestamptz not null default now(),
  check ((engine_on and started_at is not null) or (not engine_on and started_at is null))
);
create table if not exists public.bus_assignments (
  bus_id uuid primary key references public.buses(id) on delete cascade,
  driver_id uuid not null references public.user_roles(user_id) on delete cascade
);
create index if not exists bus_assignments_driver_idx on public.bus_assignments(driver_id);
create index if not exists buses_route_idx on public.buses(route_id);
create index if not exists route_stops_stop_idx on public.route_stops(stop_id);

alter table public.user_roles enable row level security;
alter table public.buses enable row level security;
alter table public.bus_assignments enable row level security;

drop policy if exists "Read own role or admin" on public.user_roles;
create policy "Read own role or admin" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists "Read public buses" on public.buses;
create policy "Read public buses" on public.buses for select using (true);
drop policy if exists "Read assigned buses or admin" on public.bus_assignments;
create policy "Read assigned buses or admin" on public.bus_assignments for select to authenticated using (driver_id = auth.uid() or public.is_admin());

-- Replace the legacy rule that gave every authenticated account administrator access.
drop policy if exists "Administrators can change stops" on public.stops;
create policy "Administrators can change stops" on public.stops for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Administrators can change routes" on public.routes;
create policy "Administrators can change routes" on public.routes for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Administrators can change route stops" on public.route_stops;
create policy "Administrators can change route stops" on public.route_stops for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Administrators can change alerts" on public.alerts;
create policy "Administrators can change alerts" on public.alerts for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.buses to anon, authenticated;
grant select on public.user_roles, public.bus_assignments to authenticated;
revoke all on public.user_roles, public.bus_assignments from anon;
revoke insert, update, delete on public.user_roles, public.buses, public.bus_assignments from anon, authenticated;

create or replace function public.jutc_save_route(p_route_id uuid, p_name text, p_stops text[]) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare result_id uuid; first_stop public.stops; second_name text;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_name is null or length(trim(p_name)) < 3 or length(trim(p_name)) > 60 then raise exception 'Enter a route name between 3 and 60 characters'; end if;
  if coalesce(array_length(p_stops, 1), 0) < 2 then raise exception 'At least two stops are required'; end if;
  if (select count(*) from public.stops where name = any(p_stops)) <> array_length(p_stops, 1) then raise exception 'Stops must exist and cannot be repeated'; end if;
  if exists(select 1 from public.routes where lower(name) = lower(trim(p_name)) and id is distinct from p_route_id) then raise exception 'Route name already exists'; end if;
  if p_route_id is null then
    insert into public.routes(name) values (trim(p_name)) returning id into result_id;
  else
    update public.routes set name = trim(p_name) where id = p_route_id returning id into result_id;
    if result_id is null then raise exception 'Route not found'; end if;
    delete from public.route_stops where route_id = result_id;
  end if;
  insert into public.route_stops(route_id, stop_id, position)
    select result_id, s.id, requested.position::integer from unnest(p_stops) with ordinality requested(name, position)
    join public.stops s on s.name = requested.name;
  select * into first_stop from public.stops where name = p_stops[1];
  second_name := p_stops[2];
  -- Editing route geometry invalidates old progress: park its buses at the first stop.
  update public.buses set engine_on = false, started_at = null, progress_seconds = 0, location_progress_seconds = 0,
    lat = first_stop.lat, lng = first_stop.lng, next_stop = second_name, location_updated_at = now() where route_id = result_id;
  return result_id;
end $$;

create or replace function public.create_bus(p_label text, p_route_id uuid, p_driver_id uuid default null) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare result_id uuid; first_stop record; second_name text;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_driver_id is not null and not exists(select 1 from public.user_roles where user_id = p_driver_id and role = 'driver') then raise exception 'Choose a driver account ID'; end if;
  select s.* into first_stop from public.route_stops rs join public.stops s on s.id = rs.stop_id where rs.route_id = p_route_id order by rs.position limit 1;
  select s.name into second_name from public.route_stops rs join public.stops s on s.id = rs.stop_id where rs.route_id = p_route_id order by rs.position offset 1 limit 1;
  if first_stop is null or second_name is null then raise exception 'Choose a route with at least two stops'; end if;
  insert into public.buses(label, route_id, lat, lng, next_stop) values(trim(p_label), p_route_id, first_stop.lat, first_stop.lng, second_name) returning id into result_id;
  if p_driver_id is not null then insert into public.bus_assignments values(result_id, p_driver_id); end if;
  return result_id;
end $$;

create or replace function public.assign_bus(p_bus_id uuid, p_driver_id uuid default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare running boolean;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  select engine_on into running from public.buses where id = p_bus_id for update;
  if running is null then raise exception 'Bus not found'; end if;
  if running then raise exception 'Stop the bus before changing its driver'; end if;
  if p_driver_id is not null and not exists(select 1 from public.user_roles where user_id = p_driver_id and role = 'driver') then raise exception 'Choose a driver account ID'; end if;
  delete from public.bus_assignments where bus_id = p_bus_id;
  if p_driver_id is not null then insert into public.bus_assignments values(p_bus_id, p_driver_id); end if;
end $$;

-- Calculate demonstration coordinates on the server, so clients cannot submit arbitrary GPS positions.
create or replace function public.driver_update_bus(p_bus_id uuid, p_action text, p_status text default null) returns public.buses
language plpgsql security definer set search_path = public, pg_temp as $$
declare bus public.buses; point record; previous_point record; total double precision := 0;
  segment double precision; travelled double precision; target double precision; ratio double precision; outbound boolean;
  seconds double precision; result_lat double precision; result_lng double precision; result_next text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into bus from public.buses where id = p_bus_id for update;
  if bus.id is null then raise exception 'Bus not found'; end if;
  if not public.is_admin() and not exists(select 1 from public.bus_assignments a join public.user_roles u on u.user_id = a.driver_id where a.bus_id = p_bus_id and a.driver_id = auth.uid() and u.role = 'driver') then raise exception 'Bus is not assigned to you'; end if;
  if p_action is null or p_action not in ('start', 'stop', 'publish', 'status') then raise exception 'Invalid driver action'; end if;
  if p_status is not null and p_status not in ('on_time', 'delayed') then raise exception 'Invalid bus status'; end if;
  if p_action = 'publish' and not bus.engine_on then raise exception 'Start the engine first'; end if;
  seconds := bus.progress_seconds;
  if bus.engine_on then seconds := seconds + greatest(0, extract(epoch from (now() - bus.started_at))); end if;
  previous_point := null;
  for point in select s.* from public.route_stops rs join public.stops s on s.id = rs.stop_id where rs.route_id = bus.route_id order by rs.position loop
    if previous_point is not null then
      total := total + 2 * 6371000 * asin(sqrt(least(1.0, power(sin(radians(point.lat - previous_point.lat)/2),2) + cos(radians(previous_point.lat))*cos(radians(point.lat))*power(sin(radians(point.lng - previous_point.lng)/2),2))));
    end if;
    previous_point := point;
  end loop;
  if total <= 0 then raise exception 'Route must contain distinct coordinates'; end if;
  travelled := seconds * 8.3 - floor(seconds * 8.3 / (total * 2)) * (total * 2);
  outbound := travelled < total;
  target := case when outbound then travelled else total * 2 - travelled end;
  total := 0; previous_point := null;
  for point in select s.* from public.route_stops rs join public.stops s on s.id = rs.stop_id where rs.route_id = bus.route_id order by rs.position loop
    if previous_point is not null then
      segment := 2 * 6371000 * asin(sqrt(least(1.0, power(sin(radians(point.lat - previous_point.lat)/2),2) + cos(radians(previous_point.lat))*cos(radians(point.lat))*power(sin(radians(point.lng - previous_point.lng)/2),2))));
      if segment > 0 and total + segment >= target then
        ratio := (target - total) / segment;
        result_lat := previous_point.lat + (point.lat - previous_point.lat) * ratio;
        result_lng := previous_point.lng + (point.lng - previous_point.lng) * ratio;
        result_next := case when outbound then point.name else previous_point.name end;
        exit;
      end if;
      total := total + segment;
    end if;
    previous_point := point;
  end loop;
  if result_lat is null then raise exception 'Could not calculate bus position'; end if;
  if p_action = 'stop' then bus.engine_on := false; bus.started_at := null; bus.progress_seconds := seconds;
  elsif p_action = 'start' and not bus.engine_on then bus.engine_on := true; bus.started_at := now(); end if;
  update public.buses set engine_on = bus.engine_on, started_at = bus.started_at, progress_seconds = bus.progress_seconds,
    location_progress_seconds = seconds, lat = result_lat, lng = result_lng, next_stop = result_next,
    status = coalesce(p_status, bus.status), location_updated_at = now() where id = p_bus_id returning * into bus;
  return bus;
end $$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;
revoke all on function public.jutc_save_route(uuid,text,text[]), public.create_bus(text,uuid,uuid), public.assign_bus(uuid,uuid), public.driver_update_bus(uuid,text,text) from public, anon;
grant execute on function public.jutc_save_route(uuid,text,text[]), public.create_bus(text,uuid,uuid), public.assign_bus(uuid,uuid), public.driver_update_bus(uuid,text,text) to authenticated;

-- Preserve any legacy implementation and signature, but prevent it bypassing the new role rules.
do $$ begin
  if to_regprocedure('public.save_route(uuid,text,text[])') is not null then
    revoke execute on function public.save_route(uuid,text,text[]) from public, anon, authenticated;
  end if;
end $$;

-- An extra illustrative route, only when its stops exist. No official timetable is implied.
insert into public.routes(name)
select 'Cross Roads to Papine' where (select count(*) from public.stops where name in ('Cross Roads','Half-Way Tree','Liguanea','Papine')) = 4
on conflict (name) do nothing;
insert into public.route_stops(route_id, stop_id, position)
select r.id, s.id, v.position from (values ('Cross Roads',1),('Half-Way Tree',2),('Liguanea',3),('Papine',4)) v(name,position)
join public.stops s on s.name = v.name cross join public.routes r
where r.name = 'Cross Roads to Papine' and not exists(select 1 from public.route_stops rs where rs.route_id = r.id)
on conflict do nothing;

-- Initially parked; a driver or administrator starts a bus from the driver console.
insert into public.buses(label,route_id,lat,lng,next_stop)
select 'JUTC-SAMPLE-' || left(r.id::text,8), r.id, first_stop.lat, first_stop.lng, second_stop.name
from public.routes r
join lateral (select s.* from public.route_stops rs join public.stops s on s.id = rs.stop_id where rs.route_id = r.id order by rs.position limit 1) first_stop on true
join lateral (select s.* from public.route_stops rs join public.stops s on s.id = rs.stop_id where rs.route_id = r.id order by rs.position offset 1 limit 1) second_stop on true
on conflict(label) do nothing;


-- Route and coordinate validation.
do $$ begin
  if not exists(select 1 from pg_constraint where conname = 'stops_valid_coordinates' and conrelid = 'public.stops'::regclass) then
    alter table public.stops add constraint stops_valid_coordinates
      check (lat between -90 and 90 and lng between -180 and 180) not valid;
  end if;
end $$;

create or replace function public.jutc_check_route_geometry(p_stops text[]) returns void
language plpgsql stable set search_path = public, pg_temp as $$
begin
  if coalesce(array_length(p_stops, 1), 0) < 2 then raise exception 'At least two route stops are required'; end if;
  if (select count(*) from public.stops where name = any(p_stops)) <> array_length(p_stops, 1) then raise exception 'Stops must exist and cannot be repeated'; end if;
  if exists (
    select 1 from (
      select s.lat, s.lng, lag(s.lat) over(order by requested.position) previous_lat,
        lag(s.lng) over(order by requested.position) previous_lng
      from unnest(p_stops) with ordinality requested(name,position) join public.stops s on s.name = requested.name
    ) path where lat not between -90 and 90 or lng not between -180 and 180
      or (lat = previous_lat and lng = previous_lng)
  ) then raise exception 'Consecutive route stops must have distinct valid coordinates'; end if;
end $$;

create or replace function public.jutc_validate_route_stop() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if exists (
    select 1 from public.stops current_stop join public.route_stops neighbor
      on neighbor.route_id = new.route_id and abs(neighbor.position - new.position) = 1
    join public.stops other_stop on other_stop.id = neighbor.stop_id
    where current_stop.id = new.stop_id and current_stop.lat = other_stop.lat and current_stop.lng = other_stop.lng
  ) then raise exception 'Consecutive route stops must have distinct coordinates'; end if;
  return new;
end $$;

create or replace function public.jutc_validate_bus_route() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  perform public.jutc_check_route_geometry(array(
    select s.name from public.route_stops rs join public.stops s on s.id = rs.stop_id
    where rs.route_id = new.route_id order by rs.position));
  return new;
end $$;

drop trigger if exists jutc_route_stop_geometry on public.route_stops;
create trigger jutc_route_stop_geometry before insert or update on public.route_stops
  for each row execute function public.jutc_validate_route_stop();
drop trigger if exists jutc_bus_route_geometry on public.buses;
create trigger jutc_bus_route_geometry before insert or update of route_id on public.buses
  for each row execute function public.jutc_validate_bus_route();

notify pgrst, 'reload schema';

-- Optional route-assigned driver GPS and demonstration sharing.
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
create policy "Administrators can see drivers" on drivers for select to authenticated
  using (is_admin());
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

notify pgrst, 'reload schema';

-- Atomic stop editing shared by the management page.
create or replace function public.jutc_save_stop(p_stop_id bigint, p_name text, p_lat double precision, p_lng double precision)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare saved_id bigint; affected record; names text[];
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_name is null or length(trim(p_name)) not between 2 and 60 then raise exception 'Enter a stop name from 2 to 60 characters'; end if;
  if p_lat is null or p_lng is null or p_lat not between 17.6 and 18.6 or p_lng not between -78.4 and -76.1 then raise exception 'Enter coordinates in Jamaica'; end if;
  if exists(select 1 from public.stops where lower(name) = lower(trim(p_name)) and id is distinct from p_stop_id) then raise exception 'A stop already uses that name'; end if;
  if p_stop_id is null then
    insert into public.stops(name,lat,lng) values(trim(p_name),p_lat,p_lng) returning id into saved_id;
  else
    update public.stops set name = trim(p_name), lat = p_lat, lng = p_lng where id = p_stop_id returning id into saved_id;
    if saved_id is null then raise exception 'Stop not found'; end if;
    for affected in select distinct r.id,r.name from public.routes r join public.route_stops rs on rs.route_id = r.id where rs.stop_id = saved_id order by r.id loop
      select array_agg(s.name order by rs.position) into names from public.route_stops rs join public.stops s on s.id = rs.stop_id where rs.route_id = affected.id;
      perform public.jutc_check_route_geometry(names);
      perform public.jutc_save_route(affected.id,affected.name,names);
      if to_regclass('public.bus_locations') is not null then
        execute 'delete from public.bus_locations where route_id = $1' using affected.id;
      end if;
    end loop;
  end if;
  return saved_id;
end $$;
revoke all on function public.jutc_save_stop(bigint,text,double precision,double precision) from public,anon;
grant execute on function public.jutc_save_stop(bigint,text,double precision,double precision) to authenticated;
notify pgrst, 'reload schema';

commit;
