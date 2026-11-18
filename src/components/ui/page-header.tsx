import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-2 flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-faint">
            <span className="inline-block size-1.5 rounded-full bg-lime" aria-hidden />
            {eyebrow}
          </p>
        ) : null}
        <h1 className="font-display text-[26px] font-semibold leading-[1.1] tracking-[-0.035em] text-fg sm:text-[32px]">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-[13.5px] leading-6 text-muted">{description}</p> : null}
      </div>
      {actions || meta ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {meta}
          {actions}
        </div>
      ) : null}
    </div>
  );
}
