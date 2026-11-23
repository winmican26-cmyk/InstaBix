-- Permissive policies are OR'd together, so public_published_products /
-- public_published_chapters can bypass tenant_isolation for a scoped session.
-- A RESTRICTIVE policy is AND'd with every permissive policy, closing that path.
-- It stays neutral when app.org_id is unset so the anonymous storefront keeps
-- working: published rows from all orgs, no drafts.

do $$
declare
  t text;
  tenant_tables text[] := array[
    'audit_events','invites','integrations',
    'creator_accounts','creator_snapshots','media','scores','portal_tokens','consents','suppressions',
    'campaigns','sequences','sequence_steps','messages','message_events','replies',
    'products','chapters','drafts','citations','agreements',
    'orders','refunds','ledger_entries','statements'
  ];
begin
  foreach t in array tenant_tables loop
    execute format('drop policy if exists no_cross_tenant_when_scoped on %I', t);
    execute format(
      'create policy no_cross_tenant_when_scoped on %I as restrictive '
      'using (nullif(current_setting(''app.org_id'', true), '''')::uuid is null '
      'or org_id = nullif(current_setting(''app.org_id'', true), '''')::uuid) '
      'with check (nullif(current_setting(''app.org_id'', true), '''')::uuid is null '
      'or org_id = nullif(current_setting(''app.org_id'', true), '''')::uuid)',
      t
    );
  end loop;
end $$;
