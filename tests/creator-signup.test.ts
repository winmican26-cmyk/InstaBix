import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { canAccessOperator, canManage, canReview, CREATOR_ROLE, hasOperatorMembership, type Role } from "@/lib/auth/roles";
import { hashPassword, passwordIssues, verifyPassword } from "@/lib/auth/password";
import {
  CREATOR_SIGNUP_APPLIED_STATE,
  CREATOR_SIGNUP_CONSENT_VERSION,
  CREATOR_SIGNUP_RATE_KEY_PREFIX,
  CREATOR_SIGNUP_RATE_LIMIT,
  CREATOR_SIGNUP_RATE_WINDOW_SECONDS,
  creatorConsentErrors,
  validateCreatorSignup,
} from "@/lib/creator-signup";

const validInput = {
  fullName: "Ada Okafor",
  username: "@Ada.Builds",
  email: "Ada@Example.COM",
  password: "correct-horse-42",
  niche: "Home systems",
  audienceAsk: "They keep asking for the exact weekly meal plan and the matching shopping list.",
};

describe("creator signup validation", () => {
  it("normalizes the handle and email on a valid application", () => {
    const result = validateCreatorSignup(validInput);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.handle).toBe("ada.builds");
    expect(result.value.email).toBe("ada@example.com");
  });

  it("requires both consent checkboxes", () => {
    expect(creatorConsentErrors(null, null)).toEqual({
      consent: expect.any(String),
      terms: expect.any(String),
    });
    expect(creatorConsentErrors("on", null)).toEqual({ terms: expect.any(String) });
    expect(creatorConsentErrors("on", "on")).toEqual({});
  });

  it("reuses the operator password policy", () => {
    const result = validateCreatorSignup({ ...validInput, password: "short1" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors.password).toContain("at least 12");
    expect(passwordIssues("lettersOnlyButLong")).toContain("Include at least one number.");
  });

  it("rejects malformed handles, emails and thin audience answers", () => {
    const badHandle = validateCreatorSignup({ ...validInput, username: "bad handle!" });
    expect(badHandle.ok).toBe(false);
    if (!badHandle.ok) expect(badHandle.fieldErrors.username).toBeDefined();

    const badEmail = validateCreatorSignup({ ...validInput, email: "not-an-email" });
    expect(badEmail.ok).toBe(false);
    if (!badEmail.ok) expect(badEmail.fieldErrors.email).toBeDefined();

    const thinAnswer = validateCreatorSignup({ ...validInput, audienceAsk: "help" });
    expect(thinAnswer.ok).toBe(false);
    if (!thinAnswer.ok) expect(thinAnswer.fieldErrors.audienceAsk).toBeDefined();
  });
});

describe("creator access policy", () => {
  const operatorRoles: Role[] = ["owner", "admin", "operator", "reviewer"];

  it("denies only the creator role on the operator surface", () => {
    expect(canAccessOperator(CREATOR_ROLE)).toBe(false);
    for (const role of operatorRoles) expect(canAccessOperator(role)).toBe(true);
  });

  it("denies an unknown or future role instead of granting operator access", () => {
    expect(canAccessOperator("future_role" as Role)).toBe(false);
  });

  it("never gives a creator manage or review power", () => {
    expect(canManage(CREATOR_ROLE)).toBe(false);
    expect(canReview(CREATOR_ROLE)).toBe(false);
  });

  it("requires an explicit operator membership before workspace creation or onboarding", () => {
    expect(hasOperatorMembership([])).toBe(false);
    expect(hasOperatorMembership(["creator"])).toBe(false);
    expect(hasOperatorMembership(["creator", "operator"])).toBe(true);
    expect(hasOperatorMembership(["future_role" as Role])).toBe(false);
  });

  it("caps public registration at five attempts per network per hour", () => {
    expect(CREATOR_SIGNUP_RATE_KEY_PREFIX).toBe("creator-signup:");
    expect(CREATOR_SIGNUP_RATE_LIMIT).toBe(5);
    expect(CREATOR_SIGNUP_RATE_WINDOW_SECONDS).toBe(3600);
  });
});

describe("applied-state contract", () => {
  it("matches the real /apply state and records an explicit consent version", () => {
    expect(CREATOR_SIGNUP_APPLIED_STATE).toEqual({
      source: "applied",
      status: "new",
      consentStatus: "granted",
      emailSource: "creator_provided",
    });
    expect(CREATOR_SIGNUP_CONSENT_VERSION).toMatch(/^creator-signup-v\d+$/);
  });

  it("keeps scrypt password hashing verifiable", async () => {
    const hash = await hashPassword(validInput.password);
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword(validInput.password, hash)).toBe(true);
    expect(await verifyPassword("wrong-password-42", hash)).toBe(false);
  });
});

/**
 * These are high-risk invariants of the server action itself. They cannot be
 * observed through a pure function, so we guard the source of the transaction
 * against regressing to an owner role or a fabricated verified state.
 */
describe("creator signup transaction invariants", () => {
  const actionSource = readFile(new URL("../src/app/creator/signup/actions.ts", import.meta.url), "utf8");

  it("always inserts the creator role, never owner or admin", async () => {
    const source = await actionSource;
    expect(source).toContain("role: CREATOR_ROLE");
    expect(source).not.toContain('role: "owner"');
    expect(source).not.toContain('role: "admin"');
  });

  it("writes an unverified email state with no verification grant", async () => {
    const source = await actionSource;
    expect(source).toContain("emailVerifiedAt: null");
    expect(source).not.toContain("emailVerifiedAt: new Date()");
  });
});

/**
 * requireUser() alone is not an operator authorization check. These guards keep
 * the two entry points that historically bypassed getWorkspace() from silently
 * dropping the creator deny again.
 */
describe("operator entry-point guards", () => {
  it("blocks creator sessions from minting an owner workspace", async () => {
    const source = await readFile(new URL("../src/lib/actions/org.ts", import.meta.url), "utf8");
    expect(source).toContain("hasOperatorMembership");
    expect(source).toContain("A creator account cannot create an operator workspace.");
  });

  it("blocks creator sessions from operator onboarding aggregates", async () => {
    const source = await readFile(new URL("../src/app/onboarding/page.tsx", import.meta.url), "utf8");
    expect(source).toContain("hasOperatorMembership");
    expect(source).toContain('redirect("/creator")');
  });
});
