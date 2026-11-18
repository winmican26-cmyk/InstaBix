-- Two surfaces are opened by people who are not signed in: a creator portal link and
-- a workspace invitation. Each request may read exactly the row whose hash matches the
-- token it presented, and nothing else. Every other row stays behind tenant isolation.

drop policy if exists portal_token_lookup on portal_tokens;
create policy portal_token_lookup on portal_tokens
  for select
  using (token_hash = nullif(current_setting('app.portal_token', true), ''));

drop policy if exists invite_token_lookup on invites;
create policy invite_token_lookup on invites
  for select
  using (token_hash = nullif(current_setting('app.invite_token', true), ''));

-- Expired tokens should not be the reason a query scans the whole table.
create index if not exists portal_tokens_expiry_idx on portal_tokens (expires_at);
create index if not exists invites_expiry_idx on invites (expires_at);
