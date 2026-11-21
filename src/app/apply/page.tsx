import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, Lock, MailCheck } from "lucide-react";
import { Mark } from "@/components/brand/wordmark";
import { ApplyForm } from "./apply-form";

export const metadata: Metadata = {
  title: "Apply as a creator",
  description: "Tell us what your audience keeps asking for. No obligation, no product without your approval.",
};

export default function ApplyPage() {
  return (
    <div className="app-canvas min-h-dvh">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5 sm:px-6">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <Mark className="size-8" />
            <span className="font-display text-[16px] font-semibold tracking-[-0.03em] text-fg">VistaBix</span>
          </Link>
          <Link href="/" className="inline-flex items-center gap-1.5 text-[12px] text-faint hover:text-muted">
            <ArrowLeft className="size-3.5" /> Back to site
          </Link>
        </div>
      </header>

      <main id="main" className="mx-auto grid max-w-5xl gap-10 px-5 py-14 sm:px-6 lg:grid-cols-[1fr_1fr] lg:items-start">
        <div className="lg:sticky lg:top-20">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-lime">Creator application</p>
          <h1 className="mt-3 font-display text-[38px] font-semibold leading-[1.03] tracking-[-0.04em] text-fg sm:text-[46px]">
            The product your audience already asked for.
          </h1>
          <p className="mt-4 max-w-md text-[13.5px] leading-6 text-muted">
            We look for creators whose comments are full of the same request, who have not sold that answer yet. If it fits,
            we research, build and operate the product — with your name on it and your approval at every gate.
          </p>
          <div className="mt-7 space-y-3">
            {[
              [BadgeCheck, "60/40 in your favour on product one", "Then 50/50. Agreed in writing before work starts."],
              [MailCheck, "Nothing sends or publishes without you", "Outline, draft, price and launch copy all need your sign-off."],
              [Lock, "Consent is the first step, not the last", "You can revoke access and request deletion at any time."],
            ].map(([Icon, title, body]) => {
              const I = Icon as typeof BadgeCheck;
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
          <p className="mt-7 rounded-lg border border-line bg-surface-2/40 p-3.5 text-[11.5px] leading-5 text-faint">
            VistaBix is not affiliated with Meta. Applying does not authorise us to message your audience, post on your
            behalf, or access private messages.
          </p>
        </div>

        <ApplyForm />
      </main>
    </div>
  );
}
