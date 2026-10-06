// Shared, pure helpers for the provider adapters: keyword cleanup and defensive date handling.
// Platform-specific query syntax lives in each adapter's build*Query function.

/** Trim + collapse whitespace; drop empties and case-insensitive duplicates. Keeps the user's original spelling. */
export function cleanKeywords(keywords: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of keywords) {
    const kw = String(k ?? '').replace(/\s+/g, ' ').trim();
    if (!kw || seen.has(kw.toLowerCase())) continue;
    seen.add(kw.toLowerCase());
    out.push(kw);
  }
  return out;
}

/** YYYY-MM-DD in UTC, the date form search operators (`since:`, `after:`) understand. */
export const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

const UNIT_MS: Record<string, number> = {
  s: 1e3, sec: 1e3, second: 1e3,
  m: 6e4, min: 6e4, minute: 6e4,
  h: 36e5, hr: 36e5, hour: 36e5,
  d: 864e5, day: 864e5,
  w: 6048e5, wk: 6048e5, week: 6048e5,
  mo: 2592e6, month: 2592e6,
  y: 31536e6, yr: 31536e6, year: 31536e6,
};

/**
 * Anything date-like -> ISO string, or null. Never throws.
 * Handles Date, epoch seconds/ms, ISO, Twitter's "Tue Oct 06 18:57:39 +0000 2026",
 * and relative forms ("3h", "2 days ago", "1mo"), which are approximate by nature.
 */
export function toIso(value: unknown, now: Date = new Date()): string | null {
  let ms = NaN;
  if (value instanceof Date) ms = value.getTime();
  else if (typeof value === 'number') ms = value < 1e11 ? value * 1000 : value;
  else if (typeof value === 'string') {
    const s = value.trim();
    const rel = /^(?:an?|(\d+))\s*([a-z]+?)s?(?:\s+ago)?$/i.exec(s);
    if (/^\d{9,13}$/.test(s)) return toIso(Number(s), now);
    if (rel && UNIT_MS[rel[2].toLowerCase()]) ms = now.getTime() - Number(rel[1] ?? 1) * UNIT_MS[rel[2].toLowerCase()];
    else if (/^yesterday$/i.test(s)) ms = now.getTime() - 864e5;
    // Require a 4-digit year so V8 doesn't "helpfully" parse junk like "5" into 2001.
    else if (/\d{4}/.test(s)) ms = Date.parse(s);
  }
  // Sanity window: 1990 .. one day ahead of now.
  if (!Number.isFinite(ms) || ms < 631152000000 || ms > now.getTime() + 864e5) return null;
  return new Date(ms).toISOString();
}

/** Keep items published at/after `since`; items with an unknown date are kept (we can't prove they're old). */
export function keepSince<T extends { publishedAt: string | null }>(items: T[], since: Date): T[] {
  const min = since.getTime();
  return items.filter((i) => !i.publishedAt || Date.parse(i.publishedAt) >= min);
}

export const isObject = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Non-empty trimmed string or null. */
export const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Finite number or null (accepts numeric strings). */
export const num = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

/** Drop null/undefined/empty-array entries so metadata stays compact and JSON-safe. */
export function compact(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v != null && !(Array.isArray(v) && v.length === 0)));
}
