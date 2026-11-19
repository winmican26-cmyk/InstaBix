import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Mark } from "@/components/brand/wordmark";
import { getMemberships, getSessionUser } from "@/lib/auth/session";
import { CREATOR_ROLE } from "@/lib/auth/roles";
import { CreatorSignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Create a creator account",
  description: "Register as a creator and track your InstaBix application and consent record.",
};

export default async function CreatorSignupPage() {
  const session = await getSessionUser();
  if (session) {
    const memberships = await getMemberships(session.user.id);
    if (memberships.some((row) => row.role === CREATOR_ROLE)) redirect("/creator");
  }

  return (
    <div className="app-canvas min-h-dvh">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5 sm:px-6">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <Mark className="size-8" />
            <span className="font-display text-[16px] font-semibold tracking-[-0.03em] text-fg">InstaBix</span>
          </Link>
          <Link href="/apply" className="inline-flex items-center gap-1.5 text-[12px] text-faint hover:text-muted">
            <ArrowLeft className="size-3.5" /> Just applying?
          </Link>
        </div>
      </header>

      <main id="main" className="mx-auto grid max-w-5xl gap-10 px-5 py-14 sm:px-6 lg:grid-cols-[1fr_1fr] lg:items-start">
        <div className="lg:sticky lg:top-20">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-lime">Creator account</p>
          <h1 className="mt-3 font-display text-[38px] font-semibold leading-[1.03] tracking-[-0.04em] text-fg sm:text-[46px]">
            Your application, in one place.
          </h1>
          <p className="mt-4 max-w-md text-[13.5px] leading-6 text-muted">
            Registering files the same real application as the apply form, and gives you a private portal to see its status and
            your consent record. An operator still reviews every application; nothing is built or sent automatically.
          </p>
          <div className="mt-7 space-y-2.5 rounded-lg border border-line bg-surface-2/40 p-4 text-[12px] leading-5 text-muted">
            <p className="font-semibold text-fg">What this account can and cannot do</p>
            <p>It can read your own application status and consent record.</p>
            <p>It cannot open operator dashboards, exports, revenue, audit logs or other creators&apos; records.</p>
            <p>Email verification is recorded as pending until a mail provider is configured.</p>
          </div>
          <p className="mt-6 text-[12px] text-muted">
            Already have a creator account? <Link href="/login" className="text-lime hover:underline">Sign in</Link>.
          </p>
        </div>

        <CreatorSignupForm />
      </main>
    </div>
  );
}
