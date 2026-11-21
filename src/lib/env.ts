import { z } from "zod";

// Empty credential nodes are placeholders waiting for real values. Treat them
// as unset so a prepared .env can boot without accidentally enabling a provider.
const optionalString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().min(1).optional(),
);

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DATABASE_URL_ADMIN: optionalString,

  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  TOKEN_ENCRYPTION_KEY: optionalString,

  META_APP_ID: optionalString,
  META_APP_SECRET: optionalString,
  META_REDIRECT_URI: optionalString,
  META_WEBHOOK_VERIFY_TOKEN: optionalString,
  META_DISCOVERY_TOKEN: optionalString,
  META_DISCOVERY_IG_USER_ID: optionalString,
  META_SCOPES: optionalString,
  GRAPH_VERSION: z.string().default("v23.0"),

  RESEND_API_KEY: optionalString,
  OUTREACH_FROM: optionalString,
  EMAIL_FROM_DOMAIN: optionalString,
  OUTREACH_REPLY_TO: optionalString,
  OUTREACH_INBOX: optionalString,
  OUTREACH_PHYSICAL_ADDRESS: optionalString,

  STRIPE_SECRET_KEY: optionalString,
  STRIPE_WEBHOOK_SECRET: optionalString,

  ANTHROPIC_API_KEY: optionalString,
  AI_MODEL: z.string().default("claude-sonnet-4-5"),

  GOOGLE_DOCS_CLIENT_ID: optionalString,
  GOOGLE_DOCS_CLIENT_SECRET: optionalString,
  GOOGLE_DOCS_REFRESH_TOKEN: optionalString,
  GOOGLE_DOCS_EXPORT_USER_EMAIL: optionalString,

  PLAGIARISM_API_KEY: optionalString,
  AI_DETECTION_API_KEY: optionalString,

  SENTRY_DSN: optionalString,
  POSTHOG_KEY: optionalString,

  SEED_EMAIL: z.string().email().optional(),
  SEED_PASSWORD: z.string().min(10).optional(),
});

function parseEnv() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  • ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const env = parsed.data;

  if (env.NODE_ENV === "production" && !env.TOKEN_ENCRYPTION_KEY) {
    throw new Error("TOKEN_ENCRYPTION_KEY is required in production (32-byte base64).");
  }
  if (env.NODE_ENV === "production" && env.AUTH_SECRET.startsWith("dev-")) {
    throw new Error("Refusing to boot in production with a development AUTH_SECRET.");
  }
  return env;
}

export const env = parseEnv();

export const isProduction = env.NODE_ENV === "production";

export const metaConfigured = Boolean(env.META_APP_ID && env.META_APP_SECRET);
export const metaDiscoveryConfigured = Boolean(env.META_DISCOVERY_TOKEN && env.META_DISCOVERY_IG_USER_ID);
export const resendConfigured = Boolean(
  env.RESEND_API_KEY && env.OUTREACH_FROM && env.EMAIL_FROM_DOMAIN && env.OUTREACH_PHYSICAL_ADDRESS,
);
export const stripeConfigured = Boolean(env.STRIPE_SECRET_KEY);
export const aiConfigured = Boolean(env.ANTHROPIC_API_KEY);

export const metaRedirectUri =
  env.META_REDIRECT_URI ?? `${env.APP_URL.replace(/\/$/, "")}/api/integrations/instagram/callback`;
