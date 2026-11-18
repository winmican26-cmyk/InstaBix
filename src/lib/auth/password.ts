import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize("NFKC"), salt, KEYLEN, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts;
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

  const salt = Buffer.from(saltB64!, "base64url");
  const expected = Buffer.from(hashB64!, "base64url");
  const derived = await scrypt(password.normalize("NFKC"), salt, expected.length, { N, r, p, maxmem: PARAMS.maxmem });
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export function passwordIssues(password: string): string[] {
  const issues: string[] = [];
  if (password.length < 12) issues.push("Use at least 12 characters.");
  if (password.length > 200) issues.push("Use fewer than 200 characters.");
  if (!/[a-zA-Z]/.test(password)) issues.push("Include at least one letter.");
  if (!/[0-9]/.test(password)) issues.push("Include at least one number.");
  return issues;
}
