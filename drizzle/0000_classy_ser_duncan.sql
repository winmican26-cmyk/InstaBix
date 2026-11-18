CREATE TYPE "public"."reply_classification" AS ENUM('positive', 'soft_positive', 'negative', 'no_response', 'unsubscribe', 'auto_reply', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."consent_status" AS ENUM('pending', 'granted', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."creator_source" AS ENUM('applied', 'invited', 'manual', 'discovery');--> statement-breakpoint
CREATE TYPE "public"."creator_status" AS ENUM('new', 'reviewing', 'qualified', 'approved', 'contacted', 'negotiating', 'partnered', 'declined', 'suppressed');--> statement-breakpoint
CREATE TYPE "public"."email_source" AS ENUM('creator_provided', 'public_business', 'operator_entered', 'none');--> statement-breakpoint
CREATE TYPE "public"."integration_provider" AS ENUM('instagram', 'instagram_discovery', 'resend', 'stripe', 'anthropic', 'openai', 'whop');--> statement-breakpoint
CREATE TYPE "public"."integration_status" AS ENUM('connected', 'disconnected', 'pending', 'error');--> statement-breakpoint
CREATE TYPE "public"."ledger_account" AS ENUM('creator_payable', 'operator_revenue', 'processing_fee', 'tax', 'refund');--> statement-breakpoint
CREATE TYPE "public"."ledger_direction" AS ENUM('credit', 'debit');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('outbound', 'inbound');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('draft', 'needs_approval', 'approved', 'scheduled', 'sending', 'sent', 'delivered', 'opened', 'replied', 'bounced', 'complained', 'failed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'paid', 'refunded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('draft', 'outline_pending', 'outline_approved', 'generating', 'review', 'approved', 'published', 'paused');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('owner', 'admin', 'operator', 'reviewer', 'creator');--> statement-breakpoint
CREATE TABLE "agreements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"product_id" uuid,
	"version" text NOT NULL,
	"document_hash" text NOT NULL,
	"signer_name" text,
	"signed_at" timestamp with time zone,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"creator_id" uuid,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chapters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"content" text,
	"word_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "citations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"draft_id" uuid NOT NULL,
	"passage" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"creator_id" uuid,
	"kind" text NOT NULL,
	"granted" boolean NOT NULL,
	"document_version" text,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creator_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"username" text NOT NULL,
	"ig_user_id" text,
	"display_name" text,
	"account_type" text,
	"bio" text,
	"profile_picture_url" text,
	"website" text,
	"niche" text,
	"timezone" text,
	"source" "creator_source" NOT NULL,
	"consent_status" "consent_status" DEFAULT 'pending' NOT NULL,
	"consent_at" timestamp with time zone,
	"contact_email" text,
	"email_source" "email_source" DEFAULT 'none' NOT NULL,
	"stripe_account_id" text,
	"stripe_onboarded_at" timestamp with time zone,
	"status" "creator_status" DEFAULT 'new' NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creator_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"followers" integer NOT NULL,
	"media_count" integer NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"api_version" text,
	"request_id" text,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"word_count" integer DEFAULT 0 NOT NULL,
	"model" text,
	"prompt_version" text,
	"content" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"key" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"description" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"provider" "integration_provider" NOT NULL,
	"status" "integration_status" DEFAULT 'disconnected' NOT NULL,
	"external_account_id" text,
	"external_username" text,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"token_encrypted" text,
	"token_expires_at" timestamp with time zone,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "role" DEFAULT 'operator' NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"kind" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"order_id" uuid,
	"creator_id" uuid,
	"account" "ledger_account" NOT NULL,
	"direction" "ledger_direction" NOT NULL,
	"amount_cents" integer NOT NULL,
	"memo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"ig_media_id" text NOT NULL,
	"media_type" text,
	"caption" text,
	"permalink" text,
	"thumbnail_url" text,
	"posted_at" timestamp with time zone,
	"like_count" integer DEFAULT 0 NOT NULL,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"view_count" integer,
	"metrics_captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "role" DEFAULT 'operator' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"type" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"campaign_id" uuid,
	"creator_id" uuid NOT NULL,
	"step_id" uuid,
	"direction" "message_direction" DEFAULT 'outbound' NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"to_email" text,
	"from_email" text,
	"subject" text,
	"body" text NOT NULL,
	"status" "message_status" DEFAULT 'draft' NOT NULL,
	"provider_id" text,
	"idempotency_key" text,
	"scheduled_for" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"replied_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"stripe_session_id" text,
	"stripe_payment_intent_id" text,
	"amount_cents" integer NOT NULL,
	"fee_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"buyer_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orgs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"promise" text,
	"price_cents" integer DEFAULT 4900 NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"split_creator_bps" integer DEFAULT 6000 NOT NULL,
	"split_operator_bps" integer DEFAULT 4000 NOT NULL,
	"status" "product_status" DEFAULT 'draft' NOT NULL,
	"stripe_product_id" text,
	"stripe_price_id" text,
	"whop_product_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"stripe_refund_id" text,
	"amount_cents" integer NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"message_id" uuid,
	"creator_id" uuid NOT NULL,
	"body" text NOT NULL,
	"classification" "reply_classification" DEFAULT 'unknown' NOT NULL,
	"confidence" numeric(4, 3),
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"model_version" text NOT NULL,
	"total" numeric(5, 2) NOT NULL,
	"sample_size" integer NOT NULL,
	"factors" jsonb NOT NULL,
	"inputs_hash" text NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sequence_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"sequence_id" uuid NOT NULL,
	"step_number" integer NOT NULL,
	"delay_days" integer DEFAULT 0 NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"daily_cap" integer DEFAULT 25 NOT NULL,
	"window_start_hour" integer DEFAULT 9 NOT NULL,
	"window_end_hour" integer DEFAULT 17 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"org_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "statements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"gross_cents" integer NOT NULL,
	"creator_cents" integer NOT NULL,
	"operator_cents" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppressions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"email" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_creator_id_creator_accounts_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_creator_id_creator_accounts_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citations" ADD CONSTRAINT "citations_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citations" ADD CONSTRAINT "citations_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_creator_id_creator_accounts_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_accounts" ADD CONSTRAINT "creator_accounts_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_accounts" ADD CONSTRAINT "creator_accounts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_snapshots" ADD CONSTRAINT "creator_snapshots_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_snapshots" ADD CONSTRAINT "creator_snapshots_creator_id_creator_accounts_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_creator_id_creator_accounts_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_creator_id_creator_accounts_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_events" ADD CONSTRAINT "message_events_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_events" ADD CONSTRAINT "message_events_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_creator_id_creator_accounts_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_step_id_sequence_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."sequence_steps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_creator_id_creator_accounts_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_tokens" ADD CONSTRAINT "portal_tokens_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_tokens" ADD CONSTRAINT "portal_tokens_creator_id_creator_accounts_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_creator_id_creator_accounts_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replies" ADD CONSTRAINT "replies_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replies" ADD CONSTRAINT "replies_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replies" ADD CONSTRAINT "replies_creator_id_creator_accounts_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_creator_id_creator_accounts_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_steps" ADD CONSTRAINT "sequence_steps_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_steps" ADD CONSTRAINT "sequence_steps_sequence_id_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."sequences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequences" ADD CONSTRAINT "sequences_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequences" ADD CONSTRAINT "sequences_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statements" ADD CONSTRAINT "statements_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statements" ADD CONSTRAINT "statements_creator_id_creator_accounts_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppressions" ADD CONSTRAINT "suppressions_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agreements_creator_idx" ON "agreements" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "audit_org_created_idx" ON "audit_events" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "campaigns_org_idx" ON "campaigns" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chapters_product_position_idx" ON "chapters" USING btree ("product_id","position");--> statement-breakpoint
CREATE INDEX "citations_draft_idx" ON "citations" USING btree ("draft_id");--> statement-breakpoint
CREATE INDEX "consents_creator_idx" ON "consents" USING btree ("creator_id");--> statement-breakpoint
CREATE UNIQUE INDEX "creators_org_username_idx" ON "creator_accounts" USING btree ("org_id","username");--> statement-breakpoint
CREATE INDEX "creators_org_status_idx" ON "creator_accounts" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "creators_org_created_idx" ON "creator_accounts" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "snapshots_creator_captured_idx" ON "creator_snapshots" USING btree ("creator_id","captured_at");--> statement-breakpoint
CREATE INDEX "drafts_product_idx" ON "drafts" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "integrations_org_provider_idx" ON "integrations" USING btree ("org_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "invites_token_idx" ON "invites" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "invites_org_idx" ON "invites" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "jobs_status_run_idx" ON "jobs" USING btree ("status","run_at");--> statement-breakpoint
CREATE INDEX "ledger_org_created_idx" ON "ledger_entries" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "ledger_creator_idx" ON "ledger_entries" USING btree ("creator_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_org_ig_idx" ON "media" USING btree ("org_id","ig_media_id");--> statement-breakpoint
CREATE INDEX "media_creator_posted_idx" ON "media" USING btree ("creator_id","posted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_org_user_idx" ON "memberships" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "message_events_message_idx" ON "message_events" USING btree ("message_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_idempotency_idx" ON "messages" USING btree ("org_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "messages_org_status_idx" ON "messages" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "messages_creator_idx" ON "messages" USING btree ("creator_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_session_idx" ON "orders" USING btree ("stripe_session_id");--> statement-breakpoint
CREATE INDEX "orders_org_created_idx" ON "orders" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orgs_slug_idx" ON "orgs" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_token_idx" ON "portal_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "portal_creator_idx" ON "portal_tokens" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "products_org_status_idx" ON "products" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "replies_creator_idx" ON "replies" USING btree ("creator_id","received_at");--> statement-breakpoint
CREATE INDEX "scores_creator_computed_idx" ON "scores" USING btree ("creator_id","computed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "steps_sequence_number_idx" ON "sequence_steps" USING btree ("sequence_id","step_number");--> statement-breakpoint
CREATE INDEX "sequences_org_idx" ON "sequences" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "statements_creator_idx" ON "statements" USING btree ("creator_id","period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "suppressions_org_email_idx" ON "suppressions" USING btree ("org_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_provider_external_idx" ON "webhook_events" USING btree ("provider","external_id");