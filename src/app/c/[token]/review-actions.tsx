"use client";

import { useState, useTransition } from "react";
import { Check, MessageSquareWarning } from "lucide-react";
import { toast } from "sonner";
import { reviewProductAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";

export function ReviewActions({ token, productId }: { token: string; productId: string }) {
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(decision: "approve" | "changes") {
    if (decision === "changes" && note.trim().length < 5) {
      toast.error("Add a short note explaining what to change.");
      return;
    }
    if (decision === "approve" && !window.confirm("Approve this product for publication?")) return;
    startTransition(async () => {
      const result = await reviewProductAction(token, productId, decision, note);
      if (result.error) toast.error(result.error);
      else toast.success(result.success ?? "Review stored.");
    });
  }

  return (
    <div className="space-y-3">
      <Textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={3}
        placeholder="Optional when approving. Required when requesting changes."
        aria-label="Note for the operator"
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => submit("approve")} loading={pending}>
          <Check /> Approve
        </Button>
        <Button type="button" variant="secondary" onClick={() => submit("changes")} loading={pending}>
          <MessageSquareWarning /> Request changes
        </Button>
      </div>
      <p className="text-[11px] leading-5 text-faint">
        Approval stores your decision in the workspace audit log. Publication is a separate operator action.
      </p>
    </div>
  );
}
