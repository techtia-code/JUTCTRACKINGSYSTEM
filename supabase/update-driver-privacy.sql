-- Existing database: run in the Supabase SQL Editor, then refresh the website.
-- Keeps account UUIDs inside the database for fleet management.
-- Only administrators can resolve driver names/emails or view assignment contact details.
begin;

-- Accounts can still read their own role/assignment for login and driver controls.
-- Management obtains other drivers' friendly details only through the admin RPC below.
drop policy if exists "Read own role or admin" on public.user_roles;
drop policy if exists "Read own role" on public.user_roles;
create policy "Read own role" on public.user_roles for select to authenticated using (user_id = auth.uid());
drop policy if exists "Read assigned buses or admin" on public.bus_assignments;
drop policy if exists "Read own assignments" on public.bus_assignments;
create policy "Read own assignments" on public.bus_assignments for select to authenticated using (driver_id = auth.uid());
do $$ begin
  if to_regclass('public.drivers') is not null then
    drop policy if exists "Administrators can see drivers" on public.drivers;
  end if;
end $$;

create or replace function public.jutc_resolve_driver(p_driver_identifier text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  requested text := nullif(trim(p_driver_identifier), '');
  matches uuid[];
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if requested is null then return null; end if;
  select array_agg(u.id) into matches from auth.users u
    join public.user_roles r on r.user_id = u.id and r.role = 'driver'
    where lower(u.email) = lower(requested);
  if coalesce(cardinality(matches), 0) = 0 then
    select array_agg(u.id) into matches from auth.users u
      join public.user_roles r on r.user_id = u.id and r.role = 'driver'
      where lower(trim(u.raw_user_meta_data->>'full_name')) = lower(requested)
         or lower(trim(u.raw_user_meta_data->>'name')) = lower(requested)
         or lower(trim(u.raw_user_meta_data->>'display_name')) = lower(requested);
  end if;
  if coalesce(cardinality(matches), 0) = 0 then
    raise exception 'No driver matches that name or email. Check the account has a driver role.';
  end if;
  if cardinality(matches) > 1 then raise exception 'More than one driver has that name. Use their email address.'; end if;
  return matches[1];
end $$;

create or replace function public.jutc_create_bus(p_label text, p_route_id uuid, p_driver_identifier text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  return public.create_bus(p_label, p_route_id, public.jutc_resolve_driver(p_driver_identifier));
end $$;

create or replace function public.jutc_assign_bus(p_bus_id uuid, p_driver_identifier text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  perform public.assign_bus(p_bus_id, public.jutc_resolve_driver(p_driver_identifier));
end $$;

create or replace function public.jutc_fleet_assignments()
returns table(bus_id uuid, driver_name text, driver_email text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  return query select a.bus_id,
    coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'), ''), nullif(trim(u.raw_user_meta_data->>'name'), ''),
      nullif(trim(u.raw_user_meta_data->>'display_name'), ''), u.email::text, 'Driver'),
    u.email::text
    from public.bus_assignments a join auth.users u on u.id = a.driver_id;
end $$;

-- The resolver's UUID result is internal; browsers can call only the friendly wrappers.
revoke all on function public.jutc_resolve_driver(text) from public, anon, authenticated;
revoke execute on function public.create_bus(text,uuid,uuid), public.assign_bus(uuid,uuid) from public, anon, authenticated;
revoke all on function public.jutc_create_bus(text,uuid,text), public.jutc_assign_bus(uuid,text), public.jutc_fleet_assignments() from public, anon;
grant execute on function public.jutc_create_bus(text,uuid,text), public.jutc_assign_bus(uuid,text), public.jutc_fleet_assignments() to authenticated;

notify pgrst, 'reload schema';
commit;
