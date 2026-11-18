"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Select } from "@/components/ui/input";
import { setCreatorStatusAction } from "@/lib/actions/creators";
import { CREATOR_STATUS_LABEL } from "@/lib/constants";

const STATUSES = ["new", "reviewing", "qualified", "approved", "contacted", "negotiating", "partnered", "declined", "suppressed"];

export function StatusSelect({ creatorId, value }: { creatorId: string; value: string }) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState(value);

  return (
    <Select
      aria-label="Creator status"
      className="h-8 w-40 text-[12.5px]"
      value={status}
      disabled={pending}
      onChange={(event) => {
        const next = event.target.value;
        setStatus(next);
        startTransition(async () => {
          const result = await setCreatorStatusAction(creatorId, next);
          if (result.error) {
            setStatus(value);
            toast.error(result.error);
          } else if (result.success) {
            toast.success(result.success);
          }
        });
      }}
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {CREATOR_STATUS_LABEL[s] ?? s}
        </option>
      ))}
    </Select>
  );
}
