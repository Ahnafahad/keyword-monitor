// Pure helpers (no DOM, no React) so they can be checked with `node --import tsx --test web/src/lib.test.ts`.
import type { Platform } from '../../server/types.ts';

export const PLATFORMS: Platform[] = ['linkedin', 'x', 'web'];
export const PLATFORM_LABEL: Record<Platform, string> = { linkedin: 'LinkedIn', x: 'X', web: 'Web' };
export const MIN_FREQUENCY_MINUTES = 15;

/** "12m ago" / "in 3h". Falls back to a short date beyond 30 days. */
export function relTime(iso: string | null | undefined, now = Date.now()): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t)) return '—';
  const diff = t - now;
  const s = Math.abs(diff) / 1000;
  if (s < 45) return diff > 0 ? 'in moments' : 'just now';
  if (s > 30 * 86400) return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const label =
    s < 3600 ? `${Math.max(1, Math.floor(s / 60))}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`;
  return diff > 0 ? `in ${label}` : `${label} ago`;
}

export function absTime(iso: string | null | undefined): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t)) return '';
  return new Date(t).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function freqLabel(minutes: number): string {
  if (minutes % 60 !== 0) return `Every ${minutes} min`;
  const h = minutes / 60;
  return h === 1 ? 'Every hour' : `Every ${h} hours`;
}

export function splitKeywords(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((k) => k.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
}

/** Append, dropping case-insensitive duplicates. */
export function addKeywords(existing: string[], incoming: string[]): string[] {
  const seen = new Set(existing.map((k) => k.toLowerCase()));
  const out = [...existing];
  for (const k of incoming) {
    if (seen.has(k.toLowerCase())) continue;
    seen.add(k.toLowerCase());
    out.push(k);
  }
  return out;
}

/** Scraped URLs are untrusted: only http(s) may become an href. */
export function safeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

export function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** YYYY-MM-DD (local day) -> ISO instant at the start or end of that day. */
export function dayBoundary(day: string, end: boolean): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return undefined;
  const d = end
    ? new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59, 999)
    : new Date(+m[1], +m[2] - 1, +m[3], 0, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}
