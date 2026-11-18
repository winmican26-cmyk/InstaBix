"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { changeMemberRoleAction, removeMemberAction } from "@/lib/actions/settings";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";

export function MemberActions({
  memberId,
  role,
  isOwner,
  isSelf,
}: {
  memberId: string;
  role: string;
  isOwner: boolean;
  isSelf: boolean;
}) {
  const [value, setValue] = useState(role);
  const [pending, startTransition] = useTransition();

  if (isSelf && isOwner) {
    return <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-faint">that&apos;s you</span>;
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <Select
        aria-label="Member role"
        className="h-8 w-32 text-[12px]"
        value={value}
        disabled={pending || isOwner}
        onChange={(event) => {
          const next = event.target.value as "admin" | "operator" | "reviewer";
          setValue(next);
          startTransition(async () => {
            const result = await changeMemberRoleAction(memberId, next);
            if (result.error) {
              setValue(role);
              toast.error(result.error);
            } else toast.success(result.success ?? "Role updated.");
          });
        }}
      >
        <option value="owner" disabled>
          Owner
        </option>
        <option value="admin">Admin</option>
        <option value="operator">Operator</option>
        <option value="reviewer">Reviewer</option>
      </Select>
      {!isOwner && !isSelf ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Remove member"
          loading={pending}
          onClick={() => {
            if (!window.confirm("Remove this member from the workspace? Their sessions lose access immediately.")) return;
            startTransition(async () => {
              const result = await removeMemberAction(memberId);
              if (result.error) toast.error(result.error);
              else toast.success(result.success ?? "Member removed.");
            });
          }}
        >
          <Trash2 />
        </Button>
      ) : null}
    </div>
  );
}
