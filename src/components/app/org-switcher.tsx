"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { setActiveOrg } from "@/lib/actions/org";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type OrgOption = { id: string; name: string; role: string };

export function OrgSwitcher({ orgs, activeOrgId }: { orgs: OrgOption[]; activeOrgId: string }) {
  const [pending, startTransition] = useTransition();
  const active = orgs.find((o) => o.id === activeOrgId) ?? orgs[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "hidden h-8 items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-[12.5px] font-medium text-fg transition-colors hover:border-line-2 sm:inline-flex",
            pending && "opacity-60",
          )}
          aria-label={`Workspace: ${active?.name ?? "none"}`}
        >
          <span className="grid size-4 place-items-center rounded bg-lime/10 font-mono text-[9px] font-semibold text-lime">
            {active?.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="max-w-36 truncate">{active?.name}</span>
          <ChevronsUpDown className="size-3 text-faint" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        {orgs.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onSelect={() => {
              if (org.id !== activeOrgId) startTransition(() => void setActiveOrg(org.id));
            }}
            className="justify-between"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="grid size-5 shrink-0 place-items-center rounded bg-surface-3 font-mono text-[9px] text-muted">
                {org.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="truncate">{org.name}</span>
            </span>
            {org.id === activeOrgId ? <Check className="size-3.5 text-lime" aria-label="Active" /> : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/onboarding" className="cursor-pointer">
            <Plus className="size-3.5" />
            Create workspace
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
