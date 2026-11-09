-- Existing fleet databases: run this additive upgrade before using the new stop editor.
-- Preserves accounts and roles. Stop edits validate and reset affected bus state atomically.
begin;
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
