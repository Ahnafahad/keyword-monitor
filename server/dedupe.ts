import { createHash } from 'node:crypto';
import type { NormalizedItem } from './types.ts';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

const TRACKING = new Set([
  'fbclid', 'gclid', 'dclid', 'msclkid', 'yclid', 'igshid', 'mc_cid', 'mc_eid',
  'ref', 'ref_src', 'ref_url', 'trk', 'trackingid', '_hsenc', '_hsmi',
]);

/** Stable form of a URL for dedupe. Not guaranteed to be fetchable; never shown to the user. */
export function canonicalizeUrl(input: string): string {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return input.trim().toLowerCase();
  }
  let host = u.hostname.toLowerCase().replace(/^www\./, '');
  let path = u.pathname.replace(/\/+$/, '');

  if (/^((mobile|m)\.)?(twitter|x)\.com$/.test(host)) {
    host = 'x.com';
    const status = path.match(/\/status(?:es)?\/(\d+)/);
    if (status) return `https://x.com/i/status/${status[1]}`; // the status id alone identifies a post
  }
  if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) {
    return `https://linkedin.com${path}`; // country subdomains and all query params are noise
  }

  const params = [...u.searchParams]
    .filter(([k]) => !k.toLowerCase().startsWith('utm_') && !TRACKING.has(k.toLowerCase()))
    .sort(([a, av], [b, bv]) => (a === b ? (av < bv ? -1 : av > bv ? 1 : 0) : a < b ? -1 : 1));
  const query = new URLSearchParams(params).toString();
  const port = u.port ? `:${u.port}` : '';
  return `https://${host}${port}${path}${query ? `?${query}` : ''}`;
}

type KeyFields = Pick<NormalizedItem, 'platform' | 'sourceId' | 'url' | 'author' | 'publishedAt' | 'content'>;

export function dedupeKey(item: KeyFields): string {
  const sourceId = item.sourceId?.trim();
  if (sourceId) return `${item.platform}:id:${sourceId}`;
  if (item.url?.trim()) return `${item.platform}:url:${canonicalizeUrl(item.url)}`;
  const who = (item.author?.handle || item.author?.name || '').trim().toLowerCase();
  const text = (item.content ?? '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 200);
  return `${item.platform}:fp:${sha256([item.platform, who, item.publishedAt ?? '', text].join('|'))}`;
}

export const resultId = (key: string) => sha256(key).slice(0, 16);
