-- Org-scoped storage for the weekly creator-unlock free tier and the Pro
-- entitlement (D23). Safe to re-run: tables/indexes use IF NOT EXISTS and
-- policies are dropped before being recreated.

create table if not exists creator_unlocks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  creator_id uuid not null references creator_accounts(id) on delete cascade,
  unlocked_by uuid references users(id) on delete set null,
  week_start date not null,
  created_at timestamptz not null default now()
);

create unique index if not exists creator_unlocks_org_creator_week_idx
  on creator_unlocks (org_id, creator_id, week_start);
create index if not exists creator_unlocks_org_week_idx
  on creator_unlocks (org_id, week_start);

create table if not exists org_entitlements (
  org_id uuid primary key references orgs(id) on delete cascade,
  plan text not null default 'free',
  status text not null default 'inactive',
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

-- RLS is enforced even against the owner so no code path can bypass tenancy.
alter table creator_unlocks enable row level security;
alter table creator_unlocks force row level security;
alter table org_entitlements enable row level security;
alter table org_entitlements force row level security;

do $$
declare
  t text;
  tenant_tables text[] := array['creator_unlocks', 'org_entitlements'];
begin
  foreach t in array tenant_tables loop
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format(
      'create policy tenant_isolation on %I using (org_id = nullif(current_setting(''app.org_id'', true),'''')::uuid) with check (org_id = nullif(current_setting(''app.org_id'', true),'''')::uuid)',
      t
    );
  end loop;
end $$;

-- Same restrictive guard as 0007: neutral when app.org_id is unset, AND'd
-- with every permissive policy when it is set.
do $$
declare
  t text;
  tenant_tables text[] := array['creator_unlocks', 'org_entitlements'];
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

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'vistabix_app') then
    grant select, insert, update, delete on creator_unlocks, org_entitlements to vistabix_app;
  end if;
end $$;
