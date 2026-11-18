"use client";

import { useState, useTransition } from "react";
import { ChevronDown, Save } from "lucide-react";
import { toast } from "sonner";
import { saveSequenceStepAction } from "@/lib/actions/outreach";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";

type Step = { id: string; stepNumber: number; delayDays: number; subject: string; body: string };

export function SequenceSteps({ steps }: { steps: Step[] }) {
  return (
    <div className="divide-y divide-line/70">
      {steps.map((step) => (
        <StepRow key={step.id} step={step} />
      ))}
    </div>
  );
}

function StepRow({ step }: { step: Step }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="px-4 py-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
        aria-expanded={open}
      >
        <span className="grid size-6 place-items-center rounded bg-surface-3 font-mono text-[10px] text-muted">{step.stepNumber}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-medium text-fg">{step.subject}</span>
          <span className="block font-mono text-[10px] uppercase tracking-[0.08em] text-faint">
            send on day {step.delayDays} · drafts only
          </span>
        </span>
        <ChevronDown className={open ? "size-4 rotate-180 text-faint transition-transform" : "size-4 text-faint transition-transform"} aria-hidden />
      </button>

      {open ? (
        <form
          className="mt-3 space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            startTransition(async () => {
              const result = await saveSequenceStepAction(step.id, data);
              if (result.error) toast.error(result.error);
              else toast.success(result.success ?? "Saved.");
            });
          }}
        >
          <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
            <Input name="subject" defaultValue={step.subject} aria-label="Subject" />
            <Input name="delayDays" type="number" min={0} max={60} defaultValue={step.delayDays} aria-label="Delay in days" />
          </div>
          <Textarea name="body" defaultValue={step.body} rows={8} aria-label="Body" className="font-mono text-[12px]" />
          <Button type="submit" variant="secondary" size="sm" loading={pending}>
            <Save /> Save step
          </Button>
        </form>
      ) : null}
    </div>
  );
}
