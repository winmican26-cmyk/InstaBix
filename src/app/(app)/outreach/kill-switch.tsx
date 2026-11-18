"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { PauseCircle, PlayCircle } from "lucide-react";
import { setOutreachPausedAction } from "@/lib/actions/outreach";
import { Button } from "@/components/ui/button";

export function KillSwitch({ paused }: { paused: boolean }) {
  const [pending, startTransition] = useTransition();
  const [isPaused, setIsPaused] = useState(paused);

  return (
    <Button
      type="button"
      variant={isPaused ? "danger" : "secondary"}
      size="sm"
      loading={pending}
      onClick={() => {
        const next = !isPaused;
        if (
          !window.confirm(
            next
              ? "Pause all outbound sending for the workspace? Approval and send buttons will refuse to run."
              : "Resume outbound sending? Human approval is still required for every message.",
          )
        )
          return;
        startTransition(async () => {
          const result = await setOutreachPausedAction(next);
          if (result.error) toast.error(result.error);
          else {
            setIsPaused(next);
            toast.success(result.success ?? "Updated");
          }
        });
      }}
    >
      {isPaused ? <PlayCircle /> : <PauseCircle />}
      {isPaused ? "Sending paused" : "Pause sending"}
    </Button>
  );
}
