-- Owner-only metadata changes, atomically synchronized with calendar and revision.
grant update(start_date,end_date,destinations) on public.trips to authenticated;
create or replace function public.edit_trip(trip_id text,trip_name text,first_day date,last_day date,cities text[],expected_revision bigint)
returns bigint language plpgsql security invoker set search_path='' as $$
declare base jsonb;doc jsonb;version bigint;old_first date;old_last date;d jsonb;b jsonb;merged jsonb;days jsonb;patches jsonb;r jsonb;
begin
 if coalesce(private.trip_role(trip_id),'')<>'owner' then raise exception 'Somente o proprietário pode editar os dados da viagem.';end if;
 if first_day is null or last_day is null or last_day<first_day or last_day-first_day>365 then raise exception 'Informe um período válido de até 366 dias.';end if;
 if coalesce(length(trim(trip_name)),0) not between 1 and 120 or coalesce(array_length(cities,1),0) not between 1 and 50 or exists(select 1 from unnest(cities) c where c is null or length(trim(c)) not between 1 and 100) then raise exception 'Informe nome e destinos válidos.';end if;
 select document,revision into doc,version from public.trip_state where id=trip_id for update;
 if version is distinct from expected_revision then raise exception 'A viagem mudou. Feche e abra novamente a edição.';end if;
 select start_date,end_date into old_first,old_last from public.trips where id=trip_id for update;
 select data into base from public.trip_baseline where id=trip_id for update;
 if first_day>old_first or last_day<old_last then
  for d in select value from jsonb_array_elements(base->'days') loop
   if (d->>'date')::date<first_day or (d->>'date')::date>last_day then
    if jsonb_array_length(coalesce(d->'blocks','[]'))>0 or coalesce(doc->'state'->(d->>'date'),'{}')<>'{}'::jsonb or jsonb_array_length(coalesce(d->'notes','[]'))>0 or nullif(d->>'overnight','') is not null then
     raise exception 'O dia % tem planejamento. Remaneje os dados antes de removê-lo do período.',d->>'date';
    end if;
   end if;
   select coalesce(jsonb_object_agg(value->>'id',value),'{}') into merged from jsonb_array_elements(d->'blocks');
   merged:=merged||coalesce(doc->'state'->(d->>'date'),'{}');
   for b in select value from jsonb_each(merged) where jsonb_typeof(value)='object' loop
    if b->>'kind'='transfer' then continue;end if;
    if first_day>old_first and (d->>'date')::date+(coalesce((b->>'start')::int,0)-coalesce((b->>'waitBefore')::int,0))*interval '1 minute'<first_day::timestamp
       or last_day<old_last and (d->>'date')::date+(coalesce((b->>'end')::int,0)+coalesce((b->>'waitAfter')::int,0))*interval '1 minute'>(last_day+1)::timestamp then
     raise exception 'Há uma atividade ou espera que ultrapassa o novo período.';
    end if;
   end loop;
  end loop;
  for r in select value from jsonb_array_elements(coalesce(base->'reservations','[]')) loop
   if (r->>'date')::date<first_day or (r->>'date')::date>last_day or (case when r->>'end' ~ '^\d{4}-\d{2}-\d{2}$' then (r->>'end')::date else (r->>'date')::date end)>last_day then raise exception 'Há reservas fora do novo período. Ajuste o período para preservá-las.';end if;
  end loop;
 end if;
 select jsonb_agg(coalesce((select value from jsonb_array_elements(base->'days') where value->>'date'=to_char(day,'YYYY-MM-DD')),jsonb_build_object('date',to_char(day,'YYYY-MM-DD'),'cities',to_jsonb(cities),'blocks','[]'::jsonb,'notes','[]'::jsonb,'overnight',null)) order by day)
 into days from generate_series(first_day::timestamp,last_day::timestamp,interval '1 day') day;
 select coalesce(jsonb_object_agg(key,value),'{}') into patches from jsonb_each(doc->'state') where key::date between first_day and last_day;
 update public.trips set name=trim(trip_name),start_date=first_day,end_date=last_day,destinations=cities where id=trip_id;
 update public.trip_baseline set data=jsonb_set(base,'{days}',days) where id=trip_id;
 perform public.save_trip_v2(trip_id,version,jsonb_set(doc,'{state}',patches));return version+1;
end;$$;
revoke all on function public.edit_trip(text,text,date,date,text[],bigint) from public,anon;
grant execute on function public.edit_trip(text,text,date,date,text[],bigint) to authenticated;
