import "server-only";
import { env } from "@/lib/env";

const IG_GRAPH = `https://graph.instagram.com/${env.GRAPH_VERSION}`;
const FB_GRAPH = `https://graph.facebook.com/${env.GRAPH_VERSION}`;

export class InstagramError extends Error {
  status: number;
  code?: number;
  type?: string;
  traceId?: string;

  constructor(message: string, status: number, code?: number, type?: string, traceId?: string) {
    super(message);
    this.name = "InstagramError";
    this.status = status;
    this.code = code;
    this.type = type;
    this.traceId = traceId;
  }
}

type GraphError = { error?: { message?: string; type?: string; code?: number; fbtrace_id?: string } };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000), cache: "no-store" });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new InstagramError("Instagram returned a non-JSON response.", response.status);
  }
  if (!response.ok) {
    const error = (json as GraphError)?.error;
    throw new InstagramError(
      error?.message ?? `Instagram request failed (${response.status}).`,
      response.status,
      error?.code,
      error?.type,
      error?.fbtrace_id,
    );
  }
  return json as T;
}

export type IgProfile = {
  id?: string;
  user_id?: string;
  username: string;
  name?: string;
  account_type?: string;
  profile_picture_url?: string;
  followers_count?: number;
  media_count?: number;
};

export type IgMedia = {
  id: string;
  caption?: string;
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
  /** Reels views, available only through Business Discovery; absent when not returned. */
  view_count?: number;
};

export function authorizeUrl(state: string, scopes = "instagram_business_basic"): string {
  if (!env.META_APP_ID) throw new InstagramError("META_APP_ID is not configured.", 500);
  const redirectUri = env.META_REDIRECT_URI ?? `${env.APP_URL.replace(/\/$/, "")}/api/integrations/instagram/callback`;
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.searchParams.set("client_id", env.META_APP_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", env.META_SCOPES ?? scopes);
  url.searchParams.set("state", state);
  return url.toString();
}

type ShortTokenResponse = { access_token: string; user_id?: string; permissions?: string };

export async function exchangeCode(code: string): Promise<ShortTokenResponse> {
  if (!env.META_APP_ID || !env.META_APP_SECRET) throw new InstagramError("Meta credentials are not configured.", 500);
  const redirectUri = env.META_REDIRECT_URI ?? `${env.APP_URL.replace(/\/$/, "")}/api/integrations/instagram/callback`;
  const body = new URLSearchParams({
    client_id: env.META_APP_ID,
    client_secret: env.META_APP_SECRET,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });
  return request<ShortTokenResponse>("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
}

export type LongToken = { access_token: string; token_type?: string; expires_in?: number };

export async function exchangeLongLived(shortToken: string): Promise<LongToken> {
  const url = new URL("https://graph.instagram.com/access_token");
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", env.META_APP_SECRET ?? "");
  url.searchParams.set("access_token", shortToken);
  return request<LongToken>(url.toString());
}

export async function refreshLongLived(token: string): Promise<LongToken> {
  const url = new URL("https://graph.instagram.com/refresh_access_token");
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", token);
  return request<LongToken>(url.toString());
}

export async function getProfile(token: string): Promise<IgProfile> {
  const url = new URL(`${IG_GRAPH}/me`);
  url.searchParams.set("fields", "user_id,username,account_type,profile_picture_url,followers_count,media_count");
  url.searchParams.set("access_token", token);
  return request<IgProfile>(url.toString());
}

export async function getMedia(token: string, igUserId: string, limit = 25): Promise<IgMedia[]> {
  const url = new URL(`${IG_GRAPH}/${igUserId}/media`);
  url.searchParams.set("fields", "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("access_token", token);
  const response = await request<{ data?: IgMedia[] }>(url.toString());
  return response.data ?? [];
}

/**
 * Business Discovery is part of the Instagram API with Facebook Login, not the
 * Instagram Login setup. It requires a token from a Facebook Login app whose
 * querying account is a professional account with the right permissions.
 * Without META_DISCOVERY_* configured, enrichment is disabled — never simulated.
 */
export type DiscoveryResult = { profile: IgProfile; media: IgMedia[]; raw: Record<string, unknown> };

export async function businessDiscovery(username: string): Promise<DiscoveryResult> {
  if (!env.META_DISCOVERY_TOKEN || !env.META_DISCOVERY_IG_USER_ID) {
    throw new InstagramError("Business Discovery is not configured. Add META_DISCOVERY_TOKEN and META_DISCOVERY_IG_USER_ID.", 501);
  }
  const fields = [
    `business_discovery.username(${username}){followers_count,media_count,media{id,caption,media_type,permalink,thumbnail_url,timestamp,like_count,comments_count,view_count}}`,
  ].join(",");
  const url = new URL(`${FB_GRAPH}/${env.META_DISCOVERY_IG_USER_ID}`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("access_token", env.META_DISCOVERY_TOKEN);

  const response = await request<{ business_discovery?: IgProfile & { media?: { data?: IgMedia[] } } }>(url.toString());
  const discovery = response.business_discovery;
  if (!discovery) throw new InstagramError("Business Discovery returned no profile. Check the handle and permissions.", 404);

  return {
    profile: discovery,
    media: discovery.media?.data ?? [],
    raw: response as Record<string, unknown>,
  };
}

/** Token refresh is required before the 60-day long-lived token expires. */
export function tokenExpiry(expiresInSeconds?: number): Date {
  const seconds = expiresInSeconds && expiresInSeconds > 0 ? expiresInSeconds : 55 * 86_400;
  return new Date(Date.now() + seconds * 1000);
}
