import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { count, eq } from "drizzle-orm";
import { ArrowRight, Check, Circle, Mail, Sparkles, Users } from "lucide-react";
import { Instagram } from "@/components/brand/instagram-glyph";
import { getMemberships, getSessionUser } from "@/lib/auth/session";
import { canAccessOperator, hasOperatorMembership } from "@/lib/auth/roles";
import { withOrg } from "@/lib/db";
import { creatorAccounts, integrations, sequences } from "@/lib/db/schema";
import { Mark } from "@/components/brand/wordmark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreateOrgForm } from "./create-org-form";

export const metadata: Metadata = { title: "Set up" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  const memberships = await getMemberships(session.user.id);

  if (memberships.length === 0) {
    return (
      <main id="main" className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-16">
        <Mark className="size-10" />
        <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-lime">One last step</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.035em] text-fg">Name your workspace.</h1>
        <p className="mt-2 text-[13.5px] leading-6 text-muted">
          A workspace holds your creators, outreach, products and ledger. You can create more later.
        </p>
        <CreateOrgForm />
        <form action="/api/auth/logout" method="post" className="mt-6 text-center">
          <button type="submit" className="text-[12px] text-faint underline underline-offset-4 hover:text-muted">
            Sign out
          </button>
        </form>
      </main>
    );
  }

  // A creator-only session must never read operator onboarding aggregates.
  if (!hasOperatorMembership(memberships.map((m) => m.role))) redirect("/creator");

  const eligible = memberships.filter((m) => canAccessOperator(m.role));
  const active = eligible.find((m) => m.org.id === session.orgId) ?? eligible[0]!;
  const org = active.org;

  const [ig] = await withOrg(org.id, (tx) =>
    tx.select({ status: integrations.status }).from(integrations).where(eq(integrations.provider, "instagram")).limit(1),
  );
  const [creatorCount] = await withOrg(org.id, (tx) => tx.select({ n: count() }).from(creatorAccounts));
  const [sequenceCount] = await withOrg(org.id, (tx) =>
    tx.select({ n: count() }).from(sequences).where(eq(sequences.status, "active")),
  );

  const steps = [
    {
      title: "Connect Instagram",
      body: "Authorize a professional account. We read your own insights and use Business Discovery only for public metrics.",
      href: "/integrations",
      cta: "Open integrations",
      done: ig?.status === "connected",
      icon: Instagram,
    },
    {
      title: "Add your first creator",
      body: "Add someone you already know, invite them to the portal, or share the public application link.",
      href: "/creators?add=1",
      cta: "Add a creator",
      done: (creatorCount?.n ?? 0) > 0,
      icon: Users,
    },
    {
      title: "Review outreach before it sends",
      body: "Start from the three-step draft, edit it in your voice, and approve it. Nothing sends without a human.",
      href: "/outreach",
      cta: "Review sequences",
      done: (sequenceCount?.n ?? 0) > 0,
      icon: Mail,
    },
  ];
  const completed = steps.filter((s) => s.done).length;

  return (
    <main id="main" className="app-canvas min-h-dvh">
      <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center px-5 py-14">
        <div className="flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <Mark className="size-8" />
            <span className="font-display text-[16px] font-semibold tracking-[-0.03em] text-fg">VistaBix</span>
          </Link>
          <Badge tone="outline">{completed} of 3 complete</Badge>
        </div>

        <div className="mt-10">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-lime">Workspace ready</p>
          <h1 className="mt-3 font-display text-[34px] font-semibold leading-[1.08] tracking-[-0.04em] text-fg">
            {org.name} is live.
          </h1>
          <p className="mt-3 max-w-lg text-[14px] leading-6 text-muted">
            There is no demo data in here, and there never will be. Three real actions turn this from an empty shell into a
            working pipeline.
          </p>
        </div>

        <div className="mt-8 space-y-3">
          {steps.map((step, i) => {
            const Icon = step.icon;
            return (
              <div key={step.title} className={step.done ? "card border-lime/25 bg-lime/[0.03] p-5" : "card p-5"}>
                <div className="flex items-start gap-3.5">
                  <span
                    className={
                      step.done
                        ? "grid size-8 shrink-0 place-items-center rounded-full bg-lime text-accent-fg"
                        : "grid size-8 shrink-0 place-items-center rounded-full border border-line bg-surface-2 text-faint"
                    }
                  >
                    {step.done ? <Check className="size-4" /> : <Circle className="size-3" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Icon className="size-4 text-faint" strokeWidth={1.75} aria-hidden />
                      <h2 className="text-[14px] font-semibold text-fg">{step.title}</h2>
                      {step.done ? <Badge tone="lime">Done</Badge> : <Badge tone="neutral">Step {i + 1}</Badge>}
                    </div>
                    <p className="mt-1.5 text-[12.5px] leading-5 text-muted">{step.body}</p>
                    {!step.done ? (
                      <Button asChild variant="secondary" size="sm" className="mt-3">
                        <Link href={step.href}>
                          {step.cta} <ArrowRight />
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button asChild size="lg">
            <Link href="/dashboard">
              Enter workspace <ArrowRight />
            </Link>
          </Button>
          <Button asChild variant="ghost" size="lg">
            <Link href="/creators">
              <Sparkles /> See the creators page
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
