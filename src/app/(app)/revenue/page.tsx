import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CircleDollarSign, Download, Receipt, Scale, Wallet } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/session";
import { getRevenue } from "@/lib/db/queries";
import { stripeConfigured } from "@/lib/env";
import { PageHeader } from "@/components/ui/page-header";
import { Stat } from "@/components/ui/stat";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR, TableShell } from "@/components/ui/table";
import { formatCurrency, formatDate, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Revenue" };
export const dynamic = "force-dynamic";

const ACCOUNT_LABEL: Record<string, string> = {
  creator_payable: "Creator payable",
  operator_revenue: "Operator revenue",
  processing_fee: "Processing fee",
  tax: "Tax",
  refund: "Refund",
};

export default async function RevenuePage() {
  const { org } = await requireWorkspace();
  const data = await getRevenue(org.id);
  const net = data.totals.gross + data.totals.creator;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Commerce"
        title="Revenue"
        description="The ledger is the source of truth. Statements are derived from it, never the other way around."
        actions={
          <Button asChild variant="secondary" size="sm">
            <Link href="/api/export/ledger">
              <Download /> Export ledger
            </Link>
          </Button>
        }
      />

      {!stripeConfigured ? (
        <Alert tone="warning" title="Stripe is not connected">
          Checkout and payouts are disabled. Ledger arithmetic still works, and no order can be created without a real
          provider event.
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Operator net"
          value={formatCurrency(data.totals.gross)}
          hint="Credits minus debits on operator_revenue"
          icon={CircleDollarSign}
          tone="lime"
          provenance="ledger_entries"
        />
        <Stat
          label="Creator payable"
          value={formatCurrency(data.totals.creator)}
          hint="What the workspace owes creators"
          icon={Wallet}
          tone="violet"
          provenance="ledger_entries"
        />
        <Stat
          label="Processing fees"
          value={formatCurrency(data.totals.fees)}
          hint="Recorded as debits, never netted silently"
          icon={Receipt}
          provenance="ledger_entries"
        />
        <Stat
          label="Ledger entries"
          value={String(data.totals.entries)}
          hint={data.totals.entries === 0 ? "Nothing has been sold yet" : "Each entry is immutable"}
          icon={Scale}
          tone={data.totals.entries === 0 ? "default" : "amber"}
          provenance="ledger_entries"
        />
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Ledger</CardTitle>
            <CardDescription>
              Double-entry style. A sale credits both parties; a refund mirrors it exactly, so balances return to zero.
            </CardDescription>
          </div>
          <Badge tone={net >= 0 ? "lime" : "danger"}>{formatCurrency(net)} net</Badge>
        </CardHeader>
        <CardContent className="p-0">
          {data.entries.length === 0 ? (
            <EmptyState
              icon={Scale}
              title="No ledger entries"
              description="Test-mode purchases will appear here with their creator share, operator share and processing fee. A sum of zero is honest; a fake $12,480 is not."
              action={
                <Button asChild variant="secondary">
                  <Link href="/studio">
                    Open the studio <ArrowRight />
                  </Link>
                </Button>
              }
            />
          ) : (
            <TableShell>
              <Table>
                <THead>
                  <TR>
                    <TH>When</TH>
                    <TH>Account</TH>
                    <TH>Direction</TH>
                    <TH>Creator</TH>
                    <TH>Memo</TH>
                    <TH className="text-right">Amount</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.entries.map(({ entry, creatorUsername }) => (
                    <TR key={entry.id}>
                      <TD className="whitespace-nowrap font-mono text-[11px] text-faint">{timeAgo(entry.createdAt)}</TD>
                      <TD className="text-[12.5px]">{ACCOUNT_LABEL[entry.account] ?? entry.account}</TD>
                      <TD>
                        <Badge tone={entry.direction === "credit" ? "lime" : "amber"}>{entry.direction}</Badge>
                      </TD>
                      <TD className="text-[12px] text-muted">{creatorUsername ? `@${creatorUsername}` : "—"}</TD>
                      <TD className="max-w-[260px] truncate text-[11.5px] text-muted">{entry.memo ?? "—"}</TD>
                      <TD
                        className={
                          entry.direction === "credit"
                            ? "text-right font-mono text-[12.5px] text-lime"
                            : "text-right font-mono text-[12.5px] text-amber"
                        }
                      >
                        {entry.direction === "credit" ? "+" : "−"}
                        {formatCurrency(entry.amountCents)}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableShell>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Orders</CardTitle>
              <CardDescription>Provider ids are stored so a dispute can be traced.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {data.orders.length === 0 ? (
              <EmptyState icon={Receipt} title="No orders" description="A test-mode checkout is required before an order row exists." />
            ) : (
              <ul className="divide-y divide-line/70">
                {data.orders.map((order) => (
                  <li key={order.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[11.5px] text-fg">{order.stripeSessionId ?? order.id}</span>
                      <span className="block text-[10.5px] text-faint">{formatDate(order.createdAt)}</span>
                    </span>
                    <Badge tone={order.status === "paid" ? "lime" : order.status === "refunded" ? "amber" : "neutral"}>{order.status}</Badge>
                    <span className="font-mono text-[12px] text-fg">{formatCurrency(order.amountCents, order.currency)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Creator statements</CardTitle>
              <CardDescription>Period totals derived from ledger entries.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {data.statements.length === 0 ? (
              <EmptyState
                icon={Wallet}
                title="No statements issued"
                description="Statements are generated after a period closes with real ledger activity."
              />
            ) : (
              <ul className="divide-y divide-line/70">
                {data.statements.map(({ statement, creatorUsername }) => (
                  <li key={statement.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] text-fg">@{creatorUsername ?? "unknown"}</span>
                      <span className="block text-[10.5px] text-faint">
                        {formatDate(statement.periodStart)} – {formatDate(statement.periodEnd)}
                      </span>
                    </span>
                    <Badge tone={statement.status === "paid" ? "lime" : "neutral"}>{statement.status}</Badge>
                    <span className="font-mono text-[12px] text-fg">{formatCurrency(statement.creatorCents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-[11px] leading-5 text-faint">
        SPLIT NOTE · Creator share uses basis points, rounded to the cent, with the operator absorbing the remainder. Refunds
        reverse every line. See <span className="font-mono">src/lib/ledger.ts</span> and its unit tests.
      </p>
    </div>
  );
}
