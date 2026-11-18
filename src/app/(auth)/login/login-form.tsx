"use client";

import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { loginAction, type AuthState } from "@/lib/actions/auth";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

const initialState: AuthState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialState);

  return (
    <form action={action} className="mt-7 space-y-4" noValidate>
      {state.error ? (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-danger/25 bg-danger/5 p-3 text-[12.5px] text-danger">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {state.error}
        </div>
      ) : null}
      <Field label="Email" htmlFor="email" error={state.fieldErrors?.email} required>
        <Input id="email" name="email" type="email" autoComplete="email" placeholder="you@company.com" required />
      </Field>
      <Field label="Password" htmlFor="password" error={state.fieldErrors?.password} required>
        <Input id="password" name="password" type="password" autoComplete="current-password" placeholder="••••••••••••" required />
      </Field>
      <SubmitButton className="w-full" size="lg" loading={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </SubmitButton>
      <p className="text-center text-[11.5px] text-faint">
        Sessions expire after 30 days. Forgot your password? Ask a workspace owner to reset it from Settings.
      </p>
    </form>
  );
}
