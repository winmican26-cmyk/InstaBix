do $$
declare
  t text;
begin
  foreach t in array array['users', 'memberships', 'orgs', 'sessions'] loop
    execute format('drop policy if exists auth_runtime on public.%I', t);
  end loop;
end $$;
