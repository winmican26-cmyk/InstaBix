import type { Metadata } from "next";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { ArrowLeft, Lock, MailWarning } from "lucide-react";
import { Mark } from "@/components/brand/wordmark";
import { requireCreator } from "@/lib/auth/session";
import { withOrg } from "@/lib/db";
import { creatorAccounts } from "@/lib/db/schema";
import { signOutAction } from "@/lib/actions/auth";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Creator portal",
  description: "Your VistaBix application status and consent record.",
};

export default async function CreatorPortalPage() {
  const { user, org } = await requireCreator();

  // RLS binds the tenant; the userId predicate limits the read to this login's
  // own application, so one creator can never see another creator's row.
  const application = await withOrg(org.id, async (tx) => {
    const [row] = await tx
      .select()
      .from(creatorAccounts)
      .where(and(eq(creatorAccounts.orgId, org.id), eq(creatorAccounts.userId, user.id)))
      .limit(1);
    return row ?? null;
  });

  return (
    <div className="app-canvas min-h-dvh">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5 sm:px-6">
          <div className="inline-flex items-center gap-2.5">
            <Mark className="size-8" />
            <span className="font-display text-[16px] font-semibold tracking-[-0.03em] text-fg">VistaBix</span>
            <span className="ml-2 rounded border border-line px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
              Creator portal
            </span>
          </div>
          <form action={signOutAction}>
            <button type="submit" className="text-[12px] text-muted hover:text-fg">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-5xl px-5 py-12 sm:px-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-lime">Signed in as {user.name}</p>
        <h1 className="mt-3 font-display text-[34px] font-semibold tracking-[-0.04em] text-fg">Your application</h1>
        <p className="mt-2 max-w-xl text-[13px] leading-6 text-muted">
          This portal only ever shows records attached to your own login. Operator dashboards, exports and other creators are
          not reachable from this account.
        </p>

        {!user.emailVerifiedAt ? (
          <div className="mt-7 flex gap-3 rounded-lg border border-amber-400/25 bg-amber-400/5 p-4">
            <MailWarning className="mt-0.5 size-4 shrink-0 text-amber-400" strokeWidth={1.75} />
            <div>
              <p className="text-[13px] font-semibold text-fg">Email not verified</p>
              <p className="mt-1 text-[12px] leading-5 text-muted">
                We have recorded your address as unverified. Verification delivery is deferred until a mail provider is
                configured; no verified state is assumed in the meantime.
              </p>
            </div>
          </div>
        ) : null}

        {application ? (
          <section className="card mt-6 p-6 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.14em] text-faint">Instagram handle</p>
                <p className="mt-1 font-display text-[22px] font-semibold tracking-[-0.02em] text-fg">@{application.username}</p>
              </div>
              <span className="rounded-full border border-line bg-surface-2 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                {application.status}
              </span>
            </div>
            <dl className="mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-2">
              <div>
                <dt className="text-[11px] uppercase tracking-[0.14em] text-faint">Submitted</dt>
                <dd className="mt-1 text-[13px] text-fg">{formatDate(application.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-[0.14em] text-faint">Niche</dt>
                <dd className="mt-1 text-[13px] text-fg">{application.niche || "—"}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-[0.14em] text-faint">Consent</dt>
                <dd className="mt-1 text-[13px] text-fg">{application.consentStatus}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-[0.14em] text-faint">Contact email</dt>
                <dd className="mt-1 text-[13px] text-fg">{application.contactEmail ?? user.email}</dd>
              </div>
            </dl>
            <p className="mt-6 rounded-lg border border-line bg-surface-2/40 p-3.5 text-[12px] leading-5 text-muted">
              Nothing is built, published or sent without your approval. You can withdraw consent and ask for deletion at any
              time by replying to the operator.
            </p>
          </section>
        ) : (
          <div className="card mt-6 p-7">
            <p className="font-display text-[20px] font-semibold text-fg">No linked application</p>
            <p className="mt-2 text-[13px] leading-6 text-muted">
              This login has no linked creator application yet. Ask the operator to link one to your account — a new public
              application is not attached to an existing login automatically.
            </p>
            <Link href="/apply" className="mt-4 inline-block text-[13px] text-lime hover:underline">
              Open the public application form
            </Link>
          </div>
        )}

        <p className="mt-8 flex items-center gap-2 text-[11px] text-faint">
          <Lock className="size-3.5" strokeWidth={1.75} /> Scoped to organisation {org.name}.
          <Link href="/" className="inline-flex items-center gap-1 hover:text-muted">
            <ArrowLeft className="size-3" /> Site
          </Link>
        </p>
      </main>
    </div>
  );
}
