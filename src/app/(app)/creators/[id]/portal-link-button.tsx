"use client";

import { useState, useTransition } from "react";
import { Copy, Link2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { createPortalLinkAction } from "@/lib/actions/creators";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/utils";

/**
 * Creates a private portal link and shows it in a dialog. Copy-to-clipboard is
 * attempted, but the link is always visible and selectable: a denied clipboard
 * permission must never be the reason an operator cannot reach the creator.
 */
export function PortalLinkButton({ creatorId }: { creatorId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function create() {
    startTransition(async () => {
      const result = await createPortalLinkAction(creatorId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (!result.portalUrl) {
        toast.error("The link was created but could not be returned. Reload and try again.");
        return;
      }
      setUrl(result.portalUrl);
      setExpiresAt(new Date(Date.now() + 14 * 86_400_000));
      setOpen(true);
      await navigator.clipboard.writeText(result.portalUrl).catch(() => null);
      toast.success("Portal link created. It expires in 14 days.");
    });
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied.");
    } catch {
      toast.error("Clipboard access was denied. Select the link and copy it manually.");
    }
  }

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={create} loading={pending}>
        <Link2 /> Portal link
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Private creator portal</DialogTitle>
            <DialogDescription>
              Anyone with this link can read the record for this creator. Send it only to the creator, through the channel
              they already agreed to.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Input readOnly value={url ?? ""} aria-label="Creator portal link" onFocus={(event) => event.currentTarget.select()} />
            <p className="flex items-start gap-2 text-[11.5px] leading-5 text-muted">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-lime" aria-hidden />
              <span>
                The link stays valid until it expires{expiresAt ? ` on ${formatDateTime(expiresAt)}` : ""}. Opening it records the
                first visit. Generating a new link does not revoke the old one until its expiry.
              </span>
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={copy} disabled={!url}>
              <Copy /> Copy link
            </Button>
            <Button type="button" onClick={() => setOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
