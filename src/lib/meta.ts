import "server-only";
import { createHmac } from "node:crypto";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";

export type SignedRequest = {
  algorithm?: string;
  user_id?: string;
  issued_at?: number;
  expires?: number;
  [key: string]: unknown;
};

/**
 * Meta sends deauthorize and data-deletion callbacks as a `signed_request` field:
 * `<base64url payload>.<base64url hmac>`. The HMAC covers the encoded payload.
 */
export function parseSignedRequest(input: string): SignedRequest | null {
  if (!env.META_APP_SECRET) return null;
  const [encoded, signature] = input.split(".");
  if (!encoded || !signature) return null;

  const expected = createHmac("sha256", env.META_APP_SECRET).update(encoded).digest("base64url");
  if (expected.length !== signature.length || !safeEqual(expected, signature)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SignedRequest;
    if (payload.algorithm && payload.algorithm !== "HMAC-SHA256") return null;
    return payload;
  } catch {
    return null;
  }
}
