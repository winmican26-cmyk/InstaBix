import * as React from "react";
import type { LucideProps } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Lucide no longer ships brand glyphs, so the Instagram mark lives here. It is
 * typed as a Lucide icon so it can be used anywhere a LucideIcon is expected
 * (empty states, feature lists) and inherits the current text colour.
 */
export const Instagram = React.forwardRef<SVGSVGElement, LucideProps>(
  ({ className, size = 24, strokeWidth = 2, ...props }, ref) => (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-4", className)}
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17" cy="7" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  ),
);
Instagram.displayName = "Instagram";

export const InstagramGlyph = Instagram;
