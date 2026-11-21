import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "GDPR & Data Subject Rights (DSR) · VistaBix",
  description:
    "Exercise your GDPR and Data Subject Rights with VistaBix and Micany Apps. Submit access, rectification, deletion, and export requests.",
};

export default function DsrGdprPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16 sm:px-6">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">Compliance · GDPR Article 12–23</p>
      <h1 className="mt-3 font-display text-[36px] font-semibold tracking-[-0.04em] text-fg">
        Data Subject Rights (DSR) & GDPR
      </h1>
      <p className="mt-2 text-[12px] text-faint">
        Micany Apps · Registered in Sweden (EU) · Applicable to EU/EEA and Global Users
      </p>

      <div className="prose-legal mt-8">
        <h2>Your Rights Under GDPR</h2>
        <p>
          Under the General Data Protection Regulation (EU Regulation 2016/679) and applicable Swedish data protection laws
          (Dataskyddslagen), you hold statutory rights regarding your personal data processed by VistaBix and Micany Apps:
        </p>

        <div className="grid gap-4 sm:grid-cols-2 not-prose my-6">
          <div className="rounded-lg border border-line bg-card/50 p-4">
            <h3 className="font-semibold text-fg text-[13.5px]">Right of Access (Art. 15)</h3>
            <p className="mt-1 text-[12px] text-muted leading-relaxed">
              Request confirmation of whether your data is being processed, and receive a copy of your personal data.
            </p>
          </div>
          <div className="rounded-lg border border-line bg-card/50 p-4">
            <h3 className="font-semibold text-fg text-[13.5px]">Right to Erasure / &quot;Be Forgotten&quot; (Art. 17)</h3>
            <p className="mt-1 text-[12px] text-muted leading-relaxed">
              Request immediate deletion of your personal data where retention is no longer necessary or consent is withdrawn.
            </p>
          </div>
          <div className="rounded-lg border border-line bg-card/50 p-4">
            <h3 className="font-semibold text-fg text-[13.5px]">Right to Rectification (Art. 16)</h3>
            <p className="mt-1 text-[12px] text-muted leading-relaxed">
              Request correction of inaccurate or incomplete personal records without undue delay.
            </p>
          </div>
          <div className="rounded-lg border border-line bg-card/50 p-4">
            <h3 className="font-semibold text-fg text-[13.5px]">Data Portability (Art. 20)</h3>
            <p className="mt-1 text-[12px] text-muted leading-relaxed">
              Receive your personal and creator metric data in a structured, commonly used, and machine-readable format (JSON/CSV).
            </p>
          </div>
          <div className="rounded-lg border border-line bg-card/50 p-4">
            <h3 className="font-semibold text-fg text-[13.5px]">Right to Restrict Processing (Art. 18)</h3>
            <p className="mt-1 text-[12px] text-muted leading-relaxed">
              Restrict the processing of your data while an accuracy or objection claim is verified.
            </p>
          </div>
          <div className="rounded-lg border border-line bg-card/50 p-4">
            <h3 className="font-semibold text-fg text-[13.5px]">Right to Object & Revoke Consent (Art. 21)</h3>
            <p className="mt-1 text-[12px] text-muted leading-relaxed">
              Object to automated communications or revoke third-party platform authorizations (e.g., Meta/Instagram tokens).
            </p>
          </div>
        </div>

        <h2>Automated Meta & Instagram Data Deletion</h2>
        <p>
          If you connected an Instagram account or authorized our app via Facebook Login, you can revoke access at any time
          directly in your Instagram or Facebook Settings &gt; Apps and Websites. Meta triggers our automated data-deletion
          callback (<code>/api/webhooks/meta/data-deletion</code>), which immediately purges your stored OAuth tokens,
          cached public media samples, snapshots, and scores from our active database.
        </p>

        <h2>How to Submit a DSR Request</h2>
        <p>
          To exercise any of your rights (access, deletion, correction, or export), you can contact our Data Protection
          Officer / Privacy Lead via email:
        </p>

        <div className="rounded-lg border border-line bg-card/70 p-5 not-prose my-6">
          <p className="text-[13px] font-medium text-fg">Direct DSR Submission Channel</p>
          <div className="mt-3 space-y-1.5 text-[12.5px] text-muted">
            <p><strong>Recipient:</strong> Privacy & DSR Handling · Micany Apps</p>
            <p><strong>Email:</strong> <a href="mailto:contact@micanyapps.com?subject=GDPR%20Data%20Subject%20Request%20-%20VistaBix" className="text-lime underline">contact@micanyapps.com</a></p>
            <p><strong>Response Timeline:</strong> Within 30 calendar days as mandated by Article 12(3) GDPR.</p>
            <p><strong>Required Information:</strong> Your registered email or Instagram handle so we can identify and verify the relevant records.</p>
          </div>
        </div>

        <h2>Supervisory Authority</h2>
        <p>
          If you believe our processing of your personal data violates GDPR standards, you have the right to lodge a complaint
          with the competent supervisory authority:
        </p>
        <ul>
          <li><strong>Sweden (Lead Authority):</strong> Integritetsskyddsmyndigheten (IMY) — <a href="https://www.imy.se" target="_blank" rel="noopener noreferrer" className="underline hover:text-fg">www.imy.se</a></li>
          <li>Or your local EU Member State Data Protection Authority.</li>
        </ul>
      </div>
    </div>
  );
}
