import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy policy · VistaBix & Micany Apps",
  description: "Privacy policy for VistaBix, an application part of Micany Apps (Sweden). GDPR compliant.",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16 sm:px-6">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">Legal & Compliance</p>
      <h1 className="mt-3 font-display text-[36px] font-semibold tracking-[-0.04em] text-fg">Privacy policy</h1>
      <p className="mt-2 text-[12px] text-faint">
        Version 2026-02 · Operated by Micany Apps (Västerås, Sweden) · Effective on account creation
      </p>

      {/* Micany Apps affiliation banner */}
      <div className="my-6 rounded-lg border border-line bg-card/60 p-4 text-[12.5px] text-muted">
        <p>
          <strong>Affiliation:</strong> VistaBix is a product operated under{" "}
          <a href="https://micanyapps.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-fg font-medium">
            Micany Apps
          </a>{" "}
          (founded by Michael Anyanwu, Västerås, Sweden). All personal data processing conforms with the European Union&apos;s
          General Data Protection Regulation (GDPR) and the Swedish Data Protection Authority (IMY) guidelines.
        </p>
      </div>

      <div className="prose-legal mt-8">
        <h2>1. Who is responsible for your data (Data Controller)</h2>
        <p>
          The data controller for VistaBix is:
        </p>
        <ul>
          <li><strong>Entity:</strong> Micany Apps (Michael Anyanwu)</li>
          <li><strong>Location:</strong> Västerås, Sweden</li>
          <li><strong>Website:</strong> <a href="https://micanyapps.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-fg">micanyapps.com</a></li>
          <li><strong>Contact & Data Protection:</strong> <a href="mailto:contact@micanyapps.com" className="underline hover:text-fg">contact@micanyapps.com</a></li>
        </ul>

        <h2>2. What we collect</h2>
        <ul>
          <li><strong>Account data:</strong> Name, email, hashed password, workspace membership, and audit events.</li>
          <li><strong>Creator data:</strong> Information you add or that a creator submits (handle, niche, business email, consent records, content notes).</li>
          <li><strong>Platform data from Instagram:</strong> Public profile and media metrics for accounts you are authorized to read under official Meta Graph APIs.</li>
          <li><strong>Operational data:</strong> Outreach drafts and approvals, product drafts, orders, ledger entries, and support messages.</li>
          <li><strong>Essential technical cookies:</strong> Session tokens and security identifiers stored strictly to maintain user sessions and CSRF protection.</li>
        </ul>

        <h2>3. What we do not collect</h2>
        <p>
          We do not scrape Instagram, read private DMs, purchase contact lists, or guess email addresses. If a creator
          has not provided an email or published one publicly for business inquiries, VistaBix will not contact them.
        </p>

        <h2>4. Why we process your data and legal bases</h2>
        <ul>
          <li><strong>Contract performance (Art. 6(1)(b) GDPR):</strong> Operating your workspace, managing creator agreements, and facilitating revenue splits.</li>
          <li><strong>Consent (Art. 6(1)(a) GDPR):</strong> Processing platform integrations (Instagram OAuth) and optional analytics.</li>
          <li><strong>Legitimate interests (Art. 6(1)(f) GDPR):</strong> Preventing abuse, fraud detection, and securing application integrity.</li>
          <li><strong>Legal obligation (Art. 6(1)(c) GDPR):</strong> Maintaining statutory financial, tax, and accounting records for payouts.</li>
        </ul>

        <h2>5. Non-Affiliation Disclaimer (Meta Platforms, Inc.)</h2>
        <p>
          VistaBix is developed independently by Micany Apps and is <strong>not</strong> affiliated with, associated with,
          authorized, endorsed by, or in any way officially connected with Meta Platforms, Inc., Instagram, or any of their
          subsidiaries or affiliates. The official Meta website is at{" "}
          <a href="https://meta.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-fg">
            meta.com
          </a>
          .
        </p>

        <h2>6. Meta Platform Data Handling & Deletion</h2>
        <p>
          Instagram data is used solely to provide dashboard features and analytics in strict compliance with the Meta Platform Terms:
        </p>
        <ul>
          <li>Access tokens are securely encrypted at rest.</li>
          <li>Tokens are immediately revoked when an integration is disconnected.</li>
          <li>
            We provide an automated data-deletion endpoint (<code>/api/webhooks/meta/data-deletion</code>) complying with Meta requirements.
          </li>
        </ul>

        <h2>7. Cookies and Local Storage</h2>
        <p>
          We use strictly necessary cookies to operate the service. Any optional analytics or marketing cookies are disabled
          by default and require your explicit opt-in via our cookie banner. You can manage or reset your cookie preferences
          at any time in your browser settings.
        </p>

        <h2>8. Data Sharing & Third-Party Processors</h2>
        <p>
          We share only what is strictly necessary with trusted infrastructure providers bound by compliant Data Processing
          Agreements (DPAs):
        </p>
        <ul>
          <li><strong>Hosting & Database:</strong> Secure cloud infrastructure compliant with EU standards.</li>
          <li><strong>Payment & Payouts:</strong> Stripe (for payment processing and creator payouts).</li>
          <li><strong>Transactional Email:</strong> Resend (for outreach and service notifications).</li>
        </ul>
        <p><strong>We never sell, rent, or trade personal data to third parties.</strong></p>

        <h2>9. Data Retention</h2>
        <p>
          Consent and audit logs are retained while your partnership or workspace remains active. Financial and ledger records
          are retained in accordance with statutory accounting and tax retention periods. Upon a verified deletion request,
          non-statutory personal data is permanently erased.
        </p>

        <h2>10. Your GDPR & Data Subject Rights (DSR)</h2>
        <p>
          You hold the rights of access, rectification, erasure (&quot;right to be forgotten&quot;), restriction of processing, data portability,
          and objection.
        </p>
        <p>
          To exercise your rights, please visit our dedicated{" "}
          <Link href="/legal/dsr" className="underline hover:text-fg font-medium">
            GDPR & Data Subject Rights (DSR) Center
          </Link>{" "}
          or email us directly at <a href="mailto:contact@micanyapps.com" className="underline hover:text-fg">contact@micanyapps.com</a>.
        </p>

        <h2>11. Supervisory Authority</h2>
        <p>
          You have the right to lodge a complaint with the Swedish Authority for Privacy Protection (Integritetsskyddsmyndigheten - IMY)
          at <a href="https://www.imy.se" target="_blank" rel="noopener noreferrer" className="underline hover:text-fg">imy.se</a>,
          or your local European supervisory authority.
        </p>
      </div>
    </div>
  );
}
