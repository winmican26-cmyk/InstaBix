"use server";

import { and, eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db, withOrg } from "@/lib/db";
import { consents, creatorAccounts, memberships, orgs, users } from "@/lib/db/schema";
import { insertAudit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { clientIpFromHeaders } from "@/lib/http";
import { createSession } from "@/lib/auth/session";
import { CREATOR_ROLE } from "@/lib/auth/roles";
import { hashPassword } from "@/lib/auth/password";
import {
  CREATOR_SIGNUP_APPLIED_STATE,
  CREATOR_SIGNUP_CONSENT_VERSION,
  CREATOR_SIGNUP_RATE_KEY_PREFIX,
  CREATOR_SIGNUP_RATE_LIMIT,
  CREATOR_SIGNUP_RATE_WINDOW_SECONDS,
  creatorConsentErrors,
  validateCreatorSignup,
} from "@/lib/creator-signup";

export type CreatorSignupState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

const DB_UNAVAILABLE = "The database is unavailable. Please try again shortly.";

function dbUnavailable(event: string, error: unknown): CreatorSignupState {
  logger.error(event, { message: error instanceof Error ? error.message : "unknown" });
  return { error: DB_UNAVAILABLE };
}

export async function creatorSignupAction(
  _prev: CreatorSignupState,
  formData: FormData,
): Promise<CreatorSignupState> {
  const consentErrors = creatorConsentErrors(formData.get("consent"), formData.get("terms"));
  if (Object.keys(consentErrors).length) return { fieldErrors: consentErrors };

  const validation = validateCreatorSignup({
    fullName: formData.get("fullName"),
    username: formData.get("username"),
    email: formData.get("email"),
    password: formData.get("password"),
    niche: formData.get("niche") ?? undefined,
    audienceAsk: formData.get("audienceAsk"),
  });
  if (!validation.ok) return { fieldErrors: validation.fieldErrors };
  const { value, handle } = validation;

  const h = await headers();
  const ip = clientIpFromHeaders(h) ?? "local";
  const userAgent = h.get("user-agent")?.slice(0, 400) ?? null;

  let limit: Awaited<ReturnType<typeof checkRateLimit>>;
  try {
    limit = await checkRateLimit(
      `${CREATOR_SIGNUP_RATE_KEY_PREFIX}${ip}`,
      CREATOR_SIGNUP_RATE_LIMIT,
      CREATOR_SIGNUP_RATE_WINDOW_SECONDS,
    );
  } catch (error) {
    return dbUnavailable("creator.signup.rate_limit_failed", error);
  }
  if (!limit.ok) return { error: "Too many accounts created from this network. Try again later." };

  const slug = process.env.PUBLIC_ORG_SLUG ?? "vistabix-hq";
  let orgRows: { id: string }[];
  try {
    orgRows = await db.select({ id: orgs.id }).from(orgs).where(eq(orgs.slug, slug)).limit(1);
  } catch (error) {
    return dbUnavailable("creator.signup.org_lookup_failed", error);
  }
  const org = orgRows[0];
  if (!org) return { error: "Creator registration is not open yet. The workspace operator still needs to finish setup." };

  // Fail early with a field-level message; the unique indexes below remain the
  // authoritative guard against concurrent duplicate registrations. The handle
  // lookup is org-scoped because creator_accounts has FORCE RLS, so it must bind
  // app.org_id just like the later write transaction.
  let emailRows: { id: string }[];
  let handleRows: { id: string }[];
  try {
    [emailRows, handleRows] = await Promise.all([
      db.select({ id: users.id }).from(users).where(eq(users.email, value.email)).limit(1),
      withOrg(org.id, (tx) =>
        tx
          .select({ id: creatorAccounts.id })
          .from(creatorAccounts)
          .where(and(eq(creatorAccounts.orgId, org.id), eq(creatorAccounts.username, handle)))
          .limit(1),
      ),
    ]);
  } catch (error) {
    return dbUnavailable("creator.signup.dedupe_failed", error);
  }
  if (emailRows.length) return { fieldErrors: { email: "An account already exists for this email." } };
  if (handleRows.length) return { fieldErrors: { username: "That handle is already registered." } };

  const passwordHash = await hashPassword(value.password);
  let session: { userId: string; orgId: string };
  try {
    session = await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.org_id', ${org.id}, true)`);

      const [user] = await tx
        .insert(users)
        .values({
          email: value.email,
          name: value.fullName,
          passwordHash,
          emailVerifiedAt: null,
        })
        .returning({ id: users.id });
      if (!user) throw new Error("User insert failed.");

      // A creator can never create an owner/admin membership for themselves.
      await tx.insert(memberships).values({ orgId: org.id, userId: user.id, role: CREATOR_ROLE });

      const [creator] = await tx
        .insert(creatorAccounts)
        .values({
          orgId: org.id,
          username: handle,
          displayName: value.fullName,
          niche: value.niche || null,
          source: CREATOR_SIGNUP_APPLIED_STATE.source,
          consentStatus: CREATOR_SIGNUP_APPLIED_STATE.consentStatus,
          consentAt: new Date(),
          contactEmail: value.email,
          emailSource: CREATOR_SIGNUP_APPLIED_STATE.emailSource,
          status: CREATOR_SIGNUP_APPLIED_STATE.status,
          notes: value.audienceAsk,
          createdBy: user.id,
          userId: user.id,
        })
        .returning({ id: creatorAccounts.id });
      if (!creator) throw new Error("Creator account insert failed.");

      await tx.insert(consents).values({
        orgId: org.id,
        creatorId: creator.id,
        kind: "partnership_application",
        granted: true,
        documentVersion: CREATOR_SIGNUP_CONSENT_VERSION,
        ip,
        userAgent,
      });

      await insertAudit(tx, {
        orgId: org.id,
        actorUserId: user.id,
        action: "creator.account_registered",
        entityType: "creator",
        entityId: creator.id,
        metadata: {
          username: handle,
          source: CREATOR_SIGNUP_APPLIED_STATE.source,
          status: CREATOR_SIGNUP_APPLIED_STATE.status,
          emailVerified: false,
          role: CREATOR_ROLE,
        },
        ip,
      });

      return { userId: user.id, orgId: org.id };
    });
  } catch (error) {
    logger.error("creator.signup.failed", { message: error instanceof Error ? error.message : "unknown" });
    return { error: "Could not create your creator account. Please try again." };
  }

  try {
    await createSession(session.userId, session.orgId);
  } catch (error) {
    return dbUnavailable("creator.signup.session_failed", error);
  }

  redirect("/creator");
}
