import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-[background-color,border-color,color,filter,transform] duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-lime text-accent-fg hover:brightness-[1.06] shadow-[0_1px_0_rgb(255_255_255/0.25)_inset]",
        secondary: "border border-line bg-surface-2 text-fg hover:border-line-2 hover:bg-surface-3",
        outline: "border border-line bg-transparent text-fg hover:border-line-2 hover:bg-surface-2",
        ghost: "text-muted hover:bg-surface-2 hover:text-fg",
        violet: "bg-violet text-white hover:brightness-110",
        danger: "border border-danger/30 bg-danger/10 text-danger hover:bg-danger/15",
        link: "text-fg underline decoration-line-2 underline-offset-4 hover:decoration-lime",
      },
      size: {
        sm: "h-8 px-3 text-[13px] [&_svg]:size-3.5",
        md: "h-10 px-4 [&_svg]:size-4",
        lg: "h-11 px-5 text-[15px] [&_svg]:size-[18px]",
        icon: "size-9 [&_svg]:size-4",
        "icon-sm": "size-7 [&_svg]:size-3.5",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="animate-spin" aria-hidden />
            <span className="sr-only">Working…</span>
            {children}
          </>
        ) : (
          children
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
