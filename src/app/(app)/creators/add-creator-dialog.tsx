"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus, ShieldQuestion } from "lucide-react";
import { toast } from "sonner";
import { createCreatorAction, type CreatorActionState } from "@/lib/actions/creators";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

export function AddCreatorDialog({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [state, action, pending] = useActionState<CreatorActionState, FormData>(createCreatorAction, {});

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
      setOpen(false);
    }
  }, [state.success]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus /> Add creator
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a creator</DialogTitle>
          <DialogDescription>
            Only add people you already know, who applied, or who published a business contact. The source is stored on the
            row and shown everywhere.
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="space-y-4" noValidate>
          {state.error ? (
            <p role="alert" className="rounded-md border border-danger/25 bg-danger/5 p-3 text-[12.5px] text-danger">
              {state.error}
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Instagram handle" htmlFor="username" error={state.fieldErrors?.username} required>
              <Input id="username" name="username" placeholder="@handle" autoCapitalize="none" required />
            </Field>
            <Field label="Display name" htmlFor="displayName" error={state.fieldErrors?.displayName}>
              <Input id="displayName" name="displayName" placeholder="How they present publicly" />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Source" htmlFor="source" hint="Recorded permanently on the row." required>
              <Select id="source" name="source" defaultValue="manual">
                <option value="manual">I already know them</option>
                <option value="applied">They applied</option>
                <option value="invited">I am inviting them</option>
                <option value="discovery">Found via Business Discovery</option>
              </Select>
            </Field>
            <Field label="Niche" htmlFor="niche" error={state.fieldErrors?.niche}>
              <Input id="niche" name="niche" placeholder="Home & meal systems" />
            </Field>
          </div>

          <Field
            label="Contact email"
            htmlFor="contactEmail"
            error={state.fieldErrors?.contactEmail}
            hint="Required before any outreach. Leave blank if you do not have a lawful basis to contact them yet."
          >
            <Input id="contactEmail" name="contactEmail" type="email" placeholder="business@example.com" />
          </Field>

          <Field
            label="What does their audience ask for?"
            htmlFor="notes"
            error={state.fieldErrors?.notes}
            hint="Used as the research brief. Never treated as a testimonial."
          >
            <Textarea id="notes" name="notes" rows={3} placeholder="Repeated request you can see in public replies…" />
          </Field>

          <div className="flex gap-2.5 rounded-lg border border-line bg-surface-2/40 p-3">
            <ShieldQuestion className="mt-0.5 size-4 shrink-0 text-amber" strokeWidth={1.75} aria-hidden />
            <p className="text-[11.5px] leading-5 text-muted">
              Adding a creator does not grant consent. Outreach stays blocked until a consent record exists, and the API will
              only return public metrics for public professional accounts.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton loading={pending}>{pending ? "Adding…" : "Add creator"}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
