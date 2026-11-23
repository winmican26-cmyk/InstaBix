import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Plain file-content assertions: CI must keep `npm run verify` as the single
// gate command, and the workflow must run on pushes and pull requests.
const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");

describe("CI verify gate", () => {
  it("runs npm run verify in the verify job", () => {
    expect(workflow).toMatch(/^on:\s*$/m);
    expect(workflow).toMatch(/^jobs:\s*\n\s+verify:\s*$/m);
    expect(workflow).toMatch(/^\s+name:\s+verify\s*$/m);
    expect(workflow).toContain("run: npm run verify");
  });

  it("triggers on push and pull_request", () => {
    expect(workflow).toMatch(/^\s+push:\s*$/m);
    expect(workflow).toMatch(/^\s+pull_request:\s*$/m);
  });
});
