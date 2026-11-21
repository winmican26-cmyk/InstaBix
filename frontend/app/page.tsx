import { connection } from "next/server";
import type { ReactNode } from "react";

import { api } from "../lib/api";
import type { SplitRules } from "../lib/types";

// Next.js 16: read env and backend data per request, never at build time.
export const dynamic = "force-dynamic";

export default async function Page() {
  await connection();

  // Requests are started together; each result is a value, so one failed
  // endpoint cannot throw the whole page into an error boundary.
  const [health, scout, outreach, products, whop, revenue, settings] =
    await Promise.all([
      api.health(),
      api.scout(),
      api.outreach(),
      api.products(),
      api.whop(),
      api.revenue(),
      api.settings(),
    ]);

  // Without health there is no proof the backend answered: show no figures.
  if (!health.ok) {
    return <Unreachable />;
  }

  const creators =
    scout.ok && Array.isArray(scout.data.items) ? scout.data.items : null;
  const outreachItems =
    outreach.ok && Array.isArray(outreach.data.items) ? outreach.data.items : null;
  const productItems =
    products.ok && Array.isArray(products.data.items) ? products.data.items : null;
  const sales =
    revenue.ok && Array.isArray(revenue.data.items) ? revenue.data.items : null;
  const summary =
    revenue.ok && revenue.data.summary && typeof revenue.data.summary === "object"
      ? revenue.data.summary
      : null;
  const hasSummaryValues =
    summary !== null && Object.values(summary).some((v) => typeof v === "number");
  const whopData = whop.ok ? whop.data : null;
  const settingsData = settings.ok ? settings.data : null;

  const creatorTotal =
    scout.ok && typeof scout.data.count === "number"
      ? scout.data.count
      : (creators?.length ?? 0);
  const outreachTotal =
    outreach.ok && typeof outreach.data.count === "number"
      ? outreach.data.count
      : (outreachItems?.length ?? 0);
  const productTotal =
    products.ok && typeof products.data.count === "number"
      ? products.data.count
      : (productItems?.length ?? 0);

  const pipeline = creators
    ? [
        {
          label: "Qualified",
          count: creators.filter((creator) => creator.qualified === true).length,
        },
        {
          label: "Partnered",
          count: creators.filter((creator) => creator.status === "partnered").length,
        },
        {
          label: "Contacted",
          count: creators.filter((creator) => creator.status === "contacted").length,
        },
      ]
    : [];

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              IB
            </span>
            <div>
              <p className="eyebrow">VistaBix</p>
              <span className="brand-name">Operator Dashboard</span>
            </div>
          </div>
          <p className="topbar-note">Live data from the VistaBix API · no sample figures</p>
        </div>
      </header>

      <main className="shell" id="main-content">
        <div className="masthead">
          <p className="eyebrow">Creator partnership operations</p>
          <h1>Dashboard</h1>
          <p className="lede">
            Every figure below comes from a FastAPI response. Empty sections stay empty and
            failed requests never turn into sample data.
          </p>
        </div>

        {health.data.status === "degraded" ||
        health.data.database === "unavailable" ? (
          <section className="panel panel-warning" role="status">
            <h2>Backend reports a degraded database</h2>
            <p>
              Status: {text(health.data.status)} · Database: {text(health.data.database)}
            </p>
          </section>
        ) : null}

        <div className="grid">
          <Card
            id="health"
            title="Backend health"
            subtitle="Service state reported by the API."
            source="/api/health"
          >
            <dl className="kv">
              <Row label="Status" value={text(health.data.status)} />
              <Row label="Database" value={text(health.data.database)} />
              <Row label="Environment" value={text(health.data.env)} />
              <Row label="API version" value={text(health.data.version)} />
              <Row label="API key required" value={yesNo(health.data.api_key_required)} />
            </dl>
          </Card>

          <Card
            id="pipeline"
            title="Creator pipeline"
            subtitle="Counts derived from returned creator records."
            source="/api/scout"
          >
            {creators === null ? (
              <Unavailable label="creator pipeline" />
            ) : creators.length === 0 ? (
              <Empty>No creators yet</Empty>
            ) : (
              <>
                <p className="summary-number">{numberLabel(creatorTotal)} tracked</p>
                <ul className="stat-list">
                  {pipeline.map((stage) => (
                    <li key={stage.label}>
                      <span>{stage.label}</span>
                      <strong>{numberLabel(stage.count)}</strong>
                    </li>
                  ))}
                </ul>
                <h3>Recently added</h3>
                <ul className="record-list">
                  {creators.slice(0, 3).map((creator) => (
                    <li
                      key={`${creator.id ?? "unknown"}-${creator.handle ?? "unknown"}`}
                    >
                      <strong>{text(creator.name)}</strong>
                      <span className="muted">
                        @{text(creator.handle)} · {text(creator.status)} ·{" "}
                        {text(creator.niche)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>

          <Card
            id="outreach"
            title="Outreach queue"
            subtitle="Drafts remain behind the human approval gate."
            source="/api/outreach"
          >
            {outreachItems === null ? (
              <Unavailable label="outreach queue" />
            ) : outreachItems.length === 0 ? (
              <Empty>No outreach drafts yet</Empty>
            ) : (
              <>
                <p className="summary-number">{numberLabel(outreachTotal)} recorded</p>
                <ul className="record-list">
                  {outreachItems.slice(0, 3).map((message) => (
                    <li
                      key={`${message.id ?? "unknown"}-${message.creator_id ?? "unknown"}`}
                    >
                      <strong>{text(message.subject)}</strong>
                      <span className="muted">
                        {text(message.status)} · {text(message.creator_name)} ·{" "}
                        {message.approved === true ? "approved" : "awaiting approval"}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>

          <Card
            id="products"
            title="Products"
            subtitle="Titles, statuses and split snapshots from stored products."
            source="/api/products"
          >
            {productItems === null ? (
              <Unavailable label="products" />
            ) : productItems.length === 0 ? (
              <Empty>No products yet</Empty>
            ) : (
              <>
                <p className="summary-number">{numberLabel(productTotal)} tracked</p>
                <ul className="record-list">
                  {productItems.slice(0, 3).map((product) => (
                    <li key={`${product.id ?? "unknown"}-${product.slug ?? "unknown"}`}>
                      <strong>{text(product.title)}</strong>
                      <span className="muted">
                        {text(product.status)} · creator {share(product.split?.creator_share)} ·
                        VistaBix {share(product.split?.platform_share)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>

          <Card
            id="revenue"
            title="Revenue"
            subtitle="Money is reported in integer cents by the API."
            source="/api/revenue"
          >
            {!hasSummaryValues || summary === null ? (
              <Unavailable label="revenue" />
            ) : summary.sales_count === 0 ? (
              <Empty>No sales recorded yet</Empty>
            ) : (
              <>
                <dl className="kv">
                  <Row label="Sales" value={numberOrNa(summary.sales_count)} />
                  <Row label="Gross" value={cents(summary.gross_cents)} />
                  <Row label="Refunded" value={cents(summary.refunded_cents)} />
                  <Row label="Net" value={cents(summary.net_cents)} />
                  <Row label="Creator" value={cents(summary.creator_cents)} />
                  <Row label="VistaBix" value={cents(summary.vistabix_cents)} />
                </dl>
                <h3>Recent sales</h3>
                {sales === null ? (
                  <Unavailable label="recent sales" />
                ) : sales.length === 0 ? (
                  <Empty>No recent sales returned</Empty>
                ) : (
                  <ul className="record-list">
                    {sales.slice(0, 3).map((sale) => (
                      <li key={`${sale.id ?? "unknown"}-${sale.whop_sale_id ?? "unknown"}`}>
                        <strong>{text(sale.product_title)}</strong>
                        <span className="muted">
                          {text(sale.status)} · net {cents(sale.net_cents)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </Card>

          <Card
            id="whop"
            title="Whop status"
            subtitle="Adapter state without credentials."
            source="/api/whop"
          >
            {whopData === null ? (
              <Unavailable label="Whop status" />
            ) : (
              <>
                <dl className="kv">
                  <Row label="Mode" value={text(whopData.mode)} />
                  <Row label="Configured" value={yesNo(whopData.configured)} />
                  <Row label="Mock" value={yesNo(whopData.mock)} />
                  <Row label="Publish ready" value={yesNo(whopData.publish_ready)} />
                </dl>
                {whopData.note ? <p className="note">{whopData.note}</p> : null}
                {whopData.publish_endpoint ? (
                  <p className="muted">
                    Publish endpoint: <code>{whopData.publish_endpoint}</code>
                  </p>
                ) : null}
              </>
            )}
          </Card>

          <Card
            id="settings"
            title="Settings & locked rules"
            subtitle="Values are read from the backend; nothing is hard-coded here."
            source="/api/settings"
          >
            {settingsData === null ? (
              <Unavailable label="settings" />
            ) : (
              <>
                <dl className="kv">
                  <Row label="Branding (locked)" value={text(settingsData.branding)} />
                  <Row label="Outreach paused" value={yesNo(settingsData.outreach_paused)} />
                </dl>
                <h3>Split rules (locked)</h3>
                <SplitRows splits={settingsData.splits} />
              </>
            )}
          </Card>
        </div>

        <footer>
          <span>VistaBix · creator partnership operations</span>
          <span>All values above are served by the VistaBix API.</span>
        </footer>
      </main>
    </>
  );
}

function Unreachable() {
  return (
    <main className="shell" id="main-content">
      <section className="panel panel-alert" role="alert" aria-labelledby="unreachable-title">
        <p className="eyebrow">VistaBix</p>
        <h1 id="unreachable-title">Backend unreachable</h1>
        <p>
          No data could be loaded from the VistaBix API, so no figures are shown on
          this page.
        </p>
        <p>
          Start the FastAPI backend and reload. If the API is protected, also check
          NEXT_PUBLIC_API_URL and the server-only API_KEY.
        </p>
      </section>
    </main>
  );
}

function Card({
  id,
  title,
  subtitle,
  source,
  children,
}: {
  id: string;
  title: string;
  subtitle: string;
  source: string;
  children: ReactNode;
}) {
  return (
    <section className="card" aria-labelledby={`${id}-title`}>
      <div className="card-head">
        <div>
          <h2 id={`${id}-title`}>{title}</h2>
          <p className="subtitle">{subtitle}</p>
        </div>
        <span className="source">GET {source}</span>
      </div>
      <div className="card-body">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="kv-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function SplitRows({ splits }: { splits?: SplitRules | null }) {
  if (!splits) {
    return <Unavailable label="split rules" />;
  }

  return (
    <dl className="kv">
      <Row label="First product · creator" value={share(splits.first_product?.creator)} />
      <Row label="First product · VistaBix" value={share(splits.first_product?.vistabix)} />
      <Row
        label="Later products · creator"
        value={share(splits.subsequent_products?.creator)}
      />
      <Row
        label="Later products · VistaBix"
        value={share(splits.subsequent_products?.vistabix)}
      />
      <Row label="Unit" value={text(splits.unit)} />
    </dl>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

function Unavailable({ label }: { label: string }) {
  return <p className="unavailable">Could not load {label}. No figures are shown.</p>;
}

function text(value: unknown): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  return "Not reported";
}

function yesNo(value: boolean | undefined): string {
  if (typeof value !== "boolean") {
    return "Not reported";
  }
  return value ? "Yes" : "No";
}

function numberLabel(value: number): string {
  return Number.isFinite(value) ? new Intl.NumberFormat("en-US").format(value) : "Not reported";
}

function numberOrNa(value: number | undefined): string {
  return typeof value === "number" ? numberLabel(value) : "Not reported";
}

function cents(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${numberLabel(value)} cents`
    : "Not reported";
}

function share(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? new Intl.NumberFormat("en-US", {
        style: "percent",
        maximumFractionDigits: 2,
      }).format(value)
    : "Not reported";
}
