import Link from "next/link";
import { Mark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";

const links = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/for-creators", label: "For creators" },
  { href: "/legal/privacy", label: "Privacy" },
];

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-canvas min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-line/80 bg-bg/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5 sm:px-6">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <Mark className="size-8" />
            <span className="font-display text-[17px] font-semibold tracking-[-0.03em] text-fg">InstaBix</span>
          </Link>
          <nav className="ml-4 hidden items-center gap-5 text-[12.5px] font-medium text-muted md:flex" aria-label="Main">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="transition-colors hover:text-fg">
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/signup">Create workspace</Link>
            </Button>
          </div>
        </div>
      </header>
      <main id="main">{children}</main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div>
            <Link href="/" className="inline-flex items-center gap-2.5">
              <Mark className="size-7" />
              <span className="font-display text-[15px] font-semibold tracking-[-0.03em] text-fg">InstaBix</span>
            </Link>
            <p className="mt-3 max-w-xs text-[12px] leading-5 text-faint">
              The creator partnership engine. Consent-first discovery, human-approved outreach, auditable splits.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-12 gap-y-2 text-[12px] text-muted sm:grid-cols-2">
            <Link href="/how-it-works" className="hover:text-fg">
              How it works
            </Link>
            <Link href="/for-creators" className="hover:text-fg">
              For creators
            </Link>
            <Link href="/apply" className="hover:text-fg">
              Apply
            </Link>
            <Link href="/login" className="hover:text-fg">
              Sign in
            </Link>
            <Link href="/legal/privacy" className="hover:text-fg">
              Privacy
            </Link>
            <Link href="/legal/terms" className="hover:text-fg">
              Terms
            </Link>
          </div>
        </div>
        <div className="border-t border-line/70">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-4 text-[10.5px] text-faint sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <span>© {new Date().getFullYear()} InstaBix. Not affiliated with or endorsed by Meta Platforms, Inc.</span>
            <span className="font-mono uppercase tracking-[0.1em]">Instagram · WhatsApp · Messenger standards</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
