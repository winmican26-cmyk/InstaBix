-- InstaBix Stage 2 target schema (Postgres).
--
-- Documentation DDL only: the backend applies additive changes at runtime via
-- app/migrate.py, and tests use SQLite. This file records the intended end
-- state. Nothing here drops data. Integer cents and basis points remain the
-- authoritative money/split values; decimal columns are mirrors only.

CREATE TABLE IF NOT EXISTS creators (
    id                  INTEGER PRIMARY KEY,
    name                VARCHAR(120) NOT NULL,
    handle              VARCHAR(120) NOT NULL,
    platform            VARCHAR(32)  NOT NULL DEFAULT 'instagram',
    email               VARCHAR(320),
    niche               VARCHAR(64)  NOT NULL,
    followers           INTEGER      NOT NULL,
    median_views        INTEGER      NOT NULL,
    reels_in_range      INTEGER      NOT NULL DEFAULT 0,
    recent_reel_views   JSONB        NOT NULL DEFAULT '[]'::jsonb,
    ad_posts            INTEGER      NOT NULL DEFAULT 0,
    qualified           BOOLEAN      NOT NULL DEFAULT FALSE,
    qualification_score NUMERIC(5,2) NOT NULL DEFAULT 0,
    qualification       JSONB        NOT NULL DEFAULT '{}'::jsonb,
    engagement_rate     NUMERIC(10,6) NOT NULL DEFAULT 0,
    monetization_score  INTEGER      NOT NULL DEFAULT 100,
    top_reels           JSONB        NOT NULL DEFAULT '[]'::jsonb,
    content_pillars     JSONB        NOT NULL DEFAULT '[]'::jsonb,
    status              VARCHAR(32)  NOT NULL DEFAULT 'New',
    source              VARCHAR(32)  NOT NULL DEFAULT 'manual',
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_creators_platform_handle UNIQUE (platform, handle),
    CONSTRAINT uq_creators_handle UNIQUE (handle),
    CONSTRAINT ck_creators_followers CHECK (followers >= 0),
    CONSTRAINT ck_creators_median_views CHECK (median_views >= 0),
    CONSTRAINT ck_creators_reels CHECK (reels_in_range >= 0 AND reels_in_range <= 12),
    CONSTRAINT ck_creators_ad_posts CHECK (ad_posts >= 0),
    CONSTRAINT ck_creators_niche CHECK (niche IN (
        'Sports', 'Home', 'Finance', 'Parenting',
        'AI Tools for Small Business', 'Faith & Mindset'
    )),
    CONSTRAINT ck_creators_status CHECK (status IN (
        'New', 'Qualified', 'Contacted', 'Replied',
        'Shortlisted', 'Partnered', 'Rejected'
    )),
    CONSTRAINT ck_creators_monetization_score CHECK (monetization_score BETWEEN 0 AND 100)
);
CREATE INDEX IF NOT EXISTS ix_creators_handle ON creators (handle);
CREATE INDEX IF NOT EXISTS ix_creators_email ON creators (email);
CREATE INDEX IF NOT EXISTS ix_creators_niche ON creators (niche);
CREATE INDEX IF NOT EXISTS ix_creators_status ON creators (status);

CREATE TABLE IF NOT EXISTS campaigns (
    id                  INTEGER PRIMARY KEY,
    name                VARCHAR(120) NOT NULL,
    niche               VARCHAR(64)  NOT NULL,
    status              VARCHAR(32)  NOT NULL DEFAULT 'draft',
    creator_id          INTEGER,
    sequence_status     VARCHAR(32)  NOT NULL DEFAULT 'active',
    reply_classification VARCHAR(32),
    current_step        INTEGER      NOT NULL DEFAULT 1,
    next_followup_at    TIMESTAMPTZ,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_campaigns_creator_id UNIQUE (creator_id),
    CONSTRAINT fk_campaigns_creator FOREIGN KEY (creator_id)
        REFERENCES creators (id) ON DELETE SET NULL,
    CONSTRAINT ck_campaigns_current_step CHECK (current_step BETWEEN 1 AND 3)
);
CREATE INDEX IF NOT EXISTS ix_campaigns_creator_id ON campaigns (creator_id);

CREATE TABLE IF NOT EXISTS products (
    id                  INTEGER PRIMARY KEY,
    creator_id          INTEGER      NOT NULL REFERENCES creators (id) ON DELETE CASCADE,
    title               VARCHAR(160) NOT NULL,
    slug                VARCHAR(180) NOT NULL,
    niche               VARCHAR(64)  NOT NULL,
    price_cents         INTEGER      NOT NULL,
    price               NUMERIC(10,2),                 -- mirror of price_cents
    is_first_product    BOOLEAN      NOT NULL DEFAULT TRUE,
    split_creator_bps   INTEGER      NOT NULL,
    split_platform_bps  INTEGER      NOT NULL,
    split_creator       NUMERIC(5,2),                  -- mirror of bps / 10000
    split_operator      NUMERIC(5,2),                  -- mirror of bps / 10000
    status              VARCHAR(32)  NOT NULL DEFAULT 'draft',
    toc                 JSONB,
    target_words        INTEGER      NOT NULL DEFAULT 7000,
    word_count          INTEGER      NOT NULL DEFAULT 7000,
    branding            VARCHAR(16)  NOT NULL DEFAULT 'hybrid',
    whop_url            VARCHAR(500),
    content_md          TEXT,
    creator_approved    BOOLEAN      NOT NULL DEFAULT FALSE,
    approved_by         VARCHAR(160),
    approved_at         TIMESTAMPTZ,
    whop_product_id     VARCHAR(120),
    whop_plan_id        VARCHAR(120),
    bio_link            VARCHAR(500),
    story_templates     JSONB        NOT NULL DEFAULT '[]'::jsonb,
    launch_captions     JSONB        NOT NULL DEFAULT '[]'::jsonb,
    published_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_products_slug UNIQUE (slug),
    CONSTRAINT uq_products_whop_product_id UNIQUE (whop_product_id),
    CONSTRAINT ck_products_price CHECK (price_cents >= 0),
    CONSTRAINT ck_products_target_words CHECK (target_words >= 0),
    CONSTRAINT ck_products_word_count CHECK (word_count >= 0),
    CONSTRAINT ck_products_split_bps_sum CHECK (split_creator_bps + split_platform_bps = 10000),
    CONSTRAINT ck_products_split_mirror_sum CHECK (split_creator + split_operator = 1.00),
    CONSTRAINT ck_products_branding CHECK (branding IN ('hybrid', 'creator_only', 'instabix_only')),
    CONSTRAINT ck_products_status CHECK (status IN (
        'idea', 'toc_approved', 'draft', 'creator_approved', 'live', 'rejected'
    ))
);
CREATE INDEX IF NOT EXISTS ix_products_creator_id ON products (creator_id);
CREATE INDEX IF NOT EXISTS ix_products_status ON products (status);

CREATE TABLE IF NOT EXISTS emails (
    id                   INTEGER PRIMARY KEY,
    creator_id           INTEGER NOT NULL REFERENCES creators (id) ON DELETE CASCADE,
    campaign_id          INTEGER REFERENCES campaigns (id) ON DELETE SET NULL,
    direction            VARCHAR(16)  NOT NULL DEFAULT 'outbound',
    status               VARCHAR(24)  NOT NULL DEFAULT 'draft',
    template_key         VARCHAR(64),
    subject              VARCHAR(300) NOT NULL,
    body                 TEXT         NOT NULL,
    step                 INTEGER      NOT NULL DEFAULT 1,
    opened               BOOLEAN      NOT NULL DEFAULT FALSE,
    replied              BOOLEAN      NOT NULL DEFAULT FALSE,
    classification       VARCHAR(24),
    classification_detail JSONB,
    approved             BOOLEAN      NOT NULL DEFAULT FALSE,
    approved_by          VARCHAR(160),
    approved_at          TIMESTAMPTZ,
    sent_at              TIMESTAMPTZ,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_emails_step CHECK (step BETWEEN 1 AND 3)
);
CREATE INDEX IF NOT EXISTS ix_emails_creator_id ON emails (creator_id);
CREATE INDEX IF NOT EXISTS ix_emails_campaign_id ON emails (campaign_id);
CREATE INDEX IF NOT EXISTS ix_emails_status ON emails (status);

CREATE TABLE IF NOT EXISTS sales (
    id                  INTEGER PRIMARY KEY,
    product_id          INTEGER NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    creator_id          INTEGER NOT NULL REFERENCES creators (id) ON DELETE CASCADE,
    whop_sale_id        VARCHAR(160) NOT NULL,
    whop_order_id       VARCHAR(160),
    currency            VARCHAR(8)   NOT NULL DEFAULT 'usd',
    gross_cents         INTEGER      NOT NULL,
    refunded_cents      INTEGER      NOT NULL DEFAULT 0,
    net_cents           INTEGER      NOT NULL,
    creator_cents       INTEGER      NOT NULL,
    platform_cents      INTEGER      NOT NULL,
    creator_share_bps   INTEGER      NOT NULL,
    platform_share_bps  INTEGER      NOT NULL,
    amount              NUMERIC(12,2), -- mirror of gross_cents
    payout_creator      NUMERIC(12,2), -- mirror of creator_cents
    payout_operator     NUMERIC(12,2), -- mirror of platform_cents
    sold_at             TIMESTAMPTZ,
    status              VARCHAR(24)  NOT NULL DEFAULT 'paid',
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_sales_whop_sale_id UNIQUE (whop_sale_id),
    CONSTRAINT uq_sales_whop_order_id UNIQUE (whop_order_id),
    CONSTRAINT ck_sales_gross CHECK (gross_cents >= 0),
    CONSTRAINT ck_sales_refunded CHECK (refunded_cents >= 0 AND refunded_cents <= gross_cents),
    CONSTRAINT ck_sales_split CHECK (creator_cents >= 0 AND platform_cents >= 0)
);
CREATE INDEX IF NOT EXISTS ix_sales_product_id ON sales (product_id);
CREATE INDEX IF NOT EXISTS ix_sales_creator_id ON sales (creator_id);
CREATE INDEX IF NOT EXISTS ix_sales_whop_sale_id ON sales (whop_sale_id);
CREATE INDEX IF NOT EXISTS ix_sales_status ON sales (status);

CREATE TABLE IF NOT EXISTS settings (
    id         SERIAL PRIMARY KEY,
    key        VARCHAR(80) NOT NULL,
    value      JSONB       NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_settings_key UNIQUE (key)
);
