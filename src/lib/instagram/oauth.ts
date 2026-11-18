import "server-only";
import { createHmac, randomUUID } from "node:crypto";
import { env } from "@/lib/env";

const STATE_TTL_MS = 10 * 60 * 1000;

type StatePayload = { orgId: string; userId: string; nonce: string; exp: number };

function sign(value: string): string {
  return createHmac("sha256", env.AUTH_SECRET).update(value).digest("base64url");
}

export function createOAuthState(orgId: string, userId: string): string {
  const payload: StatePayload = {
    orgId,
    userId,
    nonce: randomUUID(),
    exp: Date.now() + STATE_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifyOAuthState(state: string): StatePayload | null {
  const [encoded, signature] = state.split(".");
  if (!encoded || !signature) return null;
  const expected = sign(encoded);
  if (expected.length !== signature.length) return null;
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (!a.equals(b)) return null;
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as StatePayload;
    if (!payload.orgId || !payload.userId || !payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
