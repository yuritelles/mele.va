-- Allow initial creation, still intersecting the existing owner policies and client gate.
-- OAuth cannot update/delete trips, apply imports, or change membership.
drop policy oauth_no_insert on public.trips;
drop policy oauth_no_insert on public.trip_baseline;
drop policy oauth_no_insert on public.trip_state;
