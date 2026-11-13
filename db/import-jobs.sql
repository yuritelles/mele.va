create table public.import_jobs(id uuid primary key default gen_random_uuid(),trip_id text not null references public.trips(id),created_by uuid not null default auth.uid(),label text not null check(length(label) between 1 and 120),created_at timestamptz not null default now());
create table public.import_items(job_id uuid not null references public.import_jobs(id),source_key text not null check(length(source_key) between 1 and 200),payload jsonb not null check(octet_length(payload::text)<=30000),status text not null default 'pending' check(status in ('pending','applied')),primary key(job_id,source_key));
create table public.import_sources(trip_id text not null references public.trips(id),source_key text not null,job_id uuid not null references public.import_jobs(id),applied_at timestamptz not null default now(),primary key(trip_id,source_key));
alter table public.import_jobs enable row level security;alter table public.import_items enable row level security;alter table public.import_sources enable row level security;
create index import_jobs_trip_idx on public.import_jobs(trip_id);
create policy jobs_read on public.import_jobs for select to authenticated using(private.trip_role(trip_id) is not null);
create policy jobs_create on public.import_jobs for insert to authenticated with check(created_by=auth.uid() and private.trip_role(trip_id) in ('owner','editor'));
create policy items_read on public.import_items for select to authenticated using(exists(select 1 from public.import_jobs j where j.id=job_id));
create policy items_create on public.import_items for insert to authenticated with check(exists(select 1 from public.import_jobs j where j.id=job_id and private.trip_role(j.trip_id) in ('owner','editor')));
create policy items_edit on public.import_items for update to authenticated using(exists(select 1 from public.import_jobs j where j.id=job_id and private.trip_role(j.trip_id) in ('owner','editor'))) with check(exists(select 1 from public.import_jobs j where j.id=job_id and private.trip_role(j.trip_id) in ('owner','editor')));
create policy sources_read on public.import_sources for select to authenticated using(private.trip_role(trip_id) is not null);
create policy sources_create on public.import_sources for insert to authenticated with check(private.trip_role(trip_id) in ('owner','editor'));
revoke all on public.import_jobs,public.import_items,public.import_sources from anon,authenticated;
grant select,insert on public.import_jobs,public.import_items,public.import_sources to authenticated;
grant update(status) on public.import_items to authenticated;
create function public.stage_import(job uuid,batch jsonb) returns integer language plpgsql security invoker set search_path='' as $$
declare item jsonb;n integer:=0;existing jsonb;
begin
 if jsonb_typeof(batch) is distinct from 'array' or jsonb_array_length(batch)>50 then raise exception 'Máximo de 50 itens por lote';end if;
 for item in select value from jsonb_array_elements(batch) loop
 if item->>'source_key' is null or jsonb_typeof(item->'payload') is distinct from 'object' then raise exception 'Item inválido';end if;
 select payload into existing from public.import_items where job_id=job and source_key=item->>'source_key';
 if found then if existing<>item->'payload' then raise exception 'Origem já cadastrada com conteúdo diferente. Use uma chave de revisão distinta.';end if;
 else insert into public.import_items(job_id,source_key,payload) values(job,item->>'source_key',item->'payload');n:=n+1;end if;
 end loop;return n;
end;$$;
create function public.commit_import(job uuid,source_keys text[],expected_revision bigint) returns bigint language plpgsql security invoker set search_path='' as $$
declare target text;doc jsonb;base jsonb;version bigint;r record;p jsonb;activity jsonb;item_id text;day text;count_new integer:=0;
begin
 select trip_id into target from public.import_jobs where id=job;
 if target is null or coalesce(private.trip_role(target),'') not in ('owner','editor') then raise exception 'Acesso negado';end if;
 if coalesce(array_length(source_keys,1),0) not between 1 and 50 then raise exception 'Selecione de 1 a 50 itens';end if;
 select document,revision into doc,version from public.trip_state where id=target for update;
 if version<>expected_revision then raise exception 'A viagem mudou. Atualize antes de importar.';end if;
 select data into base from public.trip_baseline where id=target;
 for r in select * from public.import_items where job_id=job and source_key=any(source_keys) and status='pending' for update loop
 if exists(select 1 from public.import_sources where trip_id=target and source_key=r.source_key) then update public.import_items set status='applied' where job_id=job and source_key=r.source_key;continue;end if;
 p:=r.payload;item_id:='import-'||md5(r.source_key);
 if p->>'kind'='activity' then
 day:=p->>'date';activity:=p->'activity';
 if not exists(select 1 from jsonb_array_elements(base->'days') d where d->>'date'=day) then raise exception 'Data fora da viagem';end if;
 if jsonb_typeof(activity) is distinct from 'object' or coalesce(length(trim(activity->>'title')),0) not between 1 and 120 or coalesce(activity->>'category','') not in ('hotel','transport','tour','meal') or coalesce(activity->>'kind','')<>'main' or jsonb_typeof(activity->'start') is distinct from 'number' or jsonb_typeof(activity->'end') is distinct from 'number' then raise exception 'Atividade incompleta';end if;
 if (activity->>'start')::numeric<>trunc((activity->>'start')::numeric) or (activity->>'end')::numeric<>trunc((activity->>'end')::numeric) or (activity->>'start')::integer<0 or (activity->>'end')::integer<(activity->>'start')::integer or (activity->>'end')::integer>43200 or length(coalesce(activity->>'note',''))>600 then raise exception 'Horário ou observações inválidos';end if;
 activity:=activity||jsonb_build_object('id',item_id,'note',coalesce(activity->>'note',''));
 doc:=jsonb_set(doc,array['state',day],coalesce(doc->'state'->day,'{}')||jsonb_build_object(item_id,activity),true);
 elsif p->>'kind'='restaurant' then
 if coalesce(length(trim(p->>'name')),0) not between 1 and 120 or coalesce(length(p->>'note'),0)>600 or not exists(select 1 from jsonb_array_elements(base->'days') d where d->'cities' ? (p->>'city')) then raise exception 'Restaurante incompleto';end if;
 doc:=jsonb_set(doc,'{restaurants}',(doc->'restaurants')||jsonb_build_array(jsonb_build_object('id',item_id,'city',p->>'city','name',p->>'name','note',coalesce(p->>'note',''))));
 else raise exception 'Tipo não suportado: use activity ou restaurant';end if;
 insert into public.import_sources(trip_id,source_key,job_id) values(target,r.source_key,job);
 update public.import_items set status='applied' where job_id=job and source_key=r.source_key;count_new:=count_new+1;
 end loop;
 if count_new>0 then perform public.save_trip_v2(target,version,doc);version:=version+1;end if;
 return version;
end;$$;
revoke all on function public.stage_import(uuid,jsonb),public.commit_import(uuid,text[],bigint) from public,anon;
grant execute on function public.stage_import(uuid,jsonb),public.commit_import(uuid,text[],bigint) to authenticated;
