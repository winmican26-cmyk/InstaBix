"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { NAV_SECTIONS } from "@/lib/constants";
import { NAV_ICONS } from "@/components/app/nav-icons";
import { Wordmark } from "@/components/brand/wordmark";
import { cn } from "@/lib/utils";

export function Sidebar({ orgName, role }: { orgName: string; role: string }) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 z-40 hidden h-dvh flex-col self-start border-r border-line bg-surface/70 backdrop-blur-xl lg:flex">
      <div className="flex h-14 items-center border-b border-line px-5">
        <Wordmark />
      </div>

      <div className="px-3 py-4">
        <div className="flex items-center gap-2.5 rounded-lg border border-line bg-surface-2/60 px-3 py-2.5">
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-lime/10 font-mono text-[11px] font-semibold text-lime">
            {orgName.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[12.5px] font-semibold text-fg">{orgName}</p>
            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-faint">{role}</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Workspace">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="mb-5">
            <p className="mb-1.5 px-2 font-mono text-[9px] uppercase tracking-[0.16em] text-faint">{section.label}</p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = NAV_ICONS[item.icon];
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors",
                        active ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface-2/60 hover:text-fg",
                      )}
                    >
                      {Icon ? (
                        <Icon
                          className={cn("size-4 transition-colors", active ? "text-lime" : "text-faint group-hover:text-muted")}
                          strokeWidth={1.75}
                          aria-hidden
                        />
                      ) : null}
                      <span className="truncate">{item.label}</span>
                      {active ? <span className="ml-auto h-4 w-0.5 rounded-full bg-lime" aria-hidden /> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-line p-3">
        <div className="rounded-lg border border-line bg-surface-2/50 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-fg">
            <ShieldCheck className="size-3.5 text-lime" strokeWidth={1.75} aria-hidden />
            Data honesty
          </p>
          <p className="mt-1.5 text-[11px] leading-4 text-faint">
            Every number here traces to a database row or a live API response. No samples, ever.
          </p>
        </div>
        <p className="mt-3 px-1 font-mono text-[9px] uppercase tracking-[0.1em] text-faint">v0.1 · build 001</p>
      </div>
    </aside>
  );
}
