import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function Stat({
  label,
  value,
  hint,
  icon: Icon,
  provenance,
  tone = "default",
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: LucideIcon;
  provenance?: string;
  tone?: "default" | "lime" | "violet" | "amber";
  className?: string;
}) {
  return (
    <div className={cn("card relative overflow-hidden p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="label">{label}</p>
        {Icon ? (
          <Icon
            className={cn(
              "size-4",
              tone === "lime" ? "text-lime" : tone === "violet" ? "text-violet" : tone === "amber" ? "text-amber" : "text-faint",
            )}
            strokeWidth={1.75}
            aria-hidden
          />
        ) : null}
      </div>
      <p className="mt-3 font-display text-[30px] font-semibold leading-none tracking-[-0.03em] text-fg">{value}</p>
      {hint ? <p className="mt-2 text-xs leading-4 text-muted">{hint}</p> : null}
      {provenance ? <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.08em] text-faint">{provenance}</p> : null}
    </div>
  );
}
