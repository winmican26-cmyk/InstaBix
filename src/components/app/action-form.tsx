"use client";

import { useEffect, useRef, useActionState } from "react";
import { toast } from "sonner";
import { SubmitButton } from "@/components/ui/submit-button";

export type ActionFormState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
  portalUrl?: string;
  inviteUrl?: string;
};

/**
 * Wraps a server action that takes (prevState, formData). Reports the outcome
 * honestly: success is only shown when the action returned one.
 *
 * The state type is generic so an action may return extra fields (a shareable
 * portal or invite link, for example) without weakening the shape of the rest.
 */
export function ActionForm<State extends ActionFormState = ActionFormState>({
  action,
  children,
  submitLabel,
  pendingLabel,
  className,
  resetOnSuccess,
}: {
  action: (state: State, formData: FormData) => Promise<State>;
  children: React.ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<State | undefined, FormData>(async (prev, formData) => {
    const result = await action(prev ?? ({} as State), formData);
    if (result?.error) toast.error(result.error);
    else if (result?.success) toast.success(result.success);
    if (result?.portalUrl) {
      await navigator.clipboard.writeText(result.portalUrl).catch(() => null);
      toast.message("Portal link copied to clipboard");
    }
    return result;
  }, undefined);

  useEffect(() => {
    if (resetOnSuccess && state?.success) formRef.current?.reset();
  }, [resetOnSuccess, state?.success]);

  return (
    <form ref={formRef} action={formAction} className={className} noValidate>
      {state && state.error ? (
        <p role="alert" className="mb-4 rounded-md border border-danger/25 bg-danger/5 p-3 text-[12.5px] text-danger">
          {state.error}
        </p>
      ) : null}
      {state && state.success ? (
        <p role="status" className="mb-4 rounded-md border border-lime/25 bg-lime/5 p-3 text-[12.5px] text-lime">
          {state.success}
        </p>
      ) : null}
      {state && (state.inviteUrl || state.portalUrl) ? (
        <div className="mb-4 space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-faint">Shareable link</p>
          <input
            readOnly
            value={state.inviteUrl ?? state.portalUrl}
            className="w-full rounded-md border border-line bg-bg/60 px-2.5 py-2 font-mono text-[11px] text-muted"
            onFocus={(event) => event.currentTarget.select()}
            aria-label="Shareable link"
          />
        </div>
      ) : null}
      {children}
      <SubmitButton className="mt-5 w-full" loading={pending}>
        {pending ? (pendingLabel ?? "Working…") : submitLabel}
      </SubmitButton>
    </form>
  );
}
