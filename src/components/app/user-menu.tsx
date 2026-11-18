"use client";

import Link from "next/link";
import { LogOut, Settings, ShieldCheck, UserRound } from "lucide-react";
import { signOutAction } from "@/lib/actions/auth";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROLE_LABEL } from "@/lib/constants";

export function UserMenu({ name, email, role }: { name: string; email: string; role: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded-full ring-offset-2 ring-offset-bg transition-shadow hover:ring-2 hover:ring-line-2"
          aria-label="Open account menu"
        >
          <Avatar name={name} size="sm" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Signed in</DropdownMenuLabel>
        <div className="flex items-center gap-3 px-2.5 pb-2.5 pt-1">
          <Avatar name={name} size="md" />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-fg">{name}</p>
            <p className="truncate text-[11px] text-faint">{email}</p>
            <p className="mt-1 inline-flex items-center gap-1 rounded border border-line px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-muted">
              <ShieldCheck className="size-2.5 text-lime" aria-hidden />
              {ROLE_LABEL[role] ?? role}
            </p>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <UserRound className="size-3.5" /> Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings#security">
            <Settings className="size-3.5" /> Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={signOutAction}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full cursor-pointer">
              <LogOut className="size-3.5" /> Sign out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
