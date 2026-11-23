import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Source invariants only: this atom changes seed write logic, and the seed
// script itself must not be executed by the test suite.
const seedSource = readFileSync(new URL("../scripts/seed.ts", import.meta.url), "utf8");

describe("seed password idempotency", () => {
  it("computes the password hash once, after validation, for both branches", () => {
    expect(seedSource.match(/hashPassword\(password\)/g) ?? []).toHaveLength(1);
    expect(seedSource).toMatch(/const hash = await hashPassword\(password\);/);

    const guard = seedSource.indexOf("SEED_PASSWORD must be at least 12 characters.");
    const hashCall = seedSource.indexOf("hashPassword(password)");
    const poolCreation = seedSource.indexOf("new Pool(");
    expect(guard).toBeGreaterThan(-1);
    expect(hashCall).toBeGreaterThan(guard);
    expect(poolCreation).toBeGreaterThan(hashCall);

    expect(seedSource).toMatch(
      /insert into users \(email, name, password_hash\)[\s\S]*?\[email, "Workspace Owner", hash\]/,
    );
  });

  it("refreshes only password_hash when the seed user already exists", () => {
    const branch = seedSource.match(/if \(existingUser\.rowCount\) \{([\s\S]*?)\n {4}\} else \{/)?.[1] ?? "";
    expect(branch).not.toBe("");
    expect(branch).toMatch(/update users set password_hash = \$1 where id = \$2/i);
    expect(branch).toMatch(/\[hash, userId\]/);
    expect(branch).not.toMatch(/set[\s\S]*?(email|name)\s*=/i);
  });

  it("logs the password refresh", () => {
    expect(seedSource).toContain("refreshed password_hash from SEED_PASSWORD");
  });
});
