-- Real creator self-registration needs two durable facts the 33-table schema
-- did not previously store: an honest email-verification state on the login,
-- and an explicit link from that login to the creator application.
--
-- NULL email_verified_at means "unverified". No signup path writes a verified
-- value; delivery stays deferred until a mail provider is actually configured.
alter table "users" add column "email_verified_at" timestamp with time zone;

alter table "creator_accounts" add column "user_id" uuid;
alter table "creator_accounts" add constraint "creator_accounts_user_id_users_id_fk"
  foreign key ("user_id") references "public"."users"("id") on delete set null on update no action;
create index "creators_user_idx" on "creator_accounts" ("user_id");
