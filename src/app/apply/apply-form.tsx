"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { applyAction, type ApplyState } from "./actions";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Button } from "@/components/ui/button";

const initialState: ApplyState = {};

export function ApplyForm() {
  const [state, action, pending] = useActionState(applyAction, initialState);

  if (state.ok) {
    return (
      <div className="card p-7 text-center">
        <CheckCircle2 className="mx-auto size-9 text-lime" strokeWidth={1.6} />
        <h2 className="mt-4 font-display text-[24px] font-semibold tracking-[-0.03em] text-fg">
          You&apos;re in the queue, {state.applicantName}.
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-[13px] leading-6 text-muted">
          Your application and consent record are saved. An operator will review the account and reach out at the email you
          provided if there is a fit. No product is built and no message is sent without your approval.
        </p>
        <Button asChild variant="outline" className="mt-6">
          <a href="/for-creators">Back to the creator page</a>
        </Button>
        <p className="mt-4 text-[12px] text-muted">
          Want to track this application?{" "}
          <a href="/creator/signup" className="text-lime hover:underline">
            Create a creator account
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="card p-6 sm:p-7" noValidate>
      <h2 className="font-display text-[20px] font-semibold tracking-[-0.02em] text-fg">Partner application</h2>
      <p className="mt-1 text-[12.5px] leading-5 text-muted">Every field is stored with your consent record.</p>

      {state.error ? <p className="mt-4 rounded-md border border-danger/25 bg-danger/5 p-3 text-[12.5px] text-danger">{state.error}</p> : null}

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
        <Field label="Niche" htmlFor="niche" error={state.fieldErrors?.niche} hint="Sports, parenting, finance, home, AI tools, faith — or your own words.">
          <Input id="niche" name="niche" placeholder="Home & meal systems" />
        </Field>
        <Field
          label="What does your audience keep asking for?"
          htmlFor="audienceAsk"
          error={state.fieldErrors?.audienceAsk}
          hint="One or two sentences. This is the most useful thing you can tell us."
          required
        >
          <Textarea id="audienceAsk" name="audienceAsk" placeholder="They keep asking for the exact weekly meal plan and shopping list…" required />
        </Field>

        <div className="space-y-2.5 rounded-lg border border-line bg-surface-2/40 p-3.5">
          <label className="flex items-start gap-2.5 text-[12px] leading-5 text-muted">
            <input type="checkbox" name="consent" className="mt-0.5 size-4 shrink-0 rounded border-line bg-bg accent-lime" />
            <span>
              I consent to InstaBix reviewing my public Instagram profile and contacting me about a partnership.
              {state.fieldErrors?.consent ? <span className="mt-1 block text-danger">{state.fieldErrors.consent}</span> : null}
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
          {pending ? "Submitting…" : "Submit application"}
        </SubmitButton>
        <p className="text-center text-[11px] leading-4 text-faint">
          You can withdraw consent and request deletion at any time. An account is optional, but{" "}
          <a href="/creator/signup" className="text-lime hover:underline">
            registering lets you track your application
          </a>
          .
        </p>
      </div>
    </form>
  );
}
