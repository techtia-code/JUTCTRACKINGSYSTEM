-- Run this once in the Supabase SQL editor if your database was created
-- with an older schema.sql that let any logged-in user change data.
-- New databases do not need it: schema.sql already includes these changes.
--
-- Before running it, change admin@example.com at the bottom to the email
-- address of your administrator login.

create table admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

alter table admins enable row level security;

create function is_admin() returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

create policy "Users can see if they are an administrator" on admins for select to authenticated
  using (user_id = (select auth.uid()));

-- Replace the rules that let any logged-in user change data.
drop policy "Administrators can change stops" on stops;
drop policy "Administrators can change routes" on routes;
drop policy "Administrators can change route stops" on route_stops;
drop policy "Administrators can change alerts" on alerts;

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

grant select on admins to authenticated;
revoke execute on function save_route(uuid, text, text[]) from public, anon;
grant execute on function save_route(uuid, text, text[]) to authenticated;

insert into admins (user_id)
select id from auth.users where email = 'admin@example.com';
