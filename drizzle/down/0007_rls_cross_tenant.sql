-- Reverses 0007 only: the restrictive tenant guard is removed, the original
-- tenant_isolation and public-storefront policies are left untouched.

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
  end loop;
end $$;
