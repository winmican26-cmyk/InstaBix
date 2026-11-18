import { cn } from "@/lib/utils";

export function Progress({
  value,
  tone = "lime",
  className,
  label,
}: {
  value: number;
  tone?: "lime" | "violet" | "amber" | "info";
  className?: string;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const fill = tone === "violet" ? "bg-violet" : tone === "amber" ? "bg-amber" : tone === "info" ? "bg-info" : "bg-lime";
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-500", fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}
