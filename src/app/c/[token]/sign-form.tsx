"use client";

import { useActionState } from "react";
import { PenLine } from "lucide-react";
import type { PortalState } from "./actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function SignAgreementForm({
  action,
  defaultName,
  disabled,
}: {
  action: (state: PortalState, formData: FormData) => Promise<PortalState>;
  defaultName: string;
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  if (disabled) {
    return (
      <p className="rounded-lg border border-lime/25 bg-lime/5 p-3.5 text-[12.5px] leading-5 text-lime">
        Terms are already signed for this product. The stored agreement hash is shown below.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3" noValidate>
      {state.error ? (
        <p role="alert" className="rounded-md border border-danger/25 bg-danger/5 p-3 text-[12.5px] text-danger">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="rounded-md border border-lime/25 bg-lime/5 p-3 text-[12.5px] text-lime">
          {state.success}
        </p>
      ) : null}

      <Field label="Type your full legal name" htmlFor="signerName" error={state.fieldErrors?.signerName} required>
        <Input id="signerName" name="signerName" defaultValue={defaultName} autoComplete="name" required />
      </Field>

      <label className="flex items-start gap-2.5 rounded-lg border border-line bg-surface-2/40 p-3 text-[12px] leading-5 text-muted">
        <input type="checkbox" name="agreed" className="mt-0.5 size-4 accent-[#C6FF4A]" required />
        <span>
          I have read the terms above. I confirm I created or have the right to use the material supplied, and I agree to the
          revenue split shown for each product.
        </span>
      </label>
      {state.fieldErrors?.agreed ? <p className="text-xs text-danger">{state.fieldErrors.agreed}</p> : null}

      <SubmitButton loading={pending}>
        <PenLine /> Sign terms
      </SubmitButton>
    </form>
  );
}
