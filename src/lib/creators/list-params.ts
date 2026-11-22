export const CREATOR_SORT_KEYS = ["created", "username", "followers", "score", "enriched"] as const;
export type CreatorSortKey = (typeof CREATOR_SORT_KEYS)[number];

export const CREATOR_PAGE_SIZE = 25;
export const CREATOR_MAX_PAGE = 100;

export type CreatorListParams = {
  q?: string;
  status?: string;
  source?: string;
  sort: CreatorSortKey;
  dir: "asc" | "desc";
  page: number;
  minFollowers?: number;
  maxFollowers?: number;
};

type RawValue = string | string[] | undefined;

function firstValue(value: RawValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function boundedText(value: RawValue, maxLength: number): string | undefined {
  const text = firstValue(value)?.trim().slice(0, maxLength);
  return text || undefined;
}

/** Shared by the parser and the query layer so both clamp pages identically. */
export function clampCreatorPage(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(CREATOR_MAX_PAGE, Math.max(1, Math.trunc(parsed)));
}

function parseFollowerBound(value: RawValue): number | undefined {
  const text = firstValue(value)?.trim();
  if (!text || !/^\d+$/.test(text)) return undefined;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

export function parseCreatorListParams(
  raw: Record<string, string | string[] | undefined>,
): { ok: true; params: CreatorListParams } | { ok: false; error: string } {
  const params: CreatorListParams = { sort: "created", dir: "desc", page: 1 };

  const q = boundedText(raw.q, 80);
  const status = boundedText(raw.status, 40);
  const source = boundedText(raw.source, 40);
  if (q) params.q = q;
  if (status) params.status = status;
  if (source) params.source = source;

  const sort = firstValue(raw.sort);
  if (sort && (CREATOR_SORT_KEYS as readonly string[]).includes(sort)) {
    params.sort = sort as CreatorSortKey;
  }

  const dir = firstValue(raw.dir);
  if (dir === "asc" || dir === "desc") params.dir = dir;

  const page = firstValue(raw.page);
  if (page !== undefined) params.page = clampCreatorPage(page);

  const minFollowers = parseFollowerBound(raw.min);
  const maxFollowers = parseFollowerBound(raw.max);
  if (minFollowers !== undefined && maxFollowers !== undefined && minFollowers > maxFollowers) {
    return { ok: false, error: "Minimum followers cannot exceed maximum followers." };
  }
  if (minFollowers !== undefined) params.minFollowers = minFollowers;
  if (maxFollowers !== undefined) params.maxFollowers = maxFollowers;

  return { ok: true, params };
}
