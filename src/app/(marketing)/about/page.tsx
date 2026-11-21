import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About Us · VistaBix & Micany Apps",
  description:
    "Learn about VistaBix, an independent creator partnership platform operated under Micany Apps by Michael Anyanwu based in Västerås, Sweden.",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16 sm:px-6">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">Company</p>
      <h1 className="mt-3 font-display text-[36px] font-semibold tracking-[-0.04em] text-fg">About VistaBix</h1>
      <p className="mt-2 text-[12px] text-faint">Operated under Micany Apps · Västerås, Sweden</p>

      <div className="prose-legal mt-8">
        <h2>Who We Are</h2>
        <p>
          <strong>VistaBix</strong> is an independent software application created and operated under{" "}
          <a href="https://micanyapps.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-fg">
            Micany Apps
          </a>
          , founded by full-stack developer Michael Anyanwu in Västerås, Sweden.
        </p>
        <p>
          Micany Apps designs and builds robust, compliance-first, and high-performance digital software solutions, ranging
          from intelligent automation and aggregators to creator and enterprise tooling across the European Union and globally.
        </p>

        <h2>Our Mission with VistaBix</h2>
        <p>
          VistaBix was created to solve creator monetization with mathematical transparency and strict consent. Rather than
          cold scraping or spam, VistaBix powers:
        </p>
        <ul>
          <li><strong>Consent-first partnerships:</strong> Real data, voluntary creator agreements, and cryptographic record keeping.</li>
          <li><strong>Automated & transparent revenue splits:</strong> Enforcing auditable payout splits (such as 60/40 creator-favored first products and 50/50 subsequent products).</li>
          <li><strong>Human-in-the-loop workflows:</strong> Strict guardrails ensuring that every outreach, proposal, and live storefront has human verification.</li>
        </ul>

        <h2>Platform Disclaimers & Independent Operation</h2>
        <div className="my-6 rounded-lg border border-line bg-card/60 p-5">
          <h3 className="text-[14px] font-semibold text-fg">Non-Affiliation Notice (Meta Platforms, Inc.)</h3>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
            VistaBix is an independent web application provided by Micany Apps. VistaBix is <strong>not</strong> endorsed,
            sponsored, certified, or affiliated with Meta Platforms, Inc., Instagram, Facebook, or WhatsApp. Any product names,
            logos, and brands used are property of their respective owners.
          </p>
        </div>

        <h2>European Union & Global Standards</h2>
        <p>
          Operating from Sweden, we adhere strictly to the European Union&apos;s General Data Protection Regulation (GDPR),
          the ePrivacy Directive, and international security standards. We do not sell personal data, engage in shadow profiling,
          or scrape private user interactions.
        </p>

        <h2>Contact Information</h2>
        <p>
          For general inquiries, partnerships, or operator questions regarding Micany Apps and VistaBix:
        </p>
        <ul>
          <li><strong>Parent Entity:</strong> Micany Apps (Operated by Michael Anyanwu)</li>
          <li><strong>Location:</strong> Västerås, Sweden</li>
          <li><strong>Website:</strong> <a href="https://micanyapps.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-fg">micanyapps.com</a></li>
          <li><strong>General Inquiries:</strong> <a href="mailto:contact@micanyapps.com" className="underline hover:text-fg">contact@micanyapps.com</a></li>
          <li><strong>Data Protection & DSR:</strong> <Link href="/legal/dsr" className="underline hover:text-fg">Visit the GDPR / DSR Portal</Link></li>
        </ul>
      </div>
    </div>
  );
}
