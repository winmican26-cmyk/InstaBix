"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";

type ActionResult = { error?: string; success?: string; portalUrl?: string; inviteUrl?: string } | void;

export function ActionButton({
  action,
  children,
  confirm,
  successMessage,
  errorMessage,
  ...props
}: {
  action: () => Promise<ActionResult>;
  children: React.ReactNode;
  confirm?: string;
  successMessage?: string;
  errorMessage?: string;
} & Omit<ButtonProps, "onClick" | "type">) {
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  function run() {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true);
    startTransition(async () => {
      try {
        const result = await action();
        if (result && result.error) toast.error(errorMessage ?? result.error);
        else if (result && result.success) toast.success(successMessage ?? result.success);
        else if (successMessage) toast.success(successMessage);
        if (result && (result.portalUrl || result.inviteUrl)) {
          await navigator.clipboard.writeText(result.portalUrl ?? result.inviteUrl ?? "").catch(() => null);
          toast.message("Link copied to clipboard");
        }
      } catch {
        toast.error(errorMessage ?? "The action failed. Check the server log for the request id.");
      } finally {
        setBusy(false);
      }
    });
  }

  return (
    <Button type="button" onClick={run} loading={pending || busy} {...props}>
      {children}
    </Button>
  );
}
