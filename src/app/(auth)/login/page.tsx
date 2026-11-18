import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const session = await getSessionUser();
  if (session) redirect("/dashboard");

  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">Workspace access</p>
      <h1 className="mt-3 font-display text-[30px] font-semibold leading-tight tracking-[-0.035em] text-fg">Welcome back.</h1>
      <p className="mt-2 text-[13.5px] leading-6 text-muted">Sign in to see your real pipeline, approvals and ledger.</p>
      <LoginForm />
      <p className="mt-6 text-center text-[12.5px] text-muted">
        New here?{" "}
        <Link href="/signup" className="font-semibold text-fg underline decoration-line-2 underline-offset-4 hover:decoration-lime">
          Create a workspace
        </Link>
      </p>
    </div>
  );
}
