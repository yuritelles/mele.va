-- Public client identifier, never a secret. Enable this hook in Auth > Hooks after applying.
create or replace function public.mele_mcp_access_token(event jsonb)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare claims jsonb := event->'claims';
begin
 if claims->>'client_id' = '32bba8a0-da54-46c3-9a71-4c444c20136c' then
  claims := jsonb_set(claims, '{aud}', '"https://porzljqjsqlqutwtwyqb.supabase.co/functions/v1/mele-mcp"'::jsonb);
 end if;
 return jsonb_build_object('claims',claims);
end;$$;
revoke all on function public.mele_mcp_access_token(jsonb) from public,anon,authenticated;
grant execute on function public.mele_mcp_access_token(jsonb) to supabase_auth_admin;

-- RESTRICTIVE policies intersect existing membership policies, never grant membership.
create or replace function private.mele_client_allowed() returns boolean
language sql stable security invoker set search_path='' as $$
 select (auth.jwt()->>'client_id') is null or (
 auth.jwt()->>'client_id'='32bba8a0-da54-46c3-9a71-4c444c20136c'
 and auth.jwt()->>'aud'='https://porzljqjsqlqutwtwyqb.supabase.co/functions/v1/mele-mcp');
$$;
revoke all on function private.mele_client_allowed() from public,anon;
grant execute on function private.mele_client_allowed() to authenticated;
do $$ declare t text; begin
 foreach t in array array['trips','trip_members','trip_baseline','trip_state','trip_history','trip_access','import_jobs','import_items','import_sources'] loop
  execute format('create policy oauth_client_gate on public.%I as restrictive for all to authenticated using (private.mele_client_allowed()) with check (private.mele_client_allowed())',t);
  -- Only staging insertions are supported by this MCP version.
  if t not in ('import_jobs','import_items') then
   execute format('create policy oauth_no_insert on public.%I as restrictive for insert to authenticated with check ((auth.jwt()->>''client_id'') is null)',t);
  end if;
  execute format('create policy oauth_no_update on public.%I as restrictive for update to authenticated using ((auth.jwt()->>''client_id'') is null) with check ((auth.jwt()->>''client_id'') is null)',t);
  execute format('create policy oauth_no_delete on public.%I as restrictive for delete to authenticated using ((auth.jwt()->>''client_id'') is null)',t);
 end loop;
end;$$;
create policy oauth_pending_only on public.import_items as restrictive for insert to authenticated
 with check ((auth.jwt()->>'client_id') is null or status='pending');
