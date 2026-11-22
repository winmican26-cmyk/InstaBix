import { and, asc, eq } from "drizzle-orm";
import { withOrg } from "@/lib/db";
import { creatorAccounts, ledgerEntries, orders } from "@/lib/db/schema";
import { getWorkspace } from "@/lib/auth/session";
import { insertAudit } from "@/lib/audit";
import { clientIp } from "@/lib/http";
import { csvResponse, toCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const workspace = await getWorkspace();
  if (!workspace) return Response.json({ error: "Sign in to export the ledger." }, { status: 401 });
  const { org, user } = workspace;

  const rows = await withOrg(org.id, async (tx) => {
    const data = await tx
      .select({
        id: ledgerEntries.id,
        createdAt: ledgerEntries.createdAt,
        account: ledgerEntries.account,
        direction: ledgerEntries.direction,
        amountCents: ledgerEntries.amountCents,
        memo: ledgerEntries.memo,
        orderId: ledgerEntries.orderId,
        stripeSessionId: orders.stripeSessionId,
        orderStatus: orders.status,
        creatorUsername: creatorAccounts.username,
      })
      .from(ledgerEntries)
      .leftJoin(orders, eq(orders.id, ledgerEntries.orderId))
      .leftJoin(creatorAccounts, and(eq(creatorAccounts.id, ledgerEntries.creatorId), eq(creatorAccounts.orgId, org.id), eq(creatorAccounts.consentStatus, "granted")))
      .orderBy(asc(ledgerEntries.createdAt));

    await insertAudit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: "ledger.exported",
      entityType: "ledger_entry",
      entityId: null,
      metadata: { format: "csv", count: data.length },
      ip: clientIp(request),
    });

    return data;
  });

  const csv = toCsv(
    ["id", "created_at", "account", "direction", "amount_cents", "memo", "order_id", "stripe_session_id", "order_status", "creator_username"],
    rows.map((row) => [
      row.id,
      row.createdAt,
      row.account,
      row.direction,
      row.amountCents,
      row.memo,
      row.orderId,
      row.stripeSessionId,
      row.orderStatus,
      row.creatorUsername,
    ]),
  );

  return csvResponse(`vistabix-ledger-${new Date().toISOString().slice(0, 10)}.csv`, csv);
}
