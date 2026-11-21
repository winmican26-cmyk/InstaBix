import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of service · VistaBix & Micany Apps",
  description: "Terms of Service for VistaBix, an application part of Micany Apps.",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16 sm:px-6">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">Legal</p>
      <h1 className="mt-3 font-display text-[36px] font-semibold tracking-[-0.04em] text-fg">Terms of service</h1>
      <p className="mt-2 text-[12px] text-faint">
        Version 2026-02 · Operated under Micany Apps (Västerås, Sweden)
      </p>

      <div className="prose-legal mt-8">
        <h2>1. The Service</h2>
        <p>
          <strong>VistaBix</strong> is a creator partnership and revenue-split management engine operated under{" "}
          <a href="https://micanyapps.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-fg">
            Micany Apps
          </a>{" "}
          (Michael Anyanwu, Västerås, Sweden). VistaBix provides tools for consent-first creator discovery, outreach management,
          digital product collaboration, and transparent payout distribution.
        </p>

        <h2>2. Third-Party Platform Disclaimers (Not a Part of Meta)</h2>
        <div className="my-6 rounded-lg border border-line bg-card/60 p-5">
          <p className="text-[13px] leading-relaxed text-muted">
            <strong>Disclaimer:</strong> VistaBix is an independent service created by Micany Apps. VistaBix is{" "}
            <strong>not</strong> affiliated with, associated with, authorized, sponsored, or endorsed by Meta Platforms, Inc.,
            Instagram, or any of their affiliates. &quot;Instagram&quot; and related marks are registered trademarks of Meta Platforms, Inc.
          </p>
        </div>

        <h2>3. Acceptable Use Policy</h2>
        <p>Users and workspace operators agree that they will not:</p>
        <ul>
          <li>Scrape, crawl, or access Instagram or any platform via unofficial, unauthorized, or private endpoints.</li>
          <li>Upload purchased contact lists or initiate communication without a lawful basis or consent.</li>
          <li>Misrepresent a creator&apos;s endorsement, relationship, product value, or revenue split.</li>
          <li>Attempt to bypass security boundaries, tenant isolation, sending caps, or approval gates.</li>
        </ul>

        <h2>4. Creator Partnerships & Agreements</h2>
        <p>
          A partnership begins only when a creator accepts the transparent agreement presented via the portal. The agreement
          specifies the product, pricing, revenue split, licenses, review period, and refund policy. VistaBix cryptographically
          records the document hash and acceptance metadata.
        </p>

        <h2>5. Revenue Splits & Payouts</h2>
        <p>
          Payments are handled via secure processing providers (e.g., Stripe, Whop). Creator payouts follow transparent,
          immutable ledger entries. The standard rule enforces creator-favored splits (60% creator / 40% operator on the first
          product, 50% / 50% on subsequent products, or as explicitly set in workspace settings).
        </p>

        <h2>6. Intellectual Property</h2>
        <p>
          Creators retain complete ownership of their name, image, likeness, brand, and audience. Workspace operators retain
          rights to their proprietary software, custom systems, and templates. Generated digital product drafts must be
          reviewed and approved by the creator prior to publication.
        </p>

        <h2>7. Data Protection & Privacy</h2>
        <p>
          Use of VistaBix is governed by our{" "}
          <Link href="/legal/privacy" className="underline hover:text-fg font-medium">
            Privacy Policy
          </Link>{" "}
          and our{" "}
          <Link href="/legal/dsr" className="underline hover:text-fg font-medium">
            GDPR & DSR Center
          </Link>
          .
        </p>

        <h2>8. Limitation of Liability</h2>
        <p>
          To the maximum extent permitted by Swedish and European Union law, Micany Apps and its operators provide VistaBix
          on an &quot;as is&quot; and &quot;as available&quot; basis without warranties of any kind. Micany Apps shall not be liable for any
          indirect, incidental, or consequential damages resulting from platform use.
        </p>

        <h2>9. Governing Law and Jurisdiction</h2>
        <p>
          These Terms of Service are governed by the substantive laws of Sweden. Any dispute, controversy, or claim arising
          out of or in connection with these terms shall be subject to the jurisdiction of the Swedish courts.
        </p>

        <h2>10. Contact</h2>
        <p>
          For legal inquiries, terms clarification, or notices:
        </p>
        <ul>
          <li><strong>Entity:</strong> Micany Apps</li>
          <li><strong>Website:</strong> <a href="https://micanyapps.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-fg">micanyapps.com</a></li>
          <li><strong>Email:</strong> <a href="mailto:contact@micanyapps.com" className="underline hover:text-fg">contact@micanyapps.com</a></li>
          <li><strong>Location:</strong> Västerås, Sweden</li>
        </ul>
      </div>
    </div>
  );
}
