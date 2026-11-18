"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Plus, ShieldQuestion } from "lucide-react";
import { toast } from "sonner";
import { queueMessageAction, type OutreachState } from "@/lib/actions/outreach";
import { Select } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { unresolvedVariables } from "@/lib/email/template";

type CreatorOption = {
  id: string;
  username: string;
  displayName: string | null;
  consentStatus: string;
  contactEmail: string | null;
  status: string;
};

type SequenceOption = { id: string; name: string; status: string; steps: { id: string; stepNumber: number; subject: string; body: string; delayDays: number }[] };

export function QueueComposer({ creators, sequences }: { creators: CreatorOption[]; sequences: SequenceOption[] }) {
  const [state, action, pending] = useActionState<OutreachState, FormData>(queueMessageAction, {});
  const [creatorId, setCreatorId] = useState("");
  const [sequenceId, setSequenceId] = useState(sequences[0]?.id ?? "");
  const [stepId, setStepId] = useState(sequences[0]?.steps[0]?.id ?? "");

  useEffect(() => {
    if (state.success) toast.success(state.success);
    if (state.error) toast.error(state.error);
  }, [state]);

  const sequence = useMemo(() => sequences.find((s) => s.id === sequenceId), [sequences, sequenceId]);
  const step = useMemo(() => sequence?.steps.find((s) => s.id === stepId), [sequence, stepId]);
  const creator = useMemo(() => creators.find((c) => c.id === creatorId), [creators, creatorId]);
  const unresolved = step ? unresolvedVariables(`${step.subject}\n${step.body}`) : [];

  const blockedReason = !creator
    ? "Choose a creator."
    : creator.consentStatus !== "granted"
      ? `@${creator.username} has no recorded consent.`
      : !creator.contactEmail
        ? `@${creator.username} has no contact email.`
        : creator.status === "suppressed"
          ? `@${creator.username} is suppressed.`
          : null;

  if (sequences.length === 0) {
    return (
      <p className="rounded-lg border border-line bg-surface-2/40 p-4 text-[12.5px] text-muted">
        No sequence exists yet. Seed one in the database, or create one from the Settings surface. Drafts are required before
        anything can be queued.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <Field label="Creator" htmlFor="creatorId" required>
        <Select
          id="creatorId"
          name="creatorId"
          value={creatorId}
          onChange={(e) => setCreatorId(e.target.value)}
          required
        >
          <option value="">Choose a consented creator…</option>
          {creators.map((option) => (
            <option key={option.id} value={option.id}>
              @{option.username}
              {option.displayName ? ` · ${option.displayName}` : ""} · {option.consentStatus}
              {option.contactEmail ? "" : " · no email"}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Sequence" htmlFor="sequenceId" required>
          <Select
            id="sequenceId"
            name="sequenceId"
            value={sequenceId}
            onChange={(e) => {
              setSequenceId(e.target.value);
              const next = sequences.find((s) => s.id === e.target.value);
              setStepId(next?.steps[0]?.id ?? "");
            }}
          >
            {sequences.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.status}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Step" htmlFor="stepId" required>
          <Select id="stepId" name="stepId" value={stepId} onChange={(e) => setStepId(e.target.value)}>
            {(sequence?.steps ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                Step {s.stepNumber} · day {s.delayDays}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {step ? (
        <div className="rounded-lg border border-line bg-surface-2/40 p-3.5">
          <p className="label">Preview</p>
          <p className="mt-1.5 text-[13px] font-semibold text-fg">{step.subject}</p>
          <p className="mt-1 whitespace-pre-wrap text-[12px] leading-5 text-muted">{step.body.slice(0, 420)}</p>
          {unresolved.length ? (
            <p className="mt-2 rounded-md border border-amber/25 bg-amber/5 px-2 py-1.5 text-[11px] text-amber">
              Unresolved variables: {unresolved.map((v) => `{{${v}}}`).join(", ")} — the send will look broken on purpose.
            </p>
          ) : null}
        </div>
      ) : null}

      {blockedReason ? (
        <p className="flex items-start gap-2 rounded-md border border-amber/25 bg-amber/5 p-3 text-[12px] leading-5 text-amber">
          <ShieldQuestion className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {blockedReason} The server will reject this too — the check is not only in the browser.
        </p>
      ) : null}

      <SubmitButton loading={pending} disabled={Boolean(blockedReason)}>
        <Plus /> Queue for approval
      </SubmitButton>
    </form>
  );
}
