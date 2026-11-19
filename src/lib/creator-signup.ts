import { z } from "zod";
import { passwordIssues } from "@/lib/auth/password";
import { normalizeUsername } from "@/lib/utils";

/**
 * Pure creator-registration contract. This module has no `server-only`, database
 * or Next.js dependency so validation can be proven without a running app.
 */

export const CREATOR_SIGNUP_RATE_KEY_PREFIX = "creator-signup:";
export const CREATOR_SIGNUP_RATE_LIMIT = 5;
export const CREATOR_SIGNUP_RATE_WINDOW_SECONDS = 60 * 60;
export const CREATOR_SIGNUP_CONSENT_VERSION = "creator-signup-v1";

/** The applied-state contract written by signup, identical to /apply. */
export const CREATOR_SIGNUP_APPLIED_STATE = {
  source: "applied",
  status: "new",
  consentStatus: "granted",
  emailSource: "creator_provided",
} as const;

export const creatorSignupSchema = z.object({
  fullName: z.string().trim().min(2, "Tell us your name.").max(80),
  username: z.string().trim().min(2, "Enter your Instagram handle.").max(40),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(1, "Choose a password."),
  niche: z.string().trim().max(60).optional(),
  audienceAsk: z.string().trim().min(12, "Give us a sentence or two.").max(1200),
});

export type CreatorSignupInput = z.infer<typeof creatorSignupSchema>;

export type CreatorSignupValidation =
  | { ok: true; value: CreatorSignupInput; handle: string }
  | { ok: false; fieldErrors: Record<string, string> };

export function creatorConsentErrors(consent: unknown, terms: unknown): Record<string, string> {
  const errors: Record<string, string> = {};
  if (consent !== "on") errors.consent = "We need your consent to review the application.";
  if (terms !== "on") errors.terms = "Please confirm you have read the partnership terms.";
  return errors;
}

export function validateCreatorSignup(raw: Record<string, unknown>): CreatorSignupValidation {
  const parsed = creatorSignupSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, fieldErrors };
  }

  // Never weaken the operator password policy for creators.
  const issues = passwordIssues(parsed.data.password);
  if (issues.length) return { ok: false, fieldErrors: { password: issues.join(" ") } };

  const handle = normalizeUsername(parsed.data.username);
  if (!handle) {
    return { ok: false, fieldErrors: { username: "Use a valid handle (letters, numbers, dots, underscores)." } };
  }

  return { ok: true, value: parsed.data, handle };
}
