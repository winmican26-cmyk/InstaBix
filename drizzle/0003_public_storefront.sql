-- Public storefront: a product that is published can be read by anyone, and so can
-- its chapter list. Nothing unpublished, and no creator contact details, are exposed.
drop policy if exists public_published_products on products;
create policy public_published_products on products
  for select
  using (status = 'published');

drop policy if exists public_published_chapters on chapters;
create policy public_published_chapters on chapters
  for select
  using (
    exists (
      select 1 from products p
      where p.id = chapters.product_id and p.status = 'published'
    )
  );

-- Meta's deauthorize and data-deletion callbacks arrive without a session, and they
-- identify an account rather than a tenant. These two functions are the narrowest
-- bridge: they expose the org ids that own an external account, nothing else.
create or replace function instagram_org_ids(p_external_id text)
returns setof uuid
language sql
security definer
set search_path = public
as $$
  select org_id from integrations
  where provider = 'instagram' and external_account_id = p_external_id
$$;

revoke all on function instagram_org_ids(text) from public;
grant execute on function instagram_org_ids(text) to instabix_app;
