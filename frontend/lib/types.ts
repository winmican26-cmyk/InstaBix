/** Shapes returned by the VistaBix FastAPI service. Fields are optional so a
 * changed backend response degrades to an explicit state instead of a crash. */

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export interface SplitShare {
  creator?: number;
  vistabix?: number;
}

export interface SplitRules {
  first_product?: SplitShare;
  subsequent_products?: SplitShare;
  unit?: string;
}

export interface WhopStatus {
  mode?: string;
  configured?: boolean;
  mock?: boolean;
  publish_ready?: boolean;
  account_id?: string | null;
  api_base?: string | null;
  api_version_date?: string | null;
  note?: string;
  branding?: string;
  publish_endpoint?: string;
}

export interface HealthResponse {
  status?: string;
  version?: string;
  env?: string;
  branding?: string;
  database?: string;
  whop?: WhopStatus;
  api_key_required?: boolean;
}

export interface ListResponse<T> {
  items?: T[];
  count?: number;
}

export interface Creator {
  id?: number;
  name?: string;
  handle?: string;
  platform?: string;
  niche?: string;
  followers?: number;
  median_views?: number;
  qualified?: boolean;
  qualification_score?: number;
  status?: string;
  created_at?: string | null;
}

export interface OutreachMessage {
  id?: number;
  creator_id?: number;
  creator_name?: string | null;
  direction?: string;
  status?: string;
  subject?: string;
  approved?: boolean;
  created_at?: string | null;
}

export interface Product {
  id?: number;
  creator_id?: number;
  creator_name?: string | null;
  title?: string;
  slug?: string;
  status?: string;
  price_cents?: number;
  is_first_product?: boolean;
  split?: {
    creator_bps?: number;
    platform_bps?: number;
    creator_share?: number;
    platform_share?: number;
  };
  whop_product_id?: string | null;
  published_at?: string | null;
}

export interface Sale {
  id?: number;
  product_id?: number;
  product_title?: string | null;
  whop_sale_id?: string;
  currency?: string;
  gross_cents?: number;
  refunded_cents?: number;
  net_cents?: number;
  creator_cents?: number;
  platform_cents?: number;
  status?: string;
  created_at?: string | null;
}

export interface RevenueSummary {
  sales_count?: number;
  gross_cents?: number;
  refunded_cents?: number;
  net_cents?: number;
  creator_cents?: number;
  vistabix_cents?: number;
}

export interface RevenueResponse {
  summary?: RevenueSummary;
  splits?: SplitRules;
  items?: Sale[];
}

export interface SettingsResponse {
  branding?: string;
  niches?: string[];
  splits?: SplitRules;
  whop?: WhopStatus;
  sender_name?: string;
  support_email?: string | null;
  outreach_paused?: boolean;
  public_app_url?: string;
}
