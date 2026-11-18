import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Mark } from "@/components/brand/wordmark";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden border-r border-line bg-surface lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute inset-0 opacity-[0.55]">
          <div className="absolute -left-24 top-10 size-[420px] rounded-full bg-violet/20 blur-[110px]" />
          <div className="absolute bottom-0 right-0 size-[380px] rounded-full bg-lime/10 blur-[100px]" />
          <div className="absolute inset-0 grid-lines opacity-30" />
        </div>
        <div className="relative z-10 p-10">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <Mark className="size-8" />
            <span className="font-display text-[17px] font-semibold tracking-[-0.03em] text-fg">InstaBix</span>
          </Link>
        </div>
        <div className="relative z-10 max-w-lg p-10">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime">Consent-first by design</p>
          <h2 className="mt-4 font-display text-[38px] font-semibold leading-[1.05] tracking-[-0.04em] text-fg">
            The partnership engine that refuses to invent a number.
          </h2>
          <p className="mt-4 text-[14px] leading-6 text-muted">
            Instagram&apos;s platform does not hand out creator emails, comments or reach. InstaBix is built around that
            reality: creators opt in, public metrics come from official APIs, and every figure is traceable.
          </p>
          <div className="mt-8 space-y-3">
            {[
              ["Official APIs only", "No scraping, no purchased lists, no unofficial endpoints."],
              ["Human approval", "Outreach never leaves without a person saying yes."],
              ["Auditable money", "Splits computed to the cent and mirrored on refunds."],
            ].map(([title, body]) => (
              <div key={title} className="flex gap-3">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-lime" strokeWidth={1.75} aria-hidden />
                <div>
                  <p className="text-[13px] font-semibold text-fg">{title}</p>
                  <p className="text-[12.5px] leading-5 text-muted">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="relative z-10 flex items-center justify-between border-t border-line p-6 text-[11px] text-faint">
          <span>InstaBix · creator partnerships</span>
          <Link href="/" className="inline-flex items-center gap-1.5 hover:text-muted">
            <ArrowLeft className="size-3" /> Back to site
          </Link>
        </div>
      </aside>

      <main id="main" className="flex flex-col bg-bg">
        <div className="flex items-center justify-between p-5 lg:hidden">
          <Link href="/" className="inline-flex items-center gap-2">
            <Mark className="size-7" />
            <span className="font-display text-[15px] font-semibold text-fg">InstaBix</span>
          </Link>
          <Link href="/" className="text-[11px] text-faint hover:text-muted">
            Back to site
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-[400px]">{children}</div>
        </div>
        <p className="p-6 text-center text-[11px] text-faint">
          Protected by rate limits, hashed sessions and tenant-level row security.
        </p>
      </main>
    </div>
  );
}
