"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { normalizeBatchPayload, type BatchResponse } from "@/lib/discovery/batch-response";

export function BatchImportDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<BatchResponse | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/discovery/batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ handles: input }),
      });
      const data: unknown = await response.json();
      const { error: message, result: normalized } = normalizeBatchPayload(data, response.ok);
      if (normalized) {
        setResult(normalized);
        router.refresh();
        setError(message ?? "");
        return;
      }
      setResult(null);
      setError(message ?? "Import failed. Try again.");
    } catch {
      setError("Import failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <Upload /> Batch import
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Batch import handles</DialogTitle>
          <DialogDescription>
            Paste up to 50 handles, one per line or separated by commas. New handles are saved with consent pending; only
            creators who already granted consent are enriched through official Business Discovery.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          {error ? (
            <p role="alert" className="rounded-md border border-danger/25 bg-danger/5 p-3 text-[12.5px] text-danger">
              {error}
            </p>
          ) : null}

          <Textarea
            aria-label="Handles to import"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            rows={8}
            placeholder={"@handle_one\nhttps://www.instagram.com/handle_two/\n@handle_three"}
            autoCapitalize="none"
          />

          {result ? (
            <div className="space-y-2">
              {result.rateLimit ? (
                <p role="status" className="text-[12px] text-amber">
                  {result.rateLimit.message} Retry in {result.rateLimit.seconds}s.
                </p>
              ) : null}
              {result.rejected.length > 0 ? (
                <p className="text-[12px] text-muted">Skipped: {result.rejected.join(", ")}</p>
              ) : null}
              <ul className="max-h-52 divide-y divide-line overflow-y-auto rounded-lg border border-line">
                {result.items.map((item) => (
                  <li key={item.handle} className="flex flex-col gap-0.5 px-3 py-2">
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[12px] text-fg">@{item.handle}</span>
                      <span className="text-[11px] font-semibold uppercase text-muted">{item.status}</span>
                    </span>
                    {item.message ? <span className="text-[11.5px] leading-4 text-muted">{item.message}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button type="submit" disabled={loading || input.trim().length === 0}>
              {loading ? "Importing…" : "Import handles"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
