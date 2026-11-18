"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { createProductAction, type StudioState } from "@/lib/actions/studio";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";

type CreatorOption = { id: string; username: string; displayName: string | null; consentStatus: string };

const PRICES = [
  { value: 1900, label: "$19" },
  { value: 2900, label: "$29" },
  { value: 4900, label: "$49" },
  { value: 9700, label: "$97" },
];

export function NewProductDialog({
  creators,
  defaultOpen = false,
}: {
  creators: CreatorOption[];
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [state, action, pending] = useActionState<StudioState, FormData>(createProductAction, {});

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) {
      toast.success(state.success);
      setOpen(false);
      if (state.productId) router.push(`/studio/${state.productId}`);
    }
  }, [state, router]);

  const eligible = creators.filter((c) => c.consentStatus === "granted");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Sparkles /> New product
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Open a product</DialogTitle>
          <DialogDescription>
            Start with the commercial frame. The outline is generated from real captions and creator input, then a human
            approves it.
          </DialogDescription>
        </DialogHeader>

        {eligible.length === 0 ? (
          <p className="rounded-lg border border-amber/25 bg-amber/5 p-4 text-[12.5px] leading-5 text-amber">
            No creator in this workspace has recorded consent. A product cannot be opened against an unconsented creator.
          </p>
        ) : (
          <form action={action} className="space-y-4" noValidate>
            <Field label="Creator" htmlFor="creatorId" required>
              <Select id="creatorId" name="creatorId" required>
                <option value="">Choose a consented creator…</option>
                {eligible.map((creator) => (
                  <option key={creator.id} value={creator.id}>
                    @{creator.username}
                    {creator.displayName ? ` · ${creator.displayName}` : ""}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Working title"
              htmlFor="title"
              error={state.fieldErrors?.title}
              hint="You can change this after the outline exists."
              required
            >
              <Input id="title" name="title" placeholder="The Sunday Reset" required />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Price" htmlFor="priceCents" required>
                <Select id="priceCents" name="priceCents" defaultValue="4900">
                  {PRICES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Creator share (basis points)" htmlFor="splitCreatorBps" hint="6000 = 60%. The operator absorbs rounding." required>
                <Input
                  id="splitCreatorBps"
                  name="splitCreatorBps"
                  type="number"
                  min={0}
                  max={10000}
                  step={100}
                  defaultValue={6000}
                  required
                />
              </Field>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <SubmitButton loading={pending}>{pending ? "Opening…" : "Open product"}</SubmitButton>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
