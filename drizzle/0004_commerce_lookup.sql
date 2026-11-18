-- Stripe webhooks identify an order, not a tenant. These functions are the narrow
-- lookup that lets a verified provider event find the workspace it belongs to.
create or replace function order_org_for_session(p_session text)
returns setof uuid
language sql
security definer
set search_path = public
as $$
  select org_id from orders where stripe_session_id = p_session
$$;

create or replace function order_org_for_payment_intent(p_payment_intent text)
returns setof uuid
language sql
security definer
set search_path = public
as $$
  select org_id from orders where stripe_payment_intent_id = p_payment_intent
$$;

revoke all on function order_org_for_session(text) from public;
revoke all on function order_org_for_payment_intent(text) from public;
grant execute on function order_org_for_session(text) to instabix_app;
grant execute on function order_org_for_payment_intent(text) to instabix_app;
