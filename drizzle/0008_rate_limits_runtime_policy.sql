-- Supabase enables RLS by default on new public tables. `rate_limits` holds no
-- tenant data and is written only by the server-side limiter, but the runtime
-- role cannot upsert it when RLS is on (SQLSTATE 42501). Grant that role access
-- explicitly instead of disabling RLS or opening the table to anon/authenticated.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'vistabix_app') then
    execute 'drop policy if exists rate_limits_runtime on rate_limits';
    execute 'create policy rate_limits_runtime on rate_limits to vistabix_app using (true) with check (true)';
  end if;
end $$;
