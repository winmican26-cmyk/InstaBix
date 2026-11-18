"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { setCreatorEmailAction } from "@/lib/actions/creators";

export function ContactForm({
  creatorId,
  initialEmail,
  initialSource,
}: {
  creatorId: string;
  initialEmail: string | null;
  initialSource: string;
}) {
  const [email, setEmail] = useState(initialEmail ?? "");
  const [source, setSource] = useState(initialSource === "none" ? "operator_entered" : initialSource);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await setCreatorEmailAction(
            creatorId,
            email,
            source as "creator_provided" | "public_business" | "operator_entered",
          );
          if (result.error) toast.error(result.error);
          else if (result.success) toast.success(result.success);
        });
      }}
    >
      <Field label="Contact email" htmlFor="contactEmail" hint="The provenance is stored with the address and shown in the audit log.">
        <Input
          id="contactEmail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          placeholder="business@example.com"
        />
      </Field>
      <Field label="Where did it come from?" htmlFor="emailSource">
        <Select id="emailSource" value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="creator_provided">The creator provided it</option>
          <option value="public_business">Published for business enquiries</option>
          <option value="operator_entered">I entered it myself</option>
        </Select>
      </Field>
      <Button type="submit" variant="secondary" size="sm" loading={pending}>
        Save contact
      </Button>
    </form>
  );
}
