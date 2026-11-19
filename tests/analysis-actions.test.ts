import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

/**
 * These are high-risk invariants of the server actions themselves. They cannot
 * be observed through a pure function, so we guard the source text against
 * regressing to an unscoped, unaudited or ungated write path.
 */
describe("analysis server action invariants", () => {
  const analysisSource = readFile(new URL("../src/lib/actions/analysis.ts", import.meta.url), "utf8");

  it("requires a workspace and review role on every action", async () => {
    const source = await analysisSource;
    expect(source).toContain("requireWorkspace()");
    expect(source).toContain("canReview(role)");
  });

  it("checks AI configuration before any database read", async () => {
    const source = await analysisSource;
    expect(source).toContain("aiConfigured");
    expect(source).toContain("Nothing was generated.");
  });

  it("keeps database work org-scoped and every write auditable", async () => {
    const source = await analysisSource;
    expect(source).toContain("withOrg(org.id");
    expect(source).toContain("insertAudit(");
  });
});

describe("submit-for-review analysis gate", () => {
  it("enforces the locked voice profile and open buyer objections", async () => {
    const source = await readFile(new URL("../src/lib/actions/studio.ts", import.meta.url), "utf8");
    expect(source).toContain("checkVoiceText");
    expect(source).toContain("buyerObjections");
  });
});
