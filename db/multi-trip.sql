create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
create table public.trips (
 id text primary key default gen_random_uuid()::text,
 owner_id uuid not null references auth.users(id),
 name text not null check(length(trim(name)) between 1 and 120),
 start_date date not null, end_date date not null,
 destinations text[] not null default '{}', context text not null default '' check(length(context)<=12000),
 created_at timestamptz not null default now(), check(end_date>=start_date and end_date-start_date<=365)
);
create index trips_owner_idx on public.trips(owner_id);
create table public.trip_members (
 trip_id text not null references public.trips(id) on delete cascade,
 email text not null check(email=lower(trim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 role text not null check(role in ('editor','viewer')),created_at timestamptz not null default now(),primary key(trip_id,email)
);
create index trip_members_email_idx on public.trip_members(email);
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
create function private.trip_role(target text) returns text language sql stable security definer set search_path='' as $$
 select case when t.owner_id=auth.uid() then 'owner' else m.role end
 from public.trips t left join public.trip_members m on m.trip_id=t.id
 and m.email=lower(auth.jwt()->>'email')
 where t.id=target and auth.uid() is not null and auth.jwt()->'app_metadata'->>'provider'='google'
 and (t.owner_id=auth.uid() or m.email is not null) limit 1;
$$;
revoke all on function private.trip_role(text) from public,anon;
grant execute on function private.trip_role(text) to authenticated;
create policy trips_read on public.trips for select to authenticated using((owner_id=auth.uid() and auth.jwt()->'app_metadata'->>'provider'='google') or private.trip_role(id) is not null);
create policy trips_create on public.trips for insert to authenticated with check(owner_id=auth.uid() and auth.jwt()->'app_metadata'->>'provider'='google');
create policy trips_edit on public.trips for update to authenticated using(private.trip_role(id)='owner') with check(owner_id=auth.uid());
create policy members_read on public.trip_members for select to authenticated using(private.trip_role(trip_id)='owner' or email=lower(auth.jwt()->>'email'));
create policy members_insert on public.trip_members for insert to authenticated with check(private.trip_role(trip_id)='owner');
create policy members_update on public.trip_members for update to authenticated using(private.trip_role(trip_id)='owner') with check(private.trip_role(trip_id)='owner');
create policy members_delete on public.trip_members for delete to authenticated using(private.trip_role(trip_id)='owner');
revoke all on public.trips,public.trip_members from anon,authenticated;
grant select,insert on public.trips to authenticated;
grant update(name,context) on public.trips to authenticated;
grant select,insert,delete on public.trip_members to authenticated;
grant update(role) on public.trip_members to authenticated;
-- Resolve existing ownership from the authenticated account, without replacing travel data.
insert into public.trips(id,owner_id,name,start_date,end_date,destinations)
select b.id,u.id,'Ásia 2027',(select min((d->>'date')::date) from jsonb_array_elements(b.data->'days') d),(select max((d->>'date')::date) from jsonb_array_elements(b.data->'days') d),array(select distinct jsonb_array_elements_text(d->'cities') from jsonb_array_elements(b.data->'days') d)
from public.trip_baseline b join auth.users u on lower(u.email)=current_setting('app.migration_owner_email') where b.id='asia-2027';
insert into public.trip_members(trip_id,email,role) select id,current_setting('app.migration_editor_email'),'editor' from public.trips where id='asia-2027';
alter table public.trip_baseline add constraint baseline_trip_fk foreign key(id) references public.trips(id);
alter table public.trip_state add constraint state_trip_fk foreign key(id) references public.trips(id);
drop policy read_baseline on public.trip_baseline;
drop policy read_state on public.trip_state;
drop policy edit_state on public.trip_state;
create policy read_baseline on public.trip_baseline for select to authenticated using(private.trip_role(id) is not null);
create policy insert_baseline on public.trip_baseline for insert to authenticated with check(private.trip_role(id)='owner');
create policy edit_baseline on public.trip_baseline for update to authenticated using(private.trip_role(id) in ('owner','editor')) with check(private.trip_role(id) in ('owner','editor'));
create policy read_state on public.trip_state for select to authenticated using(private.trip_role(id) is not null);
create policy insert_state on public.trip_state for insert to authenticated with check(private.trip_role(id)='owner');
create policy edit_state on public.trip_state for update to authenticated using(private.trip_role(id) in ('owner','editor')) with check(private.trip_role(id) in ('owner','editor'));
grant insert on public.trip_baseline,public.trip_state to authenticated;
grant update(data) on public.trip_baseline to authenticated;
create function public.create_trip(trip_name text,first_day date,last_day date,cities text[]) returns text language plpgsql security invoker set search_path='' as $$
declare key text; days jsonb;
begin
 if auth.uid() is null or array_length(cities,1) is null or array_length(cities,1)>50 or exists(select 1 from unnest(cities) c where length(trim(c)) not between 1 and 100) then raise exception 'Informe destinos válidos'; end if;
 insert into public.trips(owner_id,name,start_date,end_date,destinations) values(auth.uid(),trim(trip_name),first_day,last_day,cities) returning id into key;
 select jsonb_agg(jsonb_build_object('date',to_char(d,'YYYY-MM-DD'),'cities',to_jsonb(cities),'blocks','[]'::jsonb,'overnight',null) order by d) into days from generate_series(first_day::timestamp,last_day::timestamp,interval '1 day') d;
 insert into public.trip_baseline values(key,jsonb_build_object('days',days,'reservations','[]'::jsonb,'restaurants','[]'::jsonb,'sheetLodging',0));
 insert into public.trip_state(id,document) values(key,'{"state":{},"restaurants":[]}');return key;
end;$$;
create function public.my_trip_role(trip_id text) returns text language sql stable security invoker set search_path='' as $$select private.trip_role(trip_id);$$;
create function public.save_trip_v2(trip_id text,expected_revision bigint,new_document jsonb) returns setof public.trip_state language plpgsql security invoker set search_path='' as $$
begin
 if jsonb_typeof(new_document->'state') is distinct from 'object' or jsonb_typeof(new_document->'restaurants') is distinct from 'array' or octet_length(new_document::text)>2000000 then raise exception 'Invalid document'; end if;
 return query update public.trip_state set document=new_document,revision=revision+1,updated_at=now() where id=trip_id and revision=expected_revision returning *;
end;$$;
create table public.trip_history(id bigint generated always as identity primary key,trip_id text not null references public.trips(id),actor_id uuid,actor_email text,revision bigint,action text not null,created_at timestamptz not null default now());
create index trip_history_trip_idx on public.trip_history(trip_id,created_at desc);
alter table public.trip_history enable row level security;
revoke all on public.trip_history from anon,authenticated;
grant select on public.trip_history to authenticated;
create policy history_read on public.trip_history for select to authenticated using(private.trip_role(trip_id) is not null);
create function private.audit_trip() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or private.trip_role(new.id) not in ('owner','editor') then raise exception 'Not authorized';end if;
 insert into public.trip_history(trip_id,actor_id,actor_email,revision,action) values(new.id,auth.uid(),auth.jwt()->>'email',new.revision,'Planejamento atualizado');return new;
end;$$;
revoke all on function private.audit_trip() from public,anon,authenticated;
create trigger trip_state_audit after update on public.trip_state for each row execute function private.audit_trip();
revoke all on function public.create_trip(text,date,date,text[]),public.my_trip_role(text),public.save_trip_v2(text,bigint,jsonb) from public,anon;
grant execute on function public.create_trip(text,date,date,text[]),public.my_trip_role(text),public.save_trip_v2(text,bigint,jsonb) to authenticated;
