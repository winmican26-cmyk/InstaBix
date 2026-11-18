"use server";

import { and, eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withOrg } from "@/lib/db";
import { agreements, consents, creatorAccounts, products } from "@/lib/db/schema";
import { insertAudit } from "@/lib/audit";
import { sha256 } from "@/lib/crypto";
import { logger, errorMessage } from "@/lib/logger";
import { agreementText, loadPortalData, resolvePortalToken } from "@/lib/portal";
import { checkRateLimit } from "@/lib/rate-limit";

export type PortalState = { error?: string; success?: string; fieldErrors?: Record<string, string> };

async function requestContext() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent")?.slice(0, 400) ?? null,
  };
}

const signSchema = z.object({
  signerName: z.string().trim().min(2, "Type your full name.").max(120),
  agreed: z.literal("on", { message: "Tick the box to confirm the terms." }),
});

export async function signAgreementAction(
  token: string,
  productId: string | null,
  _prev: PortalState,
  formData: FormData,
): Promise<PortalState> {
  const parsed = signSchema.safeParse({
    signerName: String(formData.get("signerName") ?? ""),
    agreed: String(formData.get("agreed") ?? ""),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  const tokenRow = await resolvePortalToken(token);
  if (!tokenRow) return { error: "This portal link is invalid or has expired. Ask the operator for a new one." };

  const { ip, userAgent } = await requestContext();
  const limit = await checkRateLimit(`portal-sign:${sha256(token).slice(0, 16)}`, 10, 60 * 60);
  if (!limit.ok) return { error: "Too many signing attempts. Try again later." };

  const data = await loadPortalData(tokenRow);
  if (!data) return { error: "This link no longer points at a creator record." };

  const inScope = productId ? data.products.filter((row) => row.product.id === productId) : data.products;
  if (inScope.length === 0) return { error: "There is no product in scope to sign for yet." };

  const document = agreementText({
    orgName: data.org.name,
    creatorName: data.creator.displayName ?? `@${data.creator.username}`,
    email: data.creator.contactEmail,
    products: inScope.map((row) => ({
      title: row.product.title,
      priceCents: row.product.priceCents,
      currency: row.product.currency,
      splitCreatorBps: row.product.splitCreatorBps,
    })),
  });
  const documentHash = sha256(document);

  try {
    const saved = await withOrg(tokenRow.orgId, async (tx) => {
      const [creator] = await tx
        .select({ id: creatorAccounts.id })
        .from(creatorAccounts)
        .where(eq(creatorAccounts.id, tokenRow.creatorId))
        .limit(1);
      if (!creator) return false;

      await tx.insert(agreements).values({
        orgId: tokenRow.orgId,
        creatorId: creator.id,
        productId,
        version: "2026-01",
        documentHash,
        signerName: parsed.data.signerName,
        signedAt: new Date(),
        ip,
        userAgent,
      });

      await tx.insert(consents).values({
        orgId: tokenRow.orgId,
        creatorId: creator.id,
        kind: "partnership_terms",
        granted: true,
        documentVersion: "2026-01",
        ip,
        userAgent,
      });

      await tx
        .update(creatorAccounts)
        .set({ consentStatus: "granted", consentAt: new Date(), updatedAt: new Date() })
        .where(eq(creatorAccounts.id, creator.id));

      await insertAudit(tx, {
        orgId: tokenRow.orgId,
        actorUserId: null,
        action: "agreement.signed",
        entityType: "agreement",
        entityId: documentHash.slice(0, 32),
        metadata: {
          creatorId: creator.id,
          productId,
          signerName: parsed.data.signerName,
          documentHash,
          channel: "creator_portal",
        },
        ip,
      });
      return true;
    });

    if (!saved) return { error: "This link no longer points at a creator record." };

    revalidatePath(`/c/${token}`);
    if (productId) revalidatePath(`/c/${token}/p/${productId}`);
    revalidatePath("/studio");
    return { success: `Signed. Document hash ${documentHash.slice(0, 16)}… stored with the agreement.` };
  } catch (error) {
    logger.error("portal.sign_failed", { message: errorMessage(error) });
    return { error: "The signature could not be stored. Nothing was saved." };
  }
}

export async function reviewProductAction(
  token: string,
  productId: string,
  decision: "approve" | "changes",
  note: string,
): Promise<PortalState> {
  const tokenRow = await resolvePortalToken(token);
  if (!tokenRow) return { error: "This portal link is invalid or has expired." };

  const { ip } = await requestContext();
  const trimmed = note.trim().slice(0, 2000);
  if (decision === "changes" && trimmed.length < 5) {
    return { error: "Tell the operator what to change (at least a short sentence)." };
  }

  try {
    const result = await withOrg(tokenRow.orgId, async (tx) => {
      const [product] = await tx
        .select()
        .from(products)
        .where(and(eq(products.id, productId), eq(products.creatorId, tokenRow.creatorId)))
        .limit(1);
      if (!product) return { error: "That product is not yours." } as const;
      if (product.status !== "review") return { error: "This product is not awaiting your review." } as const;

      if (decision === "approve") {
        const signed = await tx
          .select({ id: agreements.id })
          .from(agreements)
          .where(and(eq(agreements.creatorId, tokenRow.creatorId), sql`${agreements.signedAt} is not null`))
          .limit(1);
        if (signed.length === 0) return { error: "Sign the partnership terms before approving the product." } as const;
      }

      await tx
        .update(products)
        .set({ status: decision === "approve" ? "approved" : "outline_approved", updatedAt: new Date() })
        .where(eq(products.id, product.id));

      await insertAudit(tx, {
        orgId: tokenRow.orgId,
        actorUserId: null,
        action: decision === "approve" ? "product.creator_approved" : "product.creator_requested_changes",
        entityType: "product",
        entityId: product.id,
        metadata: { channel: "creator_portal", note: trimmed || null },
        ip,
      });

      return { ok: true } as const;
    });

    if ("error" in result) return { error: result.error };

    revalidatePath(`/c/${token}`);
    revalidatePath(`/c/${token}/p/${productId}`);
    revalidatePath("/studio");
    revalidatePath(`/studio/${productId}`);

    return {
      success:
        decision === "approve"
          ? "Approved. The operator can publish the product now."
          : "Changes requested. The product went back to the outline stage with your note in the audit trail.",
    };
  } catch (error) {
    logger.error("portal.review_failed", { message: errorMessage(error) });
    return { error: "The review could not be stored. Nothing was changed." };
  }
}

/** Marks the first time a portal link is opened, without making it single-use. */
export async function touchPortalToken(tokenRowId: string, orgId: string): Promise<void> {
  try {
    await withOrg(orgId, (tx) =>
      tx.execute(sql`update portal_tokens set used_at = now() where id = ${tokenRowId} and used_at is null`),
    );
  } catch (error) {
    logger.warn("portal.touch_failed", { message: errorMessage(error) });
  }
}
