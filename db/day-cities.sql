create function public.set_day_cities(trip_id text,day text,cities text[],expected_revision bigint) returns bigint language plpgsql security invoker set search_path='' as $$
declare base jsonb;doc jsonb;version bigint;idx integer;
begin
 if coalesce(private.trip_role(trip_id),'') not in ('owner','editor') then raise exception 'Acesso negado';end if;
 if coalesce(array_length(cities,1),0) not between 1 and 20 or exists(select 1 from unnest(cities) c where length(trim(c)) not between 1 and 100) then raise exception 'Destinos inválidos';end if;
 select document,revision into doc,version from public.trip_state where id=trip_id for update;
 if version<>expected_revision then raise exception 'A viagem mudou. Atualize a página.';end if;
 select data into base from public.trip_baseline where id=trip_id;
 select (ordinality-1)::integer into idx from jsonb_array_elements(base->'days') with ordinality d where value->>'date'=day;
 if idx is null then raise exception 'Data fora da viagem';end if;
 update public.trip_baseline set data=jsonb_set(base,array['days',idx::text,'cities'],to_jsonb(cities)) where id=trip_id;
 perform public.save_trip_v2(trip_id,version,doc);return version+1;
end;$$;
revoke all on function public.set_day_cities(text,text,text[],bigint) from public,anon;grant execute on function public.set_day_cities(text,text,text[],bigint) to authenticated;
