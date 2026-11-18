import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US", { notation: value >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}

export function formatCurrency(cents: number | null | undefined, currency = "usd"): string {
  if (cents === null || cents === undefined) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 2 }).format(cents / 100);
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export function timeAgo(value: Date | string | null | undefined): string {
  if (!value) return "never";
  const then = new Date(value).getTime();
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 45) return "just now";
  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.34, "week"],
    [12, "month"],
    [Number.POSITIVE_INFINITY, "year"],
  ];
  let value_ = seconds;
  for (const [size, unit] of units) {
    if (Math.abs(value_) < size) {
      const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
      return rtf.format(-Math.round(value_), unit);
    }
    value_ = value_ / size;
  }
  return "a while ago";
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function normalizeUsername(raw: string): string | null {
  const handle = raw.trim().replace(/^@+/, "").replace(/\/+$/, "").toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(handle) ? handle : null;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2 : (sorted[mid] ?? 0);
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function coefficientOfVariation(values: number[]): number {
  const m = mean(values);
  if (m === 0) return 0;
  const variance = mean(values.map((v) => (v - m) ** 2));
  return Math.sqrt(variance) / m;
}

export function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

export function truncate(value: string, length = 80): string {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function absoluteUrl(path: string): string {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}
