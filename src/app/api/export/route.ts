import { and, asc, desc, eq } from "drizzle-orm";
import { withOrg } from "@/lib/db";
import {
  agreements,
  auditEvents,
  chapters,
  creatorAccounts,
  ledgerEntries,
  orders,
  products,
} from "@/lib/db/schema";
import { getWorkspace } from "@/lib/auth/session";
import { insertAudit } from "@/lib/audit";
import { clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const workspace = await getWorkspace();
  if (!workspace) return Response.json({ error: "Sign in to export a workspace." }, { status: 401 });

  const { org, user } = workspace;

  const data = await withOrg(org.id, async (tx) => {
    const creatorRows = await tx
      .select({
        id: creatorAccounts.id,
        username: creatorAccounts.username,
        displayName: creatorAccounts.displayName,
        status: creatorAccounts.status,
        source: creatorAccounts.source,
        consentStatus: creatorAccounts.consentStatus,
        consentAt: creatorAccounts.consentAt,
        contactEmail: creatorAccounts.contactEmail,
        emailSource: creatorAccounts.emailSource,
        niche: creatorAccounts.niche,
        notes: creatorAccounts.notes,
        createdAt: creatorAccounts.createdAt,
      })
      .from(creatorAccounts)
      .where(and(eq(creatorAccounts.orgId, org.id), eq(creatorAccounts.consentStatus, "granted")))
      .orderBy(asc(creatorAccounts.createdAt));

    const productRows = await tx
      .select()
      .from(products)
      .where(eq(products.orgId, org.id))
      .orderBy(asc(products.createdAt));
    const chapterRows = await tx
      .select({
        id: chapters.id,
        productId: chapters.productId,
        position: chapters.position,
        title: chapters.title,
        summary: chapters.summary,
        content: chapters.content,
        wordCount: chapters.wordCount,
      })
      .from(chapters)
      .where(eq(chapters.orgId, org.id))
      .orderBy(asc(chapters.productId), asc(chapters.position));
    const orderRows = await tx
      .select()
      .from(orders)
      .where(eq(orders.orgId, org.id))
      .orderBy(asc(orders.createdAt));
    const ledgerRows = await tx
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.orgId, org.id))
      .orderBy(asc(ledgerEntries.createdAt));
    const agreementRows = await tx
      .select()
      .from(agreements)
      .where(eq(agreements.orgId, org.id))
      .orderBy(asc(agreements.createdAt));
    const auditRows = await tx
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.orgId, org.id))
      .orderBy(desc(auditEvents.createdAt))
      .limit(5000);

    await insertAudit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: "org.exported",
      entityType: "org",
      entityId: org.id,
      metadata: { format: "json", creators: creatorRows.length, orders: orderRows.length },
      ip: clientIp(request),
    });

    return {
      exportedAt: new Date().toISOString(),
      organisation: { id: org.id, name: org.name, slug: org.slug, createdAt: org.createdAt },
      creators: creatorRows,
      products: productRows,
      chapters: chapterRows,
      orders: orderRows,
      ledgerEntries: ledgerRows,
      agreements: agreementRows,
      auditEvents: auditRows,
    };
  });

  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="vistabix-${org.slug}-${new Date().toISOString().slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
}
