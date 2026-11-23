-- Password and Google sign-in both write non-tenant bootstrap rows. RLS stays
-- enabled on these tables; only the runtime role gets a permissive policy.
do $$
declare
  t text;
begin
  foreach t in array array['users', 'memberships', 'orgs', 'sessions'] loop
    execute format('drop policy if exists auth_runtime on public.%I', t);
    execute format('create policy auth_runtime on public.%I to vistabix_app using (true) with check (true)', t);
  end loop;
end $$;
