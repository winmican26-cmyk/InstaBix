import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  variant = "default",
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  variant?: "default" | "error";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      <div
        className={cn(
          "mb-4 grid size-11 place-items-center rounded-xl border",
          variant === "error" ? "border-danger/25 bg-danger/10 text-danger" : "border-line bg-surface-2 text-muted",
        )}
      >
        <Icon className="size-5" strokeWidth={1.75} aria-hidden />
      </div>
      <h3 className="text-[15px] font-semibold text-fg">{title}</h3>
      <p className="mt-1.5 max-w-sm text-[13px] leading-5 text-muted">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
