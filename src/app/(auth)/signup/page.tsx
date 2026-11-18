import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create a workspace" };

export default async function SignupPage() {
  const session = await getSessionUser();
  if (session) redirect("/dashboard");

  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">Start a workspace</p>
      <h1 className="mt-3 font-display text-[30px] font-semibold leading-tight tracking-[-0.035em] text-fg">
        Build on real ground.
      </h1>
      <p className="mt-2 text-[13.5px] leading-6 text-muted">
        Your workspace starts empty on purpose. Connect an account, add a creator, and watch the first real row land.
      </p>
      <SignupForm />
      <p className="mt-6 text-center text-[12.5px] text-muted">
        Already have a workspace?{" "}
        <Link href="/login" className="font-semibold text-fg underline decoration-line-2 underline-offset-4 hover:decoration-lime">
          Sign in
        </Link>
      </p>
    </div>
  );
}
