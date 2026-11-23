import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, Check, MailCheck, ScanSearch, Split, Users, X } from "lucide-react";
import { Instagram } from "@/components/brand/instagram-glyph";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "How it works",
  description: "The six-stage VistaBix loop, and the platform limits it is designed around.",
};

const stages = [
  {
    n: "01",
    title: "The creator applies or accepts an invite",
    icon: Users,
    body: "A public application link or a single-use portal token. They authenticate with Instagram, grant scopes, and accept the partnership terms. We store the consent version, timestamp, IP and user agent.",
    gate: "Gate: explicit consent before any data is read.",
  },
  {
    n: "02",
    title: "Public metrics arrive through the official API",
    icon: ScanSearch,
    body: "Business Discovery returns followers, media count and recent public posts with captions and engagement counts. Snapshot history is append-only, so a score can always be recomputed from what we knew at the time.",
    gate: "Gate: no scraping, no unofficial endpoints, no purchased data.",
  },
  {
    n: "03",
    title: "The score explains itself",
    icon: Instagram,
    body: "Median engagement (40%), consistency across posts (30%), and monetisation signals in captions (30%). The UI shows the inputs, the weights and the sample size. Under eight posts, it refuses to score.",
    gate: "Gate: no score without evidence.",
  },
  {
    n: "04",
    title: "A human approves every message",
    icon: MailCheck,
    body: "Sequences are drafts. Approval is per message, capped per day and restricted to the creator's working hours. Suppression and unsubscribe are checked again at send time, not just at draft time.",
    gate: "Gate: human approval, enforced server-side.",
  },
  {
    n: "05",
    title: "The product is built from permitted material",
    icon: BookOpen,
    body: "Outline first, then approval, then chapters. Every claim in a draft cites a source id from the creator's own media or comments they shared. Export, review link, signature with a document hash.",
    gate: "Gate: creator signs before anything is sold.",
  },
  {
    n: "06",
    title: "Sales and creator shares are recorded",
    icon: Split,
    body: "When configured, Stripe handles checkout. VistaBix records sales, creator shares and refunds in the workspace ledger.",
    gate: "Gate: sales are recorded from signed Stripe events.",
  },
];

export default function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-16 sm:px-6">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-lime">How it works</p>
      <h1 className="mt-3 max-w-3xl font-display text-[38px] font-semibold leading-[1.05] tracking-[-0.04em] text-fg sm:text-[52px]">
        Built around what Meta actually allows.
      </h1>
      <p className="mt-5 max-w-2xl text-[14px] leading-7 text-muted">
        Most creator tools are a spreadsheet with a login. This one assumes the data is scarce, the consent is legal
        evidence, and the money has to reconcile. Here is the whole loop, including the gates.
      </p>

      <div className="mt-12 space-y-4">
        {stages.map((stage) => {
          const Icon = stage.icon;
          return (
            <article key={stage.n} className="card grid gap-4 p-6 sm:grid-cols-[auto_1fr]">
              <div className="flex items-start gap-3 sm:w-16 sm:flex-col">
                <span className="font-mono text-[11px] text-faint">{stage.n}</span>
                <span className="grid size-9 place-items-center rounded-lg border border-line bg-surface-2 text-lime">
                  <Icon className="size-4" strokeWidth={1.75} />
                </span>
              </div>
              <div>
                <h2 className="font-display text-[19px] font-semibold tracking-[-0.02em] text-fg">{stage.title}</h2>
                <p className="mt-2 text-[13px] leading-6 text-muted">{stage.body}</p>
                <p className="mt-3 inline-flex rounded-md border border-lime/20 bg-lime/[0.04] px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.08em] text-lime">
                  {stage.gate}
                </p>
              </div>
            </article>
          );
        })}
      </div>

      <section className="mt-14">
        <h2 className="font-display text-[26px] font-semibold tracking-[-0.03em] text-fg">What we will never do</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {[
            "Scrape Instagram, use unofficial endpoints, or buy a contact list.",
            "Read another account's comments, DMs, email or audience demographics.",
            "Send outreach without a lawful basis and a human approval.",
            "Publish a product or contact a creator on your behalf silently.",
            "Show a demo number to make an empty workspace look alive.",
            "Publish a product before the creator signs the agreement.",
          ].map((item) => (
            <div key={item} className="flex gap-2.5 rounded-lg border border-line bg-surface p-3.5">
              <X className="mt-0.5 size-3.5 shrink-0 text-danger" aria-hidden />
              <p className="text-[12.5px] leading-5 text-muted">{item}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-14 rounded-xl border border-line bg-surface p-6 sm:p-8">
        <Badge tone="lime" className="mb-4">
          <Check className="size-3" /> The honest limitation
        </Badge>
        <h2 className="font-display text-[24px] font-semibold tracking-[-0.03em] text-fg">
          You cannot cold-email a creator you have not found lawfully.
        </h2>
        <p className="mt-3 max-w-3xl text-[13px] leading-6 text-muted">
          So VistaBix is inbound-first: the application page, the invite link and the creator portal are not add-ons, they
          are the top of the funnel. If you already know a creator, you can add them manually — with the source recorded and
          the same consent gate before any message.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/signup">
              Start a workspace <ArrowRight />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/apply">See the creator application</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
