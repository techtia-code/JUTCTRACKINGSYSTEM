-- Existing database: run once in the Supabase SQL Editor.
-- Renames only generated sample labels. IDs, assignments and locations are retained.
-- These numbers identify this project's simulated fleet, not official JUTC buses.
begin;
lock table public.buses in share row exclusive mode;

do $$
declare
  bus record;
  bus_number integer := 1001;
begin
  for bus in
    select b.id from public.buses b
    join public.routes r on r.id = b.route_id
    where b.label ~ '^JUTC-SAMPLE-[0-9a-f]{8}$'
    order by r.name, r.id, b.id
  loop
    while exists (select 1 from public.buses where upper(label) = 'JUTC-' || bus_number::text) loop
      bus_number := bus_number + 1;
    end loop;
    update public.buses set label = 'JUTC-' || bus_number::text where id = bus.id;
    bus_number := bus_number + 1;
  end loop;
end $$;

select id, label from public.buses order by label;
commit;
