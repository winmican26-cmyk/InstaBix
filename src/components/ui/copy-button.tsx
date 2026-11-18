"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";

export function CopyButton({
  value,
  label = "Copy",
  copiedLabel = "Copied",
  toastMessage,
  ...props
}: { value: string; label?: string; copiedLabel?: string; toastMessage?: string } & Omit<ButtonProps, "onClick">) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (toastMessage) toast.success(toastMessage);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Could not copy. Select the text and copy manually.");
    }
  }

  return (
    <Button type="button" variant="secondary" size="sm" onClick={copy} {...props}>
      {copied ? <Check className="text-lime" /> : <Copy />}
      {copied ? copiedLabel : label}
    </Button>
  );
}
