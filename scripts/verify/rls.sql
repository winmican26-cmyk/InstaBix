-- Postgres-level proof of tenant isolation, token policies and the narrow
-- cross-tenant lookups. Everything runs in one transaction and is rolled back,
-- so it can be executed against the live database without leaving rows behind.
--
-- Usage:
--   docker exec -i vistabix-postgres psql -U vistabix -d vistabix -f - < scripts/verify/rls.sql

\pset pager off
\set ON_ERROR_STOP off

begin;

insert into orgs (id, name, slug) values
  ('11111111-1111-1111-1111-111111111111', 'RLS Tenant A', 'rls-tenant-a'),
  ('22222222-2222-2222-2222-222222222222', 'RLS Tenant B', 'rls-tenant-b');

insert into creator_accounts (id, org_id, username, source) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'rls_alpha', 'manual'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'rls_beta', 'manual');

insert into products (id, org_id, creator_id, title, status, price_cents) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Published product A', 'published', 4900),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Draft product A', 'draft', 4900);

insert into portal_tokens (id, org_id, creator_id, token_hash, expires_at) values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'hash-tenant-a', now() + interval '1 day'),
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'hash-tenant-b', now() + interval '1 day');

insert into orders (id, org_id, product_id, creator_id, stripe_session_id, amount_cents, currency, status) values
  ('99999999-9999-9999-9999-999999999999', '11111111-1111-1111-1111-111111111111', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cs_rls_verification', 4900, 'usd', 'paid');

\echo '--- Tenant A: only its own rows are visible ---'
select set_config('app.org_id', '11111111-1111-1111-1111-111111111111', true);
set local role vistabix_app;
select 'creators_tenant_a' as check, count(*) as rows from creator_accounts;
select 'products_tenant_a' as check, count(*) as rows from products;
reset role;

\echo '--- Tenant B: only its own rows are visible ---'
select set_config('app.org_id', '22222222-2222-2222-2222-222222222222', true);
set local role vistabix_app;
select 'creators_tenant_b' as check, count(*) as rows from creator_accounts;
select 'products_tenant_b' as check, count(*) as rows from products;
reset role;

\echo '--- Cross-tenant insert must be refused ---'
savepoint cross_tenant;
select set_config('app.org_id', '11111111-1111-1111-1111-111111111111', true);
set local role vistabix_app;
insert into creator_accounts (org_id, username, source)
values ('22222222-2222-2222-2222-222222222222', 'rls_sneaky', 'manual');
rollback to savepoint cross_tenant;
reset role;

\echo '--- No org scope: tenant tables are empty ---'
select set_config('app.org_id', '', true);
set local role vistabix_app;
select 'creators_without_scope' as check, count(*) as rows from creator_accounts;
select 'orders_without_scope' as check, count(*) as rows from orders;
reset role;

\echo '--- Portal token: exactly one token row, no creator rows ---'
select set_config('app.org_id', '', true);
select set_config('app.portal_token', 'hash-tenant-a', true);
set local role vistabix_app;
select 'portal_tokens_for_hash' as check, count(*) as rows from portal_tokens;
select 'creators_for_portal_hash' as check, count(*) as rows from creator_accounts;
reset role;

\echo '--- Public storefront: published products only, no drafts ---'
select set_config('app.portal_token', '', true);
set local role vistabix_app;
select 'public_products' as check, count(*) as rows from products;
select 'public_drafts' as check, count(*) as rows from products where status = 'draft';
reset role;

\echo '--- Security-definer lookup: provider event resolves its tenant ---'
set local role vistabix_app;
select 'order_org_for_session' as check, order_org_for_session('cs_rls_verification') as org_id;
reset role;

rollback;

\echo '--- Rolled back: no test rows remain ---'
select 'orgs_left' as check, count(*) as rows from orgs where slug like 'rls-tenant-%';
