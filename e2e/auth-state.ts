import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const AUTH_STATE_PATH = resolve(process.cwd(), "test-results/auth-state.json");

export function envValue(key: string): string | undefined {
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  const match = raw.match(new RegExp(`^${key}=(.*)$`, "m"));
  const value = match?.[1]?.trim();
  return value ? value : undefined;
}

export const playwrightChannel =
  process.env.PLAYWRIGHT_CHANNEL ?? (process.platform === "win32" ? "chrome" : undefined);
