"use client";

import { ActionForm } from "@/components/app/action-form";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { addChapterAction } from "@/lib/actions/studio";

/**
 * Manual outline authoring. The generate button needs a model and real captions;
 * this form needs neither, so a workspace can be operated by hand from day one.
 */
export function AddChapterForm({ productId }: { productId: string }) {
  return (
    <ActionForm
      action={addChapterAction.bind(null, productId)}
      submitLabel="Add chapter"
      pendingLabel="Adding…"
      resetOnSuccess
    >
      <div className="space-y-3">
        <Field label="Chapter title" htmlFor="new-chapter-title" required>
          <Input id="new-chapter-title" name="title" placeholder="Start with the smallest change" required maxLength={90} />
        </Field>
        <Field label="One-line summary" htmlFor="new-chapter-summary" hint="Optional. Shown in the outline list.">
          <Input id="new-chapter-summary" name="summary" placeholder="What this chapter promises" maxLength={240} />
        </Field>
      </div>
    </ActionForm>
  );
}
