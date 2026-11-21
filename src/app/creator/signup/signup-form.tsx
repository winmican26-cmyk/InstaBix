"use client";

import { useActionState } from "react";
import { creatorSignupAction, type CreatorSignupState } from "./actions";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

const initialState: CreatorSignupState = {};

export function CreatorSignupForm() {
  const [state, action, pending] = useActionState(creatorSignupAction, initialState);

  return (
    <form action={action} className="card p-6 sm:p-7" noValidate>
      <h2 className="font-display text-[20px] font-semibold tracking-[-0.02em] text-fg">Create your creator account</h2>
      <p className="mt-1 text-[12.5px] leading-5 text-muted">
        One account, one application. You will be able to see its status and withdraw consent at any time.
      </p>

      {state.error ? (
        <p className="mt-4 rounded-md border border-danger/25 bg-danger/5 p-3 text-[12.5px] text-danger">{state.error}</p>
      ) : null}

      <div className="mt-5 space-y-4">
        <Field label="Full name" htmlFor="fullName" error={state.fieldErrors?.fullName} required>
          <Input id="fullName" name="fullName" autoComplete="name" placeholder="Ada Okafor" required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Instagram handle" htmlFor="username" error={state.fieldErrors?.username} required>
            <Input id="username" name="username" placeholder="@yourhandle" autoCapitalize="none" required />
          </Field>
          <Field label="Email" htmlFor="email" error={state.fieldErrors?.email} required>
            <Input id="email" name="email" type="email" autoComplete="email" placeholder="you@email.com" required />
          </Field>
        </div>
        <Field
          label="Password"
          htmlFor="password"
          error={state.fieldErrors?.password}
          hint="At least 12 characters, with a letter and a number."
          required
        >
          <Input id="password" name="password" type="password" autoComplete="new-password" required />
        </Field>
        <Field label="Niche" htmlFor="niche" error={state.fieldErrors?.niche} hint="Optional — what your content is about.">
          <Input id="niche" name="niche" placeholder="Home & meal systems" />
        </Field>
        <Field
          label="What does your audience keep asking for?"
          htmlFor="audienceAsk"
          error={state.fieldErrors?.audienceAsk}
          hint="One or two sentences. Stored with your consent record."
          required
        >
          <Textarea
            id="audienceAsk"
            name="audienceAsk"
            placeholder="They keep asking for the exact weekly meal plan and shopping list…"
            required
          />
        </Field>

        <div className="space-y-2.5 rounded-lg border border-line bg-surface-2/40 p-3.5">
          <label className="flex items-start gap-2.5 text-[12px] leading-5 text-muted">
            <input type="checkbox" name="consent" className="mt-0.5 size-4 shrink-0 rounded border-line bg-bg accent-lime" />
            <span>
              I consent to VistaBix reviewing my public Instagram profile and contacting me about a partnership.
              {state.fieldErrors?.consent ? (
                <span className="mt-1 block text-danger">{state.fieldErrors.consent}</span>
              ) : null}
            </span>
          </label>
          <label className="flex items-start gap-2.5 text-[12px] leading-5 text-muted">
            <input type="checkbox" name="terms" className="mt-0.5 size-4 shrink-0 rounded border-line bg-bg accent-lime" />
            <span>
              I have read the partnership approach: the product is built with me, I approve it before launch, and the split is
              agreed in writing before work begins.
              {state.fieldErrors?.terms ? <span className="mt-1 block text-danger">{state.fieldErrors.terms}</span> : null}
            </span>
          </label>
        </div>

        <SubmitButton className="w-full" size="lg" loading={pending}>
          Create account
        </SubmitButton>
        <p className="text-center text-[11px] leading-4 text-faint">
          Your email starts unverified. Verification delivery begins once a mail provider is configured — no verified state is
          assumed.
        </p>
      </div>
    </form>
  );
}
