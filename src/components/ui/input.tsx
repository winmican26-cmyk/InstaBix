import * as React from "react";
import { cn } from "@/lib/utils";

const base =
  "w-full rounded-md border border-line bg-bg/60 px-3 text-sm text-fg placeholder:text-faint transition-colors focus:border-lime/60 focus:outline-none focus:ring-2 focus:ring-lime/15 disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-danger/60 aria-[invalid=true]:ring-danger/15";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = "text", ...props }, ref) => (
    <input ref={ref} type={type} className={cn(base, "h-10", className)} {...props} />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, rows = 4, ...props }, ref) => (
    <textarea ref={ref} rows={rows} className={cn(base, "min-h-[96px] py-2.5 leading-6", className)} {...props} />
  ),
);
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(base, "h-10 appearance-none bg-[length:14px] bg-[right_12px_center] bg-no-repeat pr-9", className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
      }}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = "Select";
