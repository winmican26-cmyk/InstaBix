import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const tones = {
  info: { box: "border-info/25 bg-info/5", icon: Info, iconColor: "text-info" },
  success: { box: "border-lime/25 bg-lime/5", icon: CheckCircle2, iconColor: "text-lime" },
  warning: { box: "border-amber/25 bg-amber/5", icon: AlertTriangle, iconColor: "text-amber" },
  danger: { box: "border-danger/25 bg-danger/5", icon: ShieldAlert, iconColor: "text-danger" },
} as const;

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: keyof typeof tones;
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const t = tones[tone];
  const Icon = t.icon;
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-lg border p-4", t.box, className)}>
      <Icon className={cn("mt-0.5 size-4 shrink-0", t.iconColor)} strokeWidth={1.75} aria-hidden />
      <div className="min-w-0 text-[13px] leading-5">
        {title ? <p className="font-semibold text-fg">{title}</p> : null}
        <div className={cn(title ? "mt-1 text-muted" : "text-muted")}>{children}</div>
      </div>
    </div>
  );
}
