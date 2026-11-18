import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of service" };

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16 sm:px-6">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">Legal</p>
      <h1 className="mt-3 font-display text-[36px] font-semibold tracking-[-0.04em] text-fg">Terms of service</h1>
      <p className="mt-2 text-[12px] text-faint">Version 2026-01 · Operator template</p>

      <div className="prose-legal mt-8">
        <h2>1. The service</h2>
        <p>
          InstaBix is software for managing creator partnerships: applications, public metric enrichment, outreach, product
          production and revenue splits. The operator of your workspace is the party that contracts with creators.
        </p>

        <h2>2. Acceptable use</h2>
        <ul>
          <li>Do not scrape, crawl or use unofficial endpoints against Instagram or any platform.</li>
          <li>Do not upload purchased contact lists or contact people without a lawful basis.</li>
          <li>Do not misrepresent a creator, a product, a result or a payout.</li>
          <li>Do not attempt to bypass approval gates, sending caps, suppression or tenant isolation.</li>
        </ul>

        <h2>3. Creator partnerships</h2>
        <p>
          A partnership begins only when the creator accepts the agreement presented in the portal. The agreement defines
          the product, price, split, licence, review process, refund policy and termination. InstaBix records the document
          hash and signature metadata; it does not replace legal advice.
        </p>

        <h2>4. Revenue and payouts</h2>
        <p>
          Payments are processed by Stripe. Creator payouts require completed Stripe onboarding. Ledger entries are the
          source of truth; statements are derived from them. Refunds reverse the original entries exactly. Taxes are the
          responsibility of the contracting parties.
        </p>

        <h2>5. Data and intellectual property</h2>
        <p>
          The creator retains ownership of their name, likeness and audience. The agreement grants a limited licence to
          produce, sell and promote the product for its term. The operator retains ownership of the software and its
          templates. Generated drafts are reviewed and approved by the creator before publication.
        </p>

        <h2>6. Availability and liability</h2>
        <p>
          The service is provided as-is during its beta period. To the maximum extent permitted by law, the operator is not
          liable for indirect or consequential loss. Nothing in these terms limits rights that cannot be limited by law.
        </p>

        <h2>7. Termination</h2>
        <p>
          Either party may terminate a workspace with notice. Active creator agreements survive according to their own
          terms. Data is exported or deleted according to the privacy policy and statutory retention.
        </p>

        <h2>8. Contact</h2>
        <p>Replace this template with counsel-reviewed terms before taking payment from the public.</p>
      </div>
    </div>
  );
}
