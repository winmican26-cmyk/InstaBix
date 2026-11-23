import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { googleOAuthConfigured } from "@/lib/env";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

// Only vetted, generic copy reaches the browser. Raw provider errors stay server-side.
const GOOGLE_ERROR_NOTICES: Record<string, string> = {
  google_unavailable: "Google sign-in is not available right now. Use email and password instead.",
  google_invalid: "That Google sign-in request was invalid. Please try again.",
  google_expired: "That Google sign-in request expired. Please try again.",
  google_blocked: "Too many Google sign-in attempts. Try again later.",
  google_failed: "We couldn't sign you in with Google. Please try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ error }, session] = await Promise.all([searchParams, getSessionUser()]);
  if (session) redirect("/dashboard");
  const notice = error ? (GOOGLE_ERROR_NOTICES[error] ?? null) : null;

  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">Workspace access</p>
      <h1 className="mt-3 font-display text-[30px] font-semibold leading-tight tracking-[-0.035em] text-fg">Welcome back.</h1>
      <p className="mt-2 text-[13.5px] leading-6 text-muted">Sign in to see your real pipeline, approvals and ledger.</p>
      <LoginForm googleEnabled={googleOAuthConfigured} notice={notice} />
      <p className="mt-6 text-center text-[12.5px] text-muted">
        New here?{" "}
        <Link href="/signup" className="font-semibold text-fg underline decoration-line-2 underline-offset-4 hover:decoration-lime">
          Create a workspace
        </Link>
      </p>
    </div>
  );
}
