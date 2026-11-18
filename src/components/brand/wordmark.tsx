import Link from "next/link";
import { cn } from "@/lib/utils";

export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("size-8", className)} role="img" aria-label="InstaBix">
      <rect width="64" height="64" rx="15" className="fill-[#0A0A0F]" />
      <path d="M32 13a19 19 0 0 1 16.45 9.5" stroke="#C6FF4A" strokeWidth="7" strokeLinecap="round" fill="none" />
      <path d="M48.45 22.5A19 19 0 0 1 32 51" stroke="#8B5CF6" strokeWidth="7" strokeLinecap="round" fill="none" />
      <path d="M32 51a19 19 0 0 1-16.45-28.5" stroke="#C6FF4A" strokeWidth="7" strokeLinecap="round" fill="none" />
      <circle cx="32" cy="32" r="4.5" fill="#F4F4F8" />
    </svg>
  );
}

export function Wordmark({ href = "/dashboard", compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-2.5 rounded-md focus-visible:outline-none">
      <Mark className="size-8 transition-transform duration-200 group-hover:rotate-3" />
      {compact ? null : (
        <span className="leading-none">
          <span className="block font-display text-[17px] font-semibold tracking-[-0.03em] text-fg">InstaBix</span>
          <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.16em] text-faint">Creator partnerships</span>
        </span>
      )}
    </Link>
  );
}
