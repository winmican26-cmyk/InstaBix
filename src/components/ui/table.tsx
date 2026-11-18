import * as React from "react";
import { cn } from "@/lib/utils";

export function TableShell({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("overflow-x-auto", className)}>{children}</div>;
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn("w-full min-w-[680px] border-collapse text-left text-sm", className)} {...props} />;
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("border-b border-line", className)} {...props} />;
}

export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-line/70", className)} {...props} />;
}

export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("transition-colors", className)} {...props} />;
}

export function TH({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn("whitespace-nowrap px-4 py-3 text-[10.5px] font-medium uppercase tracking-[0.1em] text-faint", className)}
      {...props}
    />
  );
}

export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-4 py-3.5 align-middle text-[13px] text-fg", className)} {...props} />;
}
