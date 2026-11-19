-- Studio intelligence: demand gaps, voice DNAs and buyer-panel objections.
-- All four tables are org-scoped and get the same forced tenant_isolation
-- policy applied to the tenant tables in 0001_rls_and_grants.sql.

create table "demand_gaps" (
  "id" uuid primary key default gen_random_uuid() not null,
  "org_id" uuid not null,
  "creator_id" uuid not null,
  "product_id" uuid,
  "theme" text not null,
  "rank" integer not null,
  "request_count" integer not null,
  "buyer_language_hits" integer not null,
  "existing_product_matches" integer not null,
  "score_bps" integer not null,
  "strength" text not null,
  "example_phrasing" text,
  "product_concept" text not null,
  "evidence_caption_ids" text[] default '{}' not null,
  "model" text not null,
  "captions_used" integer not null,
  "created_at" timestamp with time zone default now() not null
);

alter table "demand_gaps" add constraint "demand_gaps_org_id_orgs_id_fk"
  foreign key ("org_id") references "public"."orgs"("id") on delete cascade on update no action;
alter table "demand_gaps" add constraint "demand_gaps_creator_id_creator_accounts_id_fk"
  foreign key ("creator_id") references "public"."creator_accounts"("id") on delete cascade on update no action;
alter table "demand_gaps" add constraint "demand_gaps_product_id_products_id_fk"
  foreign key ("product_id") references "public"."products"("id") on delete set null on update no action;

create index "demand_gaps_org_creator_idx" on "demand_gaps" ("org_id", "creator_id", "created_at");
create index "demand_gaps_product_idx" on "demand_gaps" ("product_id");

create table "voice_dnas" (
  "id" uuid primary key default gen_random_uuid() not null,
  "org_id" uuid not null,
  "creator_id" uuid not null,
  "tone" text[] not null,
  "top_phrases" text[] not null,
  "signature_stories" text[] not null,
  "never_says" text[] not null,
  "captions_used" integer not null,
  "model" text not null,
  "locked_at" timestamp with time zone,
  "locked_by" uuid,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

alter table "voice_dnas" add constraint "voice_dnas_org_id_orgs_id_fk"
  foreign key ("org_id") references "public"."orgs"("id") on delete cascade on update no action;
alter table "voice_dnas" add constraint "voice_dnas_creator_id_creator_accounts_id_fk"
  foreign key ("creator_id") references "public"."creator_accounts"("id") on delete cascade on update no action;
alter table "voice_dnas" add constraint "voice_dnas_locked_by_users_id_fk"
  foreign key ("locked_by") references "public"."users"("id") on delete set null on update no action;

create unique index "voice_dnas_org_creator_idx" on "voice_dnas" ("org_id", "creator_id");
create index "voice_dnas_creator_idx" on "voice_dnas" ("creator_id");

create table "buyer_panel_runs" (
  "id" uuid primary key default gen_random_uuid() not null,
  "org_id" uuid not null,
  "product_id" uuid not null,
  "model" text not null,
  "objections_count" integer not null,
  "created_at" timestamp with time zone default now() not null
);

alter table "buyer_panel_runs" add constraint "buyer_panel_runs_org_id_orgs_id_fk"
  foreign key ("org_id") references "public"."orgs"("id") on delete cascade on update no action;
alter table "buyer_panel_runs" add constraint "buyer_panel_runs_product_id_products_id_fk"
  foreign key ("product_id") references "public"."products"("id") on delete cascade on update no action;

create index "buyer_panel_runs_org_product_idx" on "buyer_panel_runs" ("org_id", "product_id", "created_at");

create table "buyer_objections" (
  "id" uuid primary key default gen_random_uuid() not null,
  "org_id" uuid not null,
  "product_id" uuid not null,
  "run_id" uuid not null,
  "persona" text not null,
  "objection" text not null,
  "fix" text not null,
  "status" text default 'open' not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

alter table "buyer_objections" add constraint "buyer_objections_org_id_orgs_id_fk"
  foreign key ("org_id") references "public"."orgs"("id") on delete cascade on update no action;
alter table "buyer_objections" add constraint "buyer_objections_product_id_products_id_fk"
  foreign key ("product_id") references "public"."products"("id") on delete cascade on update no action;
alter table "buyer_objections" add constraint "buyer_objections_run_id_buyer_panel_runs_id_fk"
  foreign key ("run_id") references "public"."buyer_panel_runs"("id") on delete cascade on update no action;

create index "buyer_objections_run_idx" on "buyer_objections" ("run_id");
create index "buyer_objections_org_product_status_idx" on "buyer_objections" ("org_id", "product_id", "status");

-- Forced tenant isolation, mirroring the policy block in 0001_rls_and_grants.sql.
alter table "demand_gaps" enable row level security;
alter table "demand_gaps" force row level security;
drop policy if exists tenant_isolation on "demand_gaps";
create policy tenant_isolation on "demand_gaps"
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

alter table "voice_dnas" enable row level security;
alter table "voice_dnas" force row level security;
drop policy if exists tenant_isolation on "voice_dnas";
create policy tenant_isolation on "voice_dnas"
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

alter table "buyer_panel_runs" enable row level security;
alter table "buyer_panel_runs" force row level security;
drop policy if exists tenant_isolation on "buyer_panel_runs";
create policy tenant_isolation on "buyer_panel_runs"
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);

alter table "buyer_objections" enable row level security;
alter table "buyer_objections" force row level security;
drop policy if exists tenant_isolation on "buyer_objections";
create policy tenant_isolation on "buyer_objections"
  using (org_id = nullif(current_setting('app.org_id', true), '')::uuid)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::uuid);
