"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { signupAction, type AuthState } from "@/lib/actions/auth";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

const initialState: AuthState = {};

export function SignupForm() {
  const [state, action, pending] = useActionState(signupAction, initialState);

  return (
    <form action={action} className="mt-7 space-y-4" noValidate>
      {state.error ? (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-danger/25 bg-danger/5 p-3 text-[12.5px] text-danger">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {state.error}
        </div>
      ) : null}
      <Field label="Your name" htmlFor="name" error={state.fieldErrors?.name} required>
        <Input id="name" name="name" autoComplete="name" placeholder="Ada Okafor" required />
      </Field>
      <Field label="Work email" htmlFor="email" error={state.fieldErrors?.email} required>
        <Input id="email" name="email" type="email" autoComplete="email" placeholder="you@company.com" required />
      </Field>
      <Field label="Workspace name" htmlFor="orgName" error={state.fieldErrors?.orgName} hint="You can rename this later." required>
        <Input id="orgName" name="orgName" autoComplete="organization" placeholder="Your company" required />
      </Field>
      <Field
        label="Password"
        htmlFor="password"
        error={state.fieldErrors?.password}
        hint="At least 12 characters, with a letter and a number."
        required
      >
        <Input id="password" name="password" type="password" autoComplete="new-password" placeholder="••••••••••••" required />
      </Field>

      <div>
        <label className="flex items-start gap-2.5 text-[12px] leading-5 text-muted">
          <input
            type="checkbox"
            name="terms"
            className="mt-0.5 size-4 shrink-0 rounded border-line bg-bg accent-lime"
            aria-describedby="terms-error"
          />
          <span>
            I agree to the{" "}
            <Link href="/legal/terms" className="text-fg underline decoration-line-2 underline-offset-2 hover:decoration-lime">
              terms
            </Link>{" "}
            and{" "}
            <Link href="/legal/privacy" className="text-fg underline decoration-line-2 underline-offset-2 hover:decoration-lime">
              privacy policy
            </Link>
            , and I will only contact creators with a lawful basis.
          </span>
        </label>
        {state.fieldErrors?.terms ? (
          <p id="terms-error" className="mt-1.5 text-xs text-danger">
            {state.fieldErrors.terms}
          </p>
        ) : null}
      </div>

      <SubmitButton className="w-full" size="lg" loading={pending}>
        {pending ? "Creating workspace…" : "Create workspace"}
      </SubmitButton>
      <p className="text-center text-[11.5px] leading-4 text-faint">
        No credit card. No sample data. No creator is contacted without your explicit approval.
      </p>
    </form>
  );
}
