"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Plus, Search, Sparkles } from "lucide-react";
import { NAV_SECTIONS } from "@/lib/constants";
import { NAV_ICONS } from "@/components/app/nav-icons";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

type PaletteItem = { href: string; label: string; group: string; icon: LucideIcon; keywords?: string };

const QUICK: PaletteItem[] = [
  { href: "/creators?add=1", label: "Add a creator", group: "Actions", icon: Plus, keywords: "new creator invite manual" },
  { href: "/studio?new=1", label: "Start a product", group: "Actions", icon: Sparkles, keywords: "studio outline product" },
  { href: "/integrations", label: "Check integrations", group: "Actions", icon: Search, keywords: "instagram resend stripe openai anthropic" },
];

const ITEMS: PaletteItem[] = [
  ...NAV_SECTIONS.flatMap((section) =>
    section.items.map((item) => ({
      href: item.href,
      label: item.label,
      group: section.label,
      icon: NAV_ICONS[item.icon] ?? ArrowRight,
      keywords: item.label.toLowerCase(),
    })),
  ),
  ...QUICK,
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
      window.setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ITEMS;
    return ITEMS.filter((item) => `${item.label} ${item.group} ${item.keywords ?? ""}`.toLowerCase().includes(q));
  }, [query]);

  const grouped = useMemo(() => {
    const map = new Map<string, PaletteItem[]>();
    for (const item of results) {
      const list = map.get(item.group) ?? [];
      list.push(item);
      map.set(item.group, list);
    }
    return [...map.entries()];
  }, [results]);

  function choose(item: PaletteItem) {
    setOpen(false);
    router.push(item.href);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-8 min-w-[190px] items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-[12px] text-faint transition-colors hover:border-line-2 hover:text-muted md:inline-flex"
        aria-label="Open command palette"
      >
        <Search className="size-3.5" aria-hidden />
        <span>Jump to…</span>
        <kbd className="kbd ml-auto">⌘K</kbd>
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex size-8 items-center justify-center rounded-md text-faint transition-colors hover:bg-surface-2 hover:text-fg md:hidden"
        aria-label="Open command palette"
      >
        <Search className="size-4" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl overflow-hidden p-0" aria-describedby={undefined}>
          <DialogTitle className="sr-only">Command palette</DialogTitle>
          <div className="flex items-center gap-2 border-b border-line px-4">
            <Search className="size-4 text-faint" aria-hidden />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setIndex(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setIndex((i) => Math.min(i + 1, results.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setIndex((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter") {
                  const item = results[index];
                  if (item) {
                    e.preventDefault();
                    choose(item);
                  }
                }
              }}
              placeholder="Search pages and actions…"
              className="h-12 w-full border-0 bg-transparent text-[14px] text-fg placeholder:text-faint focus:outline-none"
              role="combobox"
              aria-expanded
              aria-controls="palette-results"
              aria-activedescendant={results[index] ? `palette-${index}` : undefined}
            />
            <kbd className="kbd">esc</kbd>
          </div>
          <div id="palette-results" role="listbox" className="max-h-[55vh] overflow-y-auto p-2">
            {results.length === 0 ? (
              <p className="px-3 py-8 text-center text-[13px] text-faint">No matches. Try “creators” or “integrations”.</p>
            ) : (
              grouped.map(([group, items]) => (
                <div key={group} className="mb-2">
                  <p className="px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-faint">{group}</p>
                  {items.map((item) => {
                    const globalIndex = results.indexOf(item);
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.href}
                        id={`palette-${globalIndex}`}
                        role="option"
                        aria-selected={globalIndex === index}
                        type="button"
                        onMouseEnter={() => setIndex(globalIndex)}
                        onClick={() => choose(item)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors",
                          globalIndex === index ? "bg-surface-2 text-fg" : "text-muted",
                        )}
                      >
                        <Icon className={cn("size-4", globalIndex === index ? "text-lime" : "text-faint")} strokeWidth={1.75} />
                        {item.label}
                        {globalIndex === index ? <ArrowRight className="ml-auto size-3.5 text-faint" /> : null}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
