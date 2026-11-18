import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-5",
  {
    variants: {
      tone: {
        neutral: "border-line bg-surface-2 text-muted",
        lime: "border-lime/30 bg-lime/10 text-lime",
        violet: "border-violet/30 bg-violet/10 text-violet",
        amber: "border-amber/30 bg-amber/10 text-amber",
        danger: "border-danger/30 bg-danger/10 text-danger",
        info: "border-info/30 bg-info/10 text-info",
        outline: "border-line bg-transparent text-muted",
        solid: "border-transparent bg-lime text-accent-fg",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { badgeVariants };
