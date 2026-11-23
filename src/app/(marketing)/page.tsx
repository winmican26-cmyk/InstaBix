import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  FileCheck2,
  Fingerprint,
  Handshake,
  Lock,
  MailCheck,
  Scale,
  ScanSearch,
  ShieldCheck,
  Split,
  Users,
  X,
} from "lucide-react";
import { Instagram } from "@/components/brand/instagram-glyph";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "VistaBix — the creator partnership engine",
  description:
    "Turn real creator demand into finished products and auditable revenue splits. Consent-first discovery, official APIs, human-approved outreach.",
};

const loop = [
  { step: "01", title: "Apply or invite", body: "The creator authenticates with Instagram and grants scopes. Consent is recorded with a timestamp.", icon: Users },
  { step: "02", title: "Verify publicly", body: "Business Discovery fills in the metrics Meta actually exposes. Nothing else is inferred.", icon: ScanSearch },
  { step: "03", title: "Score with evidence", body: "Engagement, consistency and monetisation signals, each with a factor breakdown.", icon: Fingerprint },
  { step: "04", title: "Approve the outreach", body: "A human approves every message. Caps, suppression and unsubscribe are enforced server-side.", icon: MailCheck },
  { step: "05", title: "Build in their voice", body: "Outline, approval, draft, citations back to real source material, creator sign-off.", icon: BookOpen },
  { step: "06", title: "Split to the cent", body: "When Stripe checkout is configured, the workspace ledger records sales, creator shares and refunds.", icon: Split },
];

export default function HomePage() {
  return (
    <>
      <section className="relative overflow-hidden border-b border-line">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-0 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-violet/[0.09] blur-[110px]" />
          <div className="absolute bottom-0 right-0 size-[360px] rounded-full bg-lime/[0.05] blur-[100px]" />
        </div>
        <div className="relative mx-auto max-w-6xl px-5 py-20 sm:px-6 lg:py-28">
          <div>
            <Badge tone="lime" className="mb-5">
              <ShieldCheck className="size-3" /> Consent-first by design
            </Badge>
            <h1 className="font-display text-[44px] font-semibold leading-[0.98] tracking-[-0.045em] text-fg sm:text-[58px] lg:text-[64px]">
              Real creators.
              <br />
              Real demand.
              <br />
              <span className="text-lime">Real splits.</span>
            </h1>
            <p className="mt-6 max-w-lg text-[15px] leading-7 text-muted">
              VistaBix is the operating system for creator partnerships: find people whose audience is already asking,
              build products with them, and track what each partner earns in the workspace ledger.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link href="/signup">
                  Create your workspace <ArrowRight />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/for-creators">I&apos;m a creator</Link>
              </Button>
            </div>
            <p className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
              <span className="inline-flex items-center gap-1.5">
                <Instagram className="size-3" /> Official APIs
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Lock className="size-3" /> Encrypted tokens
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Scale className="size-3" /> Auditable money
              </span>
            </p>
          </div>
        </div>
      </section>

      <section className="border-b border-line">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-6">
          <div className="max-w-2xl">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">The old playbook</p>
            <h2 className="mt-3 font-display text-[30px] font-semibold leading-[1.1] tracking-[-0.035em] text-fg sm:text-[38px]">
              Three things every creator tool gets away with. We don&apos;t.
            </h2>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              {
                bad: "Scraped ‘leads’",
                good: "Consent and public APIs",
                body: "Meta does not expose creator emails, comments or demographics. Scraping gets the app banned and the list worthless. VistaBix inverts the funnel: creators opt in.",
              },
              {
                bad: "Decorative dashboards",
                good: "Traceable rows",
                body: "A number with no source is a liability. Every figure in VistaBix comes from a row or a live API response, with freshness and sample size attached.",
              },
              {
                bad: "Handshake splits",
                good: "An immutable ledger",
                body: "The workspace ledger lets you trace sales, refunds and recorded creator shares.",
              },
            ].map((item) => (
              <div key={item.bad} className="card p-5">
                <p className="flex items-center gap-1.5 text-[11px] font-medium text-danger/90">
                  <X className="size-3.5" /> {item.bad}
                </p>
                <p className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold text-fg">
                  <BadgeCheck className="size-3.5 text-lime" /> {item.good}
                </p>
                <p className="mt-3 text-[12.5px] leading-6 text-muted">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-line">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-xl">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">The loop</p>
              <h2 className="mt-3 font-display text-[30px] font-semibold leading-[1.1] tracking-[-0.035em] text-fg sm:text-[38px]">
                Six steps. No step can be skipped.
              </h2>
            </div>
            <p className="max-w-sm text-[12.5px] leading-6 text-muted">
              Each stage has a gate: consent, public data only, human approval, creator sign-off, and a reconciled ledger.
            </p>
          </div>
          <div className="mt-10 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {loop.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.step} className="bg-surface p-6">
                  <div className="flex items-center justify-between">
                    <span className="grid size-9 place-items-center rounded-lg border border-line bg-surface-2 text-lime">
                      <Icon className="size-4" strokeWidth={1.75} />
                    </span>
                    <span className="font-mono text-[10px] text-faint">{item.step}</span>
                  </div>
                  <h3 className="mt-4 text-[14px] font-semibold text-fg">{item.title}</h3>
                  <p className="mt-2 text-[12.5px] leading-5 text-muted">{item.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-b border-line">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-6 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">Two surfaces</p>
            <h2 className="mt-3 font-display text-[30px] font-semibold leading-[1.1] tracking-[-0.035em] text-fg sm:text-[38px]">
              A console for the operator. A portal for the creator.
            </h2>
            <p className="mt-4 max-w-md text-[13.5px] leading-6 text-muted">
              Operators get dense, keyboard-first tooling. Creators get a mobile portal where they see exactly what is being
              built, what it earns, and what they are signing.
            </p>
            <div className="mt-6 space-y-3">
              {[
                [FileCheck2, "Approvals with an audit trail", "Every send, publish and signature is recorded with actor, time and IP."],
                [Handshake, "Agreement before money", "Split, licence and refund terms are hashed and attached to the signature."],
                [ShieldCheck, "Suppression is absolute", "One unsubscribe blocks every channel, forever, across the workspace."],
              ].map(([Icon, title, body]) => {
                const I = Icon as typeof FileCheck2;
                return (
                  <div key={title as string} className="flex gap-3">
                    <I className="mt-0.5 size-4 shrink-0 text-lime" strokeWidth={1.75} />
                    <div>
                      <p className="text-[13px] font-semibold text-fg">{title as string}</p>
                      <p className="text-[12px] leading-5 text-muted">{body as string}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="card flex flex-col items-start gap-3 p-5">
              <h3 className="text-[14px] font-semibold text-fg">Operator workspace</h3>
              <p className="flex-1 text-[12.5px] leading-6 text-muted">
                Manage creators, review outreach, and open the product studio.
              </p>
              <Button asChild variant="outline" size="sm">
                <Link href="/login">Sign in to VistaBix</Link>
              </Button>
            </div>
            <div className="card flex flex-col items-start gap-3 p-5">
              <h3 className="text-[14px] font-semibold text-fg">Creator partnerships</h3>
              <p className="flex-1 text-[12.5px] leading-6 text-muted">
                Learn what you can review before a product goes on sale.
              </p>
              <Button asChild variant="outline" size="sm">
                <Link href="/for-creators">Partnership details</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-line">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-6">
          <div className="card relative overflow-hidden p-8 sm:p-12">
            <div className="pointer-events-none absolute right-0 top-0 size-[300px] rounded-full bg-lime/[0.07] blur-[80px]" />
            <div className="relative max-w-2xl">
              <h2 className="font-display text-[30px] font-semibold leading-[1.08] tracking-[-0.035em] text-fg sm:text-[40px]">
                If you cannot trace it, it does not ship.
              </h2>
              <p className="mt-4 text-[13.5px] leading-6 text-muted">
                That rule is in the database, not the marketing. Row-level security isolates every workspace. Provider tokens
                are encrypted at rest. Suspicious sends stop at the gate. Deletions are honoured with a receipt.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {["RLS on 25 tables", "AES-256-GCM token vault", "One-click unsubscribe", "Data-deletion callback", "WCAG 2.2 AA"].map(
                  (item) => (
                    <Badge key={item} tone="outline">
                      {item}
                    </Badge>
                  ),
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-5 py-20 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-display text-[30px] font-semibold leading-[1.08] tracking-[-0.035em] text-fg sm:text-[40px]">
              Start with an empty workspace.
              <br />
              Fill it with real people.
            </h2>
            <p className="mt-3 max-w-md text-[13px] leading-6 text-muted">
              Connect Instagram, add one creator you already trust, and run the loop end to end before you scale anything.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/signup">
                Create workspace <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/apply">Apply as a creator</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
