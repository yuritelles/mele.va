-- Run against an existing installation. All fixture writes roll back.
begin;
select set_config('test.owner_claims',jsonb_build_object('sub',t.owner_id,'email',u.email,'app_metadata',jsonb_build_object('provider','google'))::text,true) from public.trips t join auth.users u on u.id=t.owner_id limit 1;
set local role authenticated;
do $$ declare trip text;v bigint;n int;doc jsonb;begin
 perform set_config('request.jwt.claims',current_setting('test.owner_claims'),true);
 trip:=public.create_trip('Teste de edição','2028-12-30','2029-01-02',array['Lisboa']);
 v:=public.edit_trip(trip,'Nome atualizado','2028-12-29','2029-01-03',array['Lisboa','Porto'],0);
 select jsonb_array_length(data->'days') into n from public.trip_baseline where id=trip;
 if v<>1 or n<>6 or (select name from public.trips where id=trip)<>'Nome atualizado' then raise exception 'FAIL expansion';end if;
 begin perform public.edit_trip(trip,'Stale','2028-12-29','2029-01-03',array['Lisboa'],0);raise exception 'FAIL stale accepted';exception when others then if sqlerrm like 'FAIL%' then raise;end if;end;
 v:=public.edit_trip(trip,'Teste','2028-12-30','2029-01-02',array['Lisboa'],1);
 if v<>2 then raise exception 'FAIL trim blank days';end if;
 doc:='{"state":{"2029-01-01":{"user-test":{"id":"user-test","title":"Pernoite","category":"hotel","kind":"main","start":1320,"end":1800,"note":""}}},"restaurants":[]}';
 perform public.save_trip_v2(trip,2,doc);
 begin perform public.edit_trip(trip,'Teste','2028-12-30','2029-01-01',array['Lisboa'],3);raise exception 'FAIL overnight clipped';exception when others then if sqlerrm like 'FAIL%' then raise;end if;end;
 if (select revision from public.trip_state where id=trip)<>3 then raise exception 'FAIL partial update';end if;
 insert into public.trip_members(trip_id,email,role) values(trip,'metadata-editor@example.invalid','editor');
 perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000009","email":"metadata-editor@example.invalid","app_metadata":{"provider":"google"}}',true);
 begin perform public.edit_trip(trip,'Forbidden','2028-12-30','2029-01-02',array['Lisboa'],3);raise exception 'FAIL editor changed metadata';exception when others then if sqlerrm like 'FAIL%' then raise;end if;end;
end;$$;
rollback;
select 'PASS: rename, expand, trim blank dates, preserve overnight, stale revision and owner-only access' as result;
