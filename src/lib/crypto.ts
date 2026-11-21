import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

const keyCache = new Map<string, Buffer>();

function encryptionKey(): Buffer {
  const cached = keyCache.get("v1");
  if (cached) return cached;

  let key: Buffer;
  if (env.TOKEN_ENCRYPTION_KEY) {
    key = Buffer.from(env.TOKEN_ENCRYPTION_KEY, "base64");
    if (key.length !== 32) {
      throw new Error("TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.");
    }
  } else {
    // Development-only derivation. Production requires an explicit key (env.ts enforces it).
    key = Buffer.from(hkdfSync("sha256", env.AUTH_SECRET, "vistabix", "token-encryption-v1", 32));
  }
  keyCache.set("v1", key);
  return key;
}

/** AES-256-GCM. Output is safe to store in a text column. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptSecret(payload: string): string {
  const [version, ivB64, tagB64, dataB64] = payload.split(".");
  if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) throw new Error("Malformed encrypted secret.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64url")), decipher.final()]).toString("utf8");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function hmacSha256(secret: string, payload: string | Buffer): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function hmacBase64(secret: string, payload: string | Buffer): string {
  return createHmac("sha256", secret).update(payload).digest("base64");
}

export function hashObject(value: unknown): string {
  return sha256(JSON.stringify(value));
}
