"use client";

import { useActionState } from "react";
import { UserPlus } from "lucide-react";
import type { InviteState } from "./actions";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

export function AcceptForm({
  action,
  needsName,
  email,
}: {
  action: (state: InviteState, formData: FormData) => Promise<InviteState>;
  needsName: boolean;
  email: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.error ? (
        <p role="alert" className="rounded-md border border-danger/25 bg-danger/5 p-3 text-[12.5px] text-danger">
          {state.error}
        </p>
      ) : null}

      {needsName ? (
        <Field label="Your name" htmlFor="name" error={state.fieldErrors?.name} required>
          <Input id="name" name="name" autoComplete="name" placeholder="Alex Rivera" required />
        </Field>
      ) : null}

      <Field
        label={needsName ? "Choose a password" : "Your password"}
        htmlFor="password"
        hint={needsName ? "At least 12 characters, with mixed case and a number." : `Account for ${email}.`}
        error={state.fieldErrors?.password}
        required
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={needsName ? "new-password" : "current-password"}
          required
        />
      </Field>

      <SubmitButton className="w-full" loading={pending}>
        <UserPlus /> {pending ? "Joining…" : "Accept and join"}
      </SubmitButton>
    </form>
  );
}
