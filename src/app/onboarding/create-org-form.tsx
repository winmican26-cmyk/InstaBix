"use client";

import { useActionState } from "react";
import { createOrgAction, type OrgState } from "@/lib/actions/org";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

export function CreateOrgForm() {
  const [state, action, pending] = useActionState<OrgState, FormData>(createOrgAction, {});
  return (
    <form action={action} className="mt-6 space-y-4">
      {state.error ? <p className="text-[12.5px] text-danger">{state.error}</p> : null}
      <Field label="Workspace name" htmlFor="name" required>
        <Input id="name" name="name" placeholder="Your company" required autoFocus />
      </Field>
      <SubmitButton className="w-full" size="lg" loading={pending}>
        {pending ? "Creating…" : "Create workspace"}
      </SubmitButton>
    </form>
  );
}
