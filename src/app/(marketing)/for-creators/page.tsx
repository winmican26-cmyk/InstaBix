import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck, CircleDollarSign, FileText, Handshake, Lock, ShieldCheck } from "lucide-react";
import { Instagram } from "@/components/brand/instagram-glyph";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "For creators",
  description: "You keep the audience. We build the product. The split is written down before anything ships.",
};

export default function ForCreatorsPage() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-16 sm:px-6">
      <div className="max-w-3xl">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-lime">For creators</p>
        <h1 className="mt-3 font-display text-[40px] font-semibold leading-[1.02] tracking-[-0.04em] text-fg sm:text-[56px]">
          Your audience is asking.
          <br />
          You should own the answer.
        </h1>
        <p className="mt-5 text-[14px] leading-7 text-muted">
          VistaBix partners with creators who have real demand and no product to sell it. We research, write, design and
          operate the product. You review it, put your name on it, and earn the majority of every sale.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/apply">
              Apply to partner <ArrowRight />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/how-it-works">Read the full loop</Link>
          </Button>
        </div>
      </div>

      <div className="mt-14 grid gap-4 sm:grid-cols-3">
        {[
          { icon: CircleDollarSign, title: "Majority split", body: "60/40 in your favour on the first product, then 50/50. Written into the agreement before work starts." },
          { icon: FileText, title: "You approve everything", body: "Outline, draft, cover, price and launch copy. Nothing publishes without your sign-off." },
          { icon: Lock, title: "Your data stays yours", body: "Encrypted tokens, minimal scopes, and a one-click disconnect that revokes access immediately." },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.title} className="card p-5">
              <Icon className="size-5 text-lime" strokeWidth={1.75} />
              <h2 className="mt-4 text-[14px] font-semibold text-fg">{item.title}</h2>
              <p className="mt-2 text-[12.5px] leading-5 text-muted">{item.body}</p>
            </div>
          );
        })}
      </div>

      <section className="mt-14 grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="font-display text-[26px] font-semibold tracking-[-0.03em] text-fg">What we ask for</h2>
          <ul className="mt-4 space-y-3">
            {[
              "A public professional Instagram account.",
              "Permission to read your own insights and public post metrics.",
              "A working email for partnership correspondence.",
              "Two rounds of review: the outline and the finished draft.",
              "Honest feedback — if the product is wrong for your audience, say so.",
            ].map((item) => (
              <li key={item} className="flex gap-2.5 text-[13px] leading-6 text-muted">
                <BadgeCheck className="mt-0.5 size-4 shrink-0 text-lime" strokeWidth={1.75} />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="font-display text-[26px] font-semibold tracking-[-0.03em] text-fg">What you will never see</h2>
          <ul className="mt-4 space-y-3">
            {[
              "A product published under your name without approval.",
              "A DM or email sent on your behalf without approval.",
              "Your contact details sold, shared or used for another creator's campaign.",
              "A payout figure that changes without a ledger entry.",
              "A contract you cannot read before signing.",
            ].map((item) => (
              <li key={item} className="flex gap-2.5 text-[13px] leading-6 text-muted">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-violet" strokeWidth={1.75} />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-14 rounded-xl border border-line bg-surface p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-xl">
            <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
              <Instagram className="size-3.5" /> The application
            </p>
            <h2 className="mt-3 font-display text-[26px] font-semibold tracking-[-0.03em] text-fg">
              Two minutes now. No obligation.
            </h2>
            <p className="mt-2 text-[13px] leading-6 text-muted">
              Tell us the handle, the niche, and the question your audience keeps asking. If it fits, an operator will
              follow up with a one-page outline.
            </p>
          </div>
          <Button asChild size="lg">
            <Link href="/apply">
              <Handshake /> Start the application
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
