"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

const LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  creators: "Creators",
  outreach: "Outreach",
  studio: "Product Studio",
  revenue: "Revenue",
  integrations: "Integrations",
  audit: "Audit log",
  settings: "Settings",
  onboarding: "Onboarding",
  new: "New",
};

export function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[12.5px]">
      <Link href="/dashboard" className="text-faint transition-colors hover:text-muted">
        InstaBix
      </Link>
      {segments.map((segment, i) => {
        const href = `/${segments.slice(0, i + 1).join("/")}`;
        const label = LABELS[segment] ?? (segment.length > 14 ? `${segment.slice(0, 8)}…` : segment.replace(/-/g, " "));
        const last = i === segments.length - 1;
        return (
          <span key={href} className="flex min-w-0 items-center gap-1.5">
            <ChevronRight className="size-3 shrink-0 text-line-2" aria-hidden />
            {last ? (
              <span className="truncate font-medium capitalize text-fg" aria-current="page">
                {label}
              </span>
            ) : (
              <Link href={href} className="truncate capitalize text-faint transition-colors hover:text-muted">
                {label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
