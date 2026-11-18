import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16 sm:px-6">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">Legal</p>
      <h1 className="mt-3 font-display text-[36px] font-semibold tracking-[-0.04em] text-fg">Privacy policy</h1>
      <p className="mt-2 text-[12px] text-faint">Version 2026-01 · Effective on account creation</p>

      <div className="prose-legal mt-8">
        <h2>What we collect</h2>
        <ul>
          <li>Account data: name, email, hashed password, workspace membership and audit events.</li>
          <li>Creator data you add or that a creator submits: handle, niche, contact email, consent record and notes.</li>
          <li>Platform data from Instagram: public profile and media metrics for accounts you are authorised to read.</li>
          <li>Operational data: outreach drafts and approvals, product drafts, orders, ledger entries and support messages.</li>
        </ul>

        <h2>What we do not collect</h2>
        <p>
          We do not scrape Instagram, read another account&apos;s private messages, buy contact lists, or infer an email
          address. If a creator has not provided an email or published one for business contact, InstaBix will not message
          them.
        </p>

        <h2>Why we process it</h2>
        <p>
          To operate your workspace and the creator partnership you have consented to; to meet legal, tax and accounting
          obligations; to prevent abuse and fraud; and to improve the product using aggregated, non-identifying signals.
        </p>

        <h2>Legal bases</h2>
        <p>
          Contract performance for workspace and creator agreements; consent for marketing email and optional analytics;
          legitimate interests for security and fraud prevention; legal obligation for tax and financial records.
        </p>

        <h2>Sharing</h2>
        <p>
          We share only what a processor needs: hosting and database, email delivery, payments and payouts, error monitoring,
          and AI generation where enabled. Each processor is bound by a data processing agreement. We do not sell personal
          data.
        </p>

        <h2>Retention</h2>
        <p>
          Consent and audit records are retained while the partnership exists and for the period required by law. Financial
          records follow statutory retention. Deletion requests remove personal data that is not legally required, and the
          outcome is recorded.
        </p>

        <h2>Your rights</h2>
        <p>
          Access, correction, export, deletion, restriction and objection. Creators can revoke Instagram access at any time
          from the portal or from Instagram&apos;s own settings. Requests can be made from Settings or by emailing the
          operator of your workspace.
        </p>

        <h2>Meta platform data</h2>
        <p>
          Instagram data is used solely to provide the features you see, in line with the Meta Platform Terms. Tokens are
          encrypted at rest and revoked on disconnect. A data-deletion callback is implemented for platform-initiated
          requests.
        </p>

        <h2>Contact</h2>
        <p>Privacy questions: privacy@the-operator-domain.example (replace with your workspace operator&apos;s address before launch).</p>
      </div>
    </div>
  );
}
