-- JUTC Bus Tracker database. Run this once in the Supabase SQL editor.
--
-- After running it, open Authentication in the Supabase dashboard:
--   1. Turn off "Allow new users to sign up". The rules below let any
--      logged-in user change data, so accounts must only come from step 2.
--   2. Add a user. This is the administrator login.

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

create policy "Administrators can change stops" on stops for all to authenticated using (true) with check (true);
create policy "Administrators can change routes" on routes for all to authenticated using (true) with check (true);
create policy "Administrators can change route stops" on route_stops for all to authenticated using (true) with check (true);
create policy "Administrators can change alerts" on alerts for all to authenticated using (true) with check (true);

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
  ('Angels', 18.0357, -76.9678),
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
