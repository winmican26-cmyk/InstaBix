import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ───────────────────────────── enums ───────────────────────────── */

export const roleEnum = pgEnum("role", ["owner", "admin", "operator", "reviewer", "creator"]);
export const creatorSourceEnum = pgEnum("creator_source", ["applied", "invited", "manual", "discovery"]);
export const consentStatusEnum = pgEnum("consent_status", ["pending", "granted", "revoked"]);
export const creatorStatusEnum = pgEnum("creator_status", [
  "new",
  "reviewing",
  "qualified",
  "approved",
  "contacted",
  "negotiating",
  "partnered",
  "declined",
  "suppressed",
]);
export const emailSourceEnum = pgEnum("email_source", [
  "creator_provided",
  "public_business",
  "operator_entered",
  "none",
]);
export const integrationProviderEnum = pgEnum("integration_provider", [
  "instagram",
  "instagram_discovery",
  "resend",
  "stripe",
  "anthropic",
  "openai",
  "whop",
]);
export const integrationStatusEnum = pgEnum("integration_status", [
  "connected",
  "disconnected",
  "pending",
  "error",
]);
export const messageDirectionEnum = pgEnum("message_direction", ["outbound", "inbound"]);
export const messageStatusEnum = pgEnum("message_status", [
  "draft",
  "needs_approval",
  "approved",
  "scheduled",
  "sending",
  "sent",
  "delivered",
  "opened",
  "replied",
  "bounced",
  "complained",
  "failed",
  "canceled",
]);
export const productStatusEnum = pgEnum("product_status", [
  "draft",
  "outline_pending",
  "outline_approved",
  "generating",
  "review",
  "approved",
  "published",
  "paused",
]);
export const orderStatusEnum = pgEnum("order_status", ["pending", "paid", "refunded", "failed"]);
export const ledgerAccountEnum = pgEnum("ledger_account", [
  "creator_payable",
  "operator_revenue",
  "processing_fee",
  "tax",
  "refund",
]);
export const ledgerDirectionEnum = pgEnum("ledger_direction", ["credit", "debit"]);
export const classificationEnum = pgEnum("reply_classification", [
  "positive",
  "soft_positive",
  "negative",
  "no_response",
  "unsubscribe",
  "auto_reply",
  "unknown",
]);

/* ───────────────────────────── tenancy & identity ───────────────────────────── */

export const orgs = pgTable(
  "orgs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    settings: jsonb("settings").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("orgs_slug_idx").on(t.slug)],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull().default("operator"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("memberships_org_user_idx").on(t.orgId, t.userId),
    index("memberships_user_idx").on(t.userId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orgId: uuid("org_id").references(() => orgs.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)],
);

export const invites = pgTable(
  "invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: roleEnum("role").notNull().default("operator"),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("invites_token_idx").on(t.tokenHash), index("invites_org_idx").on(t.orgId)],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("audit_org_created_idx").on(t.orgId, t.createdAt)],
);

/* ───────────────────────────── integrations & infra ───────────────────────────── */

export const integrations = pgTable(
  "integrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    provider: integrationProviderEnum("provider").notNull(),
    status: integrationStatusEnum("status").notNull().default("disconnected"),
    externalAccountId: text("external_account_id"),
    externalUsername: text("external_username"),
    scopes: text("scopes").array().default([]).notNull(),
    tokenEncrypted: text("token_encrypted"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastError: text("last_error"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("integrations_org_provider_idx").on(t.orgId, t.provider)],
);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").references(() => orgs.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    status: text("status").notNull().default("queued"),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
    attempts: integer("attempts").notNull().default(0),
    runAt: timestamp("run_at", { withTimezone: true }).defaultNow().notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("jobs_status_run_idx").on(t.status, t.runAt)],
);

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    externalId: text("external_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("webhook_provider_external_idx").on(t.provider, t.externalId)],
);

export const featureFlags = pgTable(
  "feature_flags",
  {
    key: text("key").primaryKey(),
    enabled: boolean("enabled").notNull().default(false),
    description: text("description"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStart: timestamp("window_start", { withTimezone: true }).defaultNow().notNull(),
});

/* ───────────────────────────── creators ───────────────────────────── */

export const creatorAccounts = pgTable(
  "creator_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    username: text("username").notNull(),
    igUserId: text("ig_user_id"),
    displayName: text("display_name"),
    accountType: text("account_type"),
    bio: text("bio"),
    profilePictureUrl: text("profile_picture_url"),
    website: text("website"),
    niche: text("niche"),
    timezone: text("timezone"),
    source: creatorSourceEnum("source").notNull(),
    consentStatus: consentStatusEnum("consent_status").notNull().default("pending"),
    consentAt: timestamp("consent_at", { withTimezone: true }),
    contactEmail: text("contact_email"),
    emailSource: emailSourceEnum("email_source").notNull().default("none"),
    stripeAccountId: text("stripe_account_id"),
    stripeOnboardedAt: timestamp("stripe_onboarded_at", { withTimezone: true }),
    status: creatorStatusEnum("status").notNull().default("new"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("creators_org_username_idx").on(t.orgId, t.username),
    index("creators_org_status_idx").on(t.orgId, t.status),
    index("creators_org_created_idx").on(t.orgId, t.createdAt),
  ],
);

export const creatorSnapshots = pgTable(
  "creator_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => creatorAccounts.id, { onDelete: "cascade" }),
    followers: integer("followers").notNull(),
    mediaCount: integer("media_count").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).defaultNow().notNull(),
    apiVersion: text("api_version"),
    requestId: text("request_id"),
    raw: jsonb("raw").$type<Record<string, unknown>>().default({}).notNull(),
  },
  (t) => [index("snapshots_creator_captured_idx").on(t.creatorId, t.capturedAt)],
);

export const media = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => creatorAccounts.id, { onDelete: "cascade" }),
    igMediaId: text("ig_media_id").notNull(),
    mediaType: text("media_type"),
    caption: text("caption"),
    permalink: text("permalink"),
    thumbnailUrl: text("thumbnail_url"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    likeCount: integer("like_count").notNull().default(0),
    commentCount: integer("comment_count").notNull().default(0),
    viewCount: integer("view_count"),
    metricsCapturedAt: timestamp("metrics_captured_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("media_org_ig_idx").on(t.orgId, t.igMediaId),
    index("media_creator_posted_idx").on(t.creatorId, t.postedAt),
  ],
);

export const scores = pgTable(
  "scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => creatorAccounts.id, { onDelete: "cascade" }),
    modelVersion: text("model_version").notNull(),
    total: numeric("total", { precision: 5, scale: 2 }).notNull(),
    sampleSize: integer("sample_size").notNull(),
    factors: jsonb("factors").$type<Record<string, { value: number; weight: number; detail: string }>>().notNull(),
    inputsHash: text("inputs_hash").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("scores_creator_computed_idx").on(t.creatorId, t.computedAt)],
);

export const portalTokens = pgTable(
  "portal_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => creatorAccounts.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("portal_token_idx").on(t.tokenHash), index("portal_creator_idx").on(t.creatorId)],
);

export const consents = pgTable(
  "consents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    creatorId: uuid("creator_id").references(() => creatorAccounts.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    granted: boolean("granted").notNull(),
    documentVersion: text("document_version"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("consents_creator_idx").on(t.creatorId)],
);

export const suppressions = pgTable(
  "suppressions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("suppressions_org_email_idx").on(t.orgId, t.email)],
);

/* ───────────────────────────── outreach ───────────────────────────── */

export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    creatorId: uuid("creator_id").references(() => creatorAccounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("campaigns_org_idx").on(t.orgId)],
);

export const sequences = pgTable(
  "sequences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: text("status").notNull().default("draft"),
    dailyCap: integer("daily_cap").notNull().default(25),
    windowStartHour: integer("window_start_hour").notNull().default(9),
    windowEndHour: integer("window_end_hour").notNull().default(17),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("sequences_org_idx").on(t.orgId)],
);

export const sequenceSteps = pgTable(
  "sequence_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    sequenceId: uuid("sequence_id")
      .notNull()
      .references(() => sequences.id, { onDelete: "cascade" }),
    stepNumber: integer("step_number").notNull(),
    delayDays: integer("delay_days").notNull().default(0),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("steps_sequence_number_idx").on(t.sequenceId, t.stepNumber)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => creatorAccounts.id, { onDelete: "cascade" }),
    stepId: uuid("step_id").references(() => sequenceSteps.id, { onDelete: "set null" }),
    direction: messageDirectionEnum("direction").notNull().default("outbound"),
    channel: text("channel").notNull().default("email"),
    toEmail: text("to_email"),
    fromEmail: text("from_email"),
    subject: text("subject"),
    body: text("body").notNull(),
    status: messageStatusEnum("status").notNull().default("draft"),
    providerId: text("provider_id"),
    idempotencyKey: text("idempotency_key"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    repliedAt: timestamp("replied_at", { withTimezone: true }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("messages_idempotency_idx").on(t.orgId, t.idempotencyKey),
    index("messages_org_status_idx").on(t.orgId, t.status),
    index("messages_creator_idx").on(t.creatorId),
  ],
);

export const messageEvents = pgTable(
  "message_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("message_events_message_idx").on(t.messageId, t.createdAt)],
);

export const replies = pgTable(
  "replies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").references(() => messages.id, { onDelete: "set null" }),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => creatorAccounts.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    classification: classificationEnum("classification").notNull().default("unknown"),
    confidence: numeric("confidence", { precision: 4, scale: 3 }),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("replies_creator_idx").on(t.creatorId, t.receivedAt)],
);

/* ───────────────────────────── studio ───────────────────────────── */

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => creatorAccounts.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    promise: text("promise"),
    priceCents: integer("price_cents").notNull().default(4900),
    currency: text("currency").notNull().default("usd"),
    splitCreatorBps: integer("split_creator_bps").notNull().default(6000),
    splitOperatorBps: integer("split_operator_bps").notNull().default(4000),
    status: productStatusEnum("status").notNull().default("draft"),
    stripeProductId: text("stripe_product_id"),
    stripePriceId: text("stripe_price_id"),
    whopProductId: text("whop_product_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("products_org_status_idx").on(t.orgId, t.status)],
);

export const chapters = pgTable(
  "chapters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    content: text("content"),
    wordCount: integer("word_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("chapters_product_position_idx").on(t.productId, t.position)],
);

export const drafts = pgTable(
  "drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("draft"),
    wordCount: integer("word_count").notNull().default(0),
    model: text("model"),
    promptVersion: text("prompt_version"),
    content: text("content"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("drafts_product_idx").on(t.productId)],
);

export const citations = pgTable(
  "citations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => drafts.id, { onDelete: "cascade" }),
    passage: text("passage").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("citations_draft_idx").on(t.draftId)],
);

export const agreements = pgTable(
  "agreements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => creatorAccounts.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    version: text("version").notNull(),
    documentHash: text("document_hash").notNull(),
    signerName: text("signer_name"),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("agreements_creator_idx").on(t.creatorId)],
);

/* ───────────────────────────── commerce ───────────────────────────── */

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => creatorAccounts.id, { onDelete: "restrict" }),
    stripeSessionId: text("stripe_session_id"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    amountCents: integer("amount_cents").notNull(),
    feeCents: integer("fee_cents").notNull().default(0),
    currency: text("currency").notNull().default("usd"),
    status: orderStatusEnum("status").notNull().default("pending"),
    buyerEmail: text("buyer_email"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("orders_session_idx").on(t.stripeSessionId),
    index("orders_org_created_idx").on(t.orgId, t.createdAt),
  ],
);

export const refunds = pgTable("refunds", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => orgs.id, { onDelete: "cascade" }),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  stripeRefundId: text("stripe_refund_id"),
  amountCents: integer("amount_cents").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    creatorId: uuid("creator_id").references(() => creatorAccounts.id, { onDelete: "set null" }),
    account: ledgerAccountEnum("account").notNull(),
    direction: ledgerDirectionEnum("direction").notNull(),
    amountCents: integer("amount_cents").notNull(),
    memo: text("memo"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("ledger_org_created_idx").on(t.orgId, t.createdAt), index("ledger_creator_idx").on(t.creatorId)],
);

export const statements = pgTable(
  "statements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => creatorAccounts.id, { onDelete: "cascade" }),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    grossCents: integer("gross_cents").notNull(),
    creatorCents: integer("creator_cents").notNull(),
    operatorCents: integer("operator_cents").notNull(),
    status: text("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("statements_creator_idx").on(t.creatorId, t.periodEnd)],
);

export type Org = typeof orgs.$inferSelect;
export type User = typeof users.$inferSelect;
export type Creator = typeof creatorAccounts.$inferSelect;
export type CreatorSnapshot = typeof creatorSnapshots.$inferSelect;
export type MediaRow = typeof media.$inferSelect;
export type Score = typeof scores.$inferSelect;
export type Integration = typeof integrations.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;
