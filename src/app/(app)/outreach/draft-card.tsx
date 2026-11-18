"use client";

import { useState, useTransition } from "react";
import { Check, Pencil, Send, X } from "lucide-react";
import { toast } from "sonner";
import { approveAndSendAction, cancelMessageAction, updateDraftAction } from "@/lib/actions/outreach";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/app/action-button";
import { unresolvedVariables } from "@/lib/email/template";
import { timeAgo } from "@/lib/utils";

export function DraftCard({
  messageId,
  username,
  displayName,
  consent,
  toEmail,
  subject,
  body,
  createdAt,
  paused,
}: {
  messageId: string;
  username: string;
  displayName: string | null;
  consent: string;
  toEmail: string | null;
  subject: string | null;
  body: string;
  createdAt: string;
  paused: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const unresolved = unresolvedVariables(`${subject ?? ""}\n${body}`);

  return (
    <div className="rounded-lg border border-line bg-surface-2/30 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-fg">
            @{username}
            {displayName ? <span className="ml-2 font-normal text-muted">{displayName}</span> : null}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-faint">
            to {toEmail ?? "no address"} · queued {timeAgo(createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge tone="amber">needs approval</Badge>
          <Badge tone={consent === "granted" ? "lime" : "danger"}>consent {consent}</Badge>
        </div>
      </div>

      {editing ? (
        <form
          className="mt-3 space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            startTransition(async () => {
              const result = await updateDraftAction(messageId, data);
              if (result.error) toast.error(result.error);
              else {
                toast.success(result.success ?? "Draft updated.");
                setEditing(false);
              }
            });
          }}
        >
          <Input name="subject" defaultValue={subject ?? ""} aria-label="Subject" />
          <Textarea name="body" defaultValue={body} rows={7} aria-label="Message body" />
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={pending}>
              <Check /> Save draft
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
              <X /> Discard
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-3">
          <p className="text-[12.5px] font-semibold text-fg">{subject ?? "(no subject)"}</p>
          <p className="mt-1.5 max-h-40 overflow-y-auto whitespace-pre-wrap text-[12px] leading-5 text-muted">{body}</p>
          {unresolved.length ? (
            <p className="mt-2 rounded-md border border-amber/25 bg-amber/5 px-2 py-1.5 text-[11px] text-amber">
              Unresolved: {unresolved.map((v) => `{{${v}}}`).join(", ")}
            </p>
          ) : null}
        </div>
      )}

      {!editing ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <ActionButton
            action={approveAndSendAction.bind(null, messageId)}
            size="sm"
            disabled={paused}
            confirm={`Send this email to ${toEmail ?? "the recipient"}? This leaves the workspace immediately.`}
          >
            <Send /> Approve & send
          </ActionButton>
          <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(true)}>
            <Pencil /> Edit
          </Button>
          <ActionButton action={cancelMessageAction.bind(null, messageId)} variant="ghost" size="sm">
            <X /> Cancel
          </ActionButton>
          {paused ? <span className="text-[11px] text-danger">Sending is paused workspace-wide.</span> : null}
        </div>
      ) : null}
    </div>
  );
}
