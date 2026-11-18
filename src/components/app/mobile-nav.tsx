"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { NAV_SECTIONS } from "@/lib/constants";
import { NAV_ICONS } from "@/components/app/nav-icons";
import { Wordmark } from "@/components/brand/wordmark";
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function MobileNav({ orgName, role }: { orgName: string; role: string }) {
  const pathname = usePathname();

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-fg lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="size-5" />
        </button>
      </DialogTrigger>
      <DialogContent className="left-0 top-0 h-dvh w-[290px] max-w-[85vw] translate-x-0 translate-y-0 rounded-none rounded-r-xl border-y-0 border-l-0 p-0">
        <DialogTitle className="sr-only">Navigation</DialogTitle>
        <div className="flex h-14 items-center justify-between border-b border-line px-4">
          <Wordmark />
          <DialogClose className="rounded-md p-1.5 text-faint hover:bg-surface-2 hover:text-fg" aria-label="Close navigation">
            <X className="size-4" />
          </DialogClose>
        </div>
        <div className="px-3 py-3">
          <div className="flex items-center gap-2.5 rounded-lg border border-line bg-surface-2/60 px-3 py-2.5">
            <span className="grid size-7 place-items-center rounded-md bg-lime/10 font-mono text-[11px] font-semibold text-lime">
              {orgName.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[12.5px] font-semibold text-fg">{orgName}</p>
              <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-faint">{role}</p>
            </div>
          </div>
        </div>
        <nav className="px-3 pb-6" aria-label="Mobile navigation">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label} className="mb-4">
              <p className="mb-1 px-2 font-mono text-[9px] uppercase tracking-[0.16em] text-faint">{section.label}</p>
              {section.items.map((item) => {
                const Icon = NAV_ICONS[item.icon];
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <DialogClose key={item.href} asChild>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex h-10 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium",
                        active ? "bg-surface-2 text-fg" : "text-muted",
                      )}
                    >
                      {Icon ? <Icon className={cn("size-4", active ? "text-lime" : "text-faint")} strokeWidth={1.75} /> : null}
                      {item.label}
                    </Link>
                  </DialogClose>
                );
              })}
            </div>
          ))}
        </nav>
      </DialogContent>
    </Dialog>
  );
}
