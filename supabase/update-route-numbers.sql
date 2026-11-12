-- Existing database: run once in the Supabase SQL Editor. It is safe to run again.
-- Adds JUTC-style route numbers (22, 21A, 900) and gives each bus a fleet number
-- (1001, 1002, ...) in place of generated labels such as JUTC-SAMPLE-1a2b3c4d.
-- Bus IDs, assignments and locations are kept.
-- The sample route numbers are modelled on real JUTC corridors but are illustrative,
-- not official service information. JS/sample-data.js uses the same list.
-- New installations already include all of this in schema.sql.
begin;

-- Route numbers.
alter table public.routes add column if not exists number text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'routes_number_format' and conrelid = 'public.routes'::regclass) then
    alter table public.routes add constraint routes_number_format check (number ~ '^[0-9]{1,3}[A-Z]{0,3}$');
  end if;
end $$;
create unique index if not exists routes_number_key on public.routes (number);

-- Sample numbers, matched by route name. A route that already has a number keeps it.
update public.routes r set number = v.number
from (values
  ('Downtown Kingston to Half-Way Tree', '32'),
  ('Half-Way Tree to Papine', '900'),
  ('Spanish Town to Downtown Kingston', '22'),
  ('Cross Roads to Papine', '68')
) as v(name, number)
where r.name = v.name and r.number is null
  and not exists (select 1 from public.routes other where other.number = v.number);

-- Fleet numbers.
lock table public.buses in share row exclusive mode;

-- "JUTC-1001" becomes "1001" when that number is free.
update public.buses b set label = substring(b.label from 6)
where b.label ~ '^JUTC-[0-9]{3,5}$'
  and not exists (select 1 from public.buses other where other.label = substring(b.label from 6));

-- Generated labels such as JUTC-SAMPLE-1a2b3c4d get the next free fleet number from 1001.
do $$
declare
  bus record;
  fleet_number integer := 1001;
begin
  for bus in
    select b.id from public.buses b
    join public.routes r on r.id = b.route_id
    where b.label ~ '^JUTC-SAMPLE-[0-9a-f]{8}$'
    order by r.name, r.id, b.id
  loop
    while exists (select 1 from public.buses where label in (fleet_number::text, 'JUTC-' || fleet_number::text)) loop
      fleet_number := fleet_number + 1;
    end loop;
    update public.buses set label = fleet_number::text where id = bus.id;
    fleet_number := fleet_number + 1;
  end loop;
end $$;

-- Saves a route and its number in one step for the admin page. The three-argument
-- jutc_save_route is unchanged, so stop edits (jutc_save_stop) keep each route's number.
create or replace function public.jutc_save_numbered_route(p_route_id uuid, p_name text, p_stops text[], p_number text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare result_id uuid; clean_number text := upper(trim(p_number));
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if clean_number is null or clean_number !~ '^[0-9]{1,3}[A-Z]{0,3}$' then raise exception 'Enter a route number such as 22, 21A or 900'; end if;
  if exists(select 1 from public.routes where number = clean_number and id is distinct from p_route_id) then raise exception 'Another route already uses that number'; end if;
  result_id := public.jutc_save_route(p_route_id, p_name, p_stops);
  update public.routes set number = clean_number where id = result_id;
  return result_id;
end $$;
revoke all on function public.jutc_save_numbered_route(uuid,text,text[],text) from public, anon;
grant execute on function public.jutc_save_numbered_route(uuid,text,text[],text) to authenticated;

notify pgrst, 'reload schema';

select r.number as route_number, r.name as route, b.label as fleet_number
from public.buses b join public.routes r on r.id = b.route_id
order by r.number nulls last, b.label;
commit;
