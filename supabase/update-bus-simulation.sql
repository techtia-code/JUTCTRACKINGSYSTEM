-- Existing database: run in the Supabase SQL Editor, then refresh the website.
-- The first run starts the current fleet. Later runs preserve manually stopped buses.
-- No account, assignment, route or bus ID is changed.
begin;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'buses' and column_name = 'autonomous_simulation'
  ) then
    alter table public.buses add column autonomous_simulation boolean not null default true;
    update public.buses set engine_on = true, started_at = now(), location_updated_at = now()
      where not engine_on;
  end if;
end $$;

-- create_bus already uses these defaults when an administrator adds a bus.
alter table public.buses alter column engine_on set default true;
alter table public.buses alter column started_at set default now();

notify pgrst, 'reload schema';
commit;
