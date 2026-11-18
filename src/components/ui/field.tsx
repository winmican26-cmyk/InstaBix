import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "@/lib/utils";

export const Label = React.forwardRef<
  React.ComponentRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn("mb-1.5 block text-[13px] font-medium text-fg", className)}
    {...props}
  />
));
Label.displayName = "Label";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const describedBy = error ? `${htmlFor}-error` : hint ? `${htmlFor}-hint` : undefined;
  return (
    <div className={cn("w-full", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="ml-1 text-lime">*</span> : null}
      </Label>
      {React.isValidElement(children)
        ? React.cloneElement(children as React.ReactElement<{ "aria-describedby"?: string; "aria-invalid"?: boolean }>, {
            "aria-describedby": describedBy,
            "aria-invalid": Boolean(error),
          })
        : children}
      {error ? (
        <p id={`${htmlFor}-error`} className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="mt-1.5 text-xs text-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
