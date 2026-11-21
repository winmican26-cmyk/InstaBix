-- Tenant isolation, enforced by Postgres rather than by application discipline.
-- The runtime role is deliberately NOT the table owner and NOT a superuser.

create extension if not exists pg_trgm;

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
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format(
      'create policy tenant_isolation on %I using (org_id = nullif(current_setting(''app.org_id'', true), '''')::uuid) with check (org_id = nullif(current_setting(''app.org_id'', true), '''')::uuid)',
      t
    );
  end loop;
end $$;

-- Trigram search over handles and names without a separate search service.
create index if not exists creators_username_trgm_idx on creator_accounts using gin (username gin_trgm_ops);
create index if not exists creators_display_name_trgm_idx on creator_accounts using gin (display_name gin_trgm_ops);

-- The runtime role can read and write data, but cannot change the schema.
grant usage on schema public to vistabix_app;
grant select, insert, update, delete on all tables in schema public to vistabix_app;
grant usage, select on all sequences in schema public to vistabix_app;
alter default privileges in schema public grant select, insert, update, delete on tables to vistabix_app;
alter default privileges in schema public grant usage, select on sequences to vistabix_app;

-- Nothing in the runtime role should be able to bypass policy.
alter role vistabix_app nosuperuser;
