-- Reverses 0010 only: remove both policies from both tables, revoke the
-- runtime grants, then drop both tables. Guards keep this safe to re-run.

do $$
declare
  t text;
  tenant_tables text[] := array['creator_unlocks', 'org_entitlements'];
begin
  foreach t in array tenant_tables loop
    if to_regclass(format('public.%I', t)) is not null then
      execute format('drop policy if exists no_cross_tenant_when_scoped on %I', t);
      execute format('drop policy if exists tenant_isolation on %I', t);
    end if;
  end loop;
end $$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'vistabix_app') then
    if to_regclass('public.creator_unlocks') is not null then
      revoke select, insert, update, delete on creator_unlocks from vistabix_app;
    end if;
    if to_regclass('public.org_entitlements') is not null then
      revoke select, insert, update, delete on org_entitlements from vistabix_app;
    end if;
  end if;
end $$;

drop table if exists creator_unlocks;
drop table if exists org_entitlements;
