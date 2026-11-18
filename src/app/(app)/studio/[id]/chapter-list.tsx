"use client";

import { useState, useTransition } from "react";
import { ChevronDown, Save } from "lucide-react";
import { toast } from "sonner";
import { saveChapterAction } from "@/lib/actions/studio";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { wordCount } from "@/lib/text";

type Chapter = {
  id: string;
  position: number;
  title: string;
  summary: string | null;
  content: string | null;
  wordCount: number;
};

export function ChapterList({ chapters }: { chapters: Chapter[] }) {
  return (
    <div className="divide-y divide-line/70">
      {chapters.map((chapter) => (
        <ChapterRow key={chapter.id} chapter={chapter} />
      ))}
    </div>
  );
}

function ChapterRow({ chapter }: { chapter: Chapter }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState(chapter.content ?? "");
  const words = wordCount(draft);

  return (
    <div className="px-4 py-3">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 text-left" aria-expanded={open}>
        <span className="grid size-6 shrink-0 place-items-center rounded bg-surface-3 font-mono text-[10px] text-muted">
          {chapter.position}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-fg">{chapter.title}</span>
          {chapter.summary ? <span className="block truncate text-[11px] text-faint">{chapter.summary}</span> : null}
        </span>
        <span className="font-mono text-[10.5px] text-faint">{chapter.wordCount} words</span>
        <ChevronDown className={open ? "size-4 rotate-180 text-faint transition-transform" : "size-4 text-faint transition-transform"} aria-hidden />
      </button>

      {open ? (
        <form
          className="mt-3 space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            startTransition(async () => {
              const result = await saveChapterAction(chapter.id, data);
              if (result.error) toast.error(result.error);
              else toast.success(result.success ?? "Saved.");
            });
          }}
        >
          <Input name="title" defaultValue={chapter.title} aria-label="Chapter title" />
          <Input name="summary" defaultValue={chapter.summary ?? ""} aria-label="Chapter summary" placeholder="One-line promise" />
          <Textarea
            name="content"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={14}
            aria-label="Chapter content"
            className="font-mono text-[12px] leading-6"
            placeholder="Write the chapter in the creator's voice. Cite real source ids in the citations panel."
          />
          <div className="flex items-center gap-3">
            <Button type="submit" variant="secondary" size="sm" loading={pending}>
              <Save /> Save chapter
            </Button>
            <span className="font-mono text-[10.5px] text-faint">{words} words measured on save</span>
          </div>
        </form>
      ) : null}
    </div>
  );
}
