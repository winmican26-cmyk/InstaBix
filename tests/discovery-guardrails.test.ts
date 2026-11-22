import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Static guard rails: the discovery flow must never grow a scraping path. */
function sourcesIn(directory: string): { path: string; source: string }[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) return sourcesIn(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [{ path: full, source: readFileSync(full, "utf8") }] : [];
  });
}

const discoverySources = [
  ...sourcesIn(join(process.cwd(), "src/lib/discovery")),
  { path: "src/app/api/discovery/batch/route.ts", source: readFileSync("src/app/api/discovery/batch/route.ts", "utf8") },
];
const instagramSources = sourcesIn(join(process.cwd(), "src/lib/instagram"));
const allSources = sourcesIn(join(process.cwd(), "src"));

describe("discovery no-scraping guard rails", () => {
  it("keeps the parser, orchestrator and route free of direct network calls and URLs", () => {
    for (const { path, source } of discoverySources) {
      expect(source, `${path} must not call fetch directly`).not.toContain("fetch(");
      expect(source, `${path} must not embed an outbound URL`).not.toContain("https://");
    }
  });

  it("allows only official Meta hosts in the Instagram client layer", () => {
    const allowedHosts = new Set([
      "graph.facebook.com",
      "graph.instagram.com",
      "api.instagram.com",
      "www.instagram.com",
    ]);
    for (const { path, source } of instagramSources) {
      for (const match of source.matchAll(/https:\/\/([a-z0-9.-]+)/gi)) {
        const host = (match[1] ?? "").toLowerCase();
        expect(allowedHosts.has(host), `${path} uses unapproved host ${host}`).toBe(true);
      }
    }
  });

  it("never imports a scraping package anywhere under src", () => {
    const packages = [
      "puppeteer",
      "playwright",
      "cheerio",
      "selenium-webdriver",
      "instagram-scraper",
      "instagram-private-api",
    ];
    for (const { path, source } of allSources) {
      for (const pkg of packages) {
        const pattern = new RegExp(`(?:from\\s+|import\\s+|require\\(\\s*)["']${pkg}(?:/[^"']*)?["']`, "i");
        expect(source, `${path} must not import ${pkg}`).not.toMatch(pattern);
      }
    }
  });
});
