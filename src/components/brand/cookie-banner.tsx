"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const COOKIE_CONSENT_KEY = "vistabix_cookie_consent_v1";

export function CookieBanner() {
  const [mounted, setMounted] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const consent = localStorage.getItem(COOKIE_CONSENT_KEY);
      if (!consent) {
        setShow(true);
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const handleAccept = (level: "all" | "necessary") => {
    try {
      localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify({ level, timestamp: new Date().toISOString() }));
    } catch {
      // Ignore localStorage errors
    }
    setShow(false);
  };

  if (!mounted || !show) return null;

  return (
    <aside
      role="region"
      aria-label="Cookie and Privacy Preferences"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-line/80 bg-bg/95 p-4 shadow-2xl backdrop-blur-xl sm:p-5"
    >
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="max-w-3xl space-y-1 text-[12.5px] leading-relaxed text-muted">
          <p className="font-medium text-fg">
            Privacy & Cookie Choices · A Micany Apps Product
          </p>
          <p>
            VistaBix uses strictly necessary cookies and session storage to provide secure sign-in, tenant isolation, and core features. We comply with GDPR and EU ePrivacy standards. Optional telemetry remains disabled until explicit consent.{" "}
            <Link href="/legal/privacy" className="underline underline-offset-2 hover:text-fg">
              Read Privacy Policy
            </Link>{" "}
            or visit our{" "}
            <Link href="/legal/dsr" className="underline underline-offset-2 hover:text-fg">
              GDPR & DSR Center
            </Link>.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleAccept("necessary")}
            className="text-[12px]"
          >
            Only Essential
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => handleAccept("all")}
            className="text-[12px]"
          >
            Accept All
          </Button>
        </div>
      </div>
    </aside>
  );
}
