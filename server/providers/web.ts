// Web / blog discovery via apify/google-search-scraper (pay-per-event: ~$0.0025 per results page + $0.001 per run).
// One run for all keywords; each dataset item is one results page whose `searchQuery.term` attributes it.
// Google's title + snippet + date is what we store. There is deliberately no page-extraction stage: it multiplies
// cost and run time for little gain in a monitoring feed (see PROVIDERS.md for how to add one).
import { runActor } from '../apify.ts';
import type { NormalizedItem } from '../types.ts';
import type { Provider, ProviderQuery, ProviderResult } from './types.ts';
import { cleanKeywords, compact, isObject, isoDay, keepSince, num, str, toIso } from './query.ts';
import { SOCIAL_DOMAINS, isSocialUrl } from '../social.ts';

export const DEFAULT_WEB_SEARCH_ACTOR = 'apify/google-search-scraper';
const actorId = process.env.APIFY_ACTOR_WEB_SEARCH?.trim() || DEFAULT_WEB_SEARCH_ACTOR;

const RESULTS_PER_PAGE = 10;
const MAX_CONTENT = 2000;

/** Plain words + Google's `after:` date operator (day-precise). Add site:/intitle:/OR phrasing here later. */
export function buildWebQuery(keyword: string, since: Date, excludeSocialWeb = false): string {
  const excluded = excludeSocialWeb ? ` ${SOCIAL_DOMAINS.map((domain) => `-site:${domain}`).join(' ')}` : '';
  return `${keyword} after:${isoDay(since)}${excluded}`;
}

export function buildWebInput(queries: string[], maxItemsPerKeyword: number) {
  return {
    queries: queries.join('\n'),
    maxPagesPerQuery: Math.max(1, Math.ceil(maxItemsPerKeyword / RESULTS_PER_PAGE)),
    saveHtml: false,
    saveHtmlToKeyValueStore: false,
  };
}

function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** Maps one organic result (an entry of a results page's `organicResults`). */
export function mapWebItem(raw: unknown, keyword: string): NormalizedItem | null {
  if (!isObject(raw)) return null;
  const url = str(raw.url);
  const domain = url ? domainOf(url) : null;
  const title = str(raw.title);
  if (!url || !domain || !/^https?:/i.test(url)) return null;
  const snippet = str(raw.description) ?? '';
  if (!title && !snippet) return null;
  return {
    platform: 'web',
    sourceId: null,
    url,
    // Google results carry no byline; the publishing site is in metadata.siteName / metadata.domain.
    author: { name: null, handle: null, profileUrl: null },
    title,
    content: snippet.slice(0, MAX_CONTENT),
    publishedAt: toIso(raw.date), // Google's own date; often relative ("3 days ago") so day-level at best
    matchedKeywords: [keyword],
    metadata: compact({
      domain,
      siteName: str(raw.websiteTitle),
      searchRank: num(raw.position),
      emphasizedKeywords: Array.isArray(raw.emphasizedKeywords) ? raw.emphasizedKeywords.filter((k: unknown) => str(k)) : null,
    }),
    raw,
  };
}

/** Flattens one results page into normalized items, at most `limit`. */
export function mapWebPage(page: unknown, keyword: string, limit = Infinity): NormalizedItem[] {
  const results = isObject(page) && Array.isArray(page.organicResults) ? page.organicResults : [];
  return results
    .map((r) => mapWebItem(r, keyword))
    .filter((i): i is NormalizedItem => i !== null)
    .slice(0, limit);
}

async function search({ keywords, since, maxItemsPerKeyword, excludeSocialWeb = false }: ProviderQuery): Promise<ProviderResult> {
  const kws = cleanKeywords(keywords);
  if (!kws.length) return { queries: [], apifyRunIds: [], datasetIds: [], items: [] };
  const queries = kws.map((k) => buildWebQuery(k, since, excludeSocialWeb));
  const byQuery = new Map(queries.map((q, i) => [q.toLowerCase(), kws[i]]));

  // No maxItems option here: Apify turns it into a max-charge cap and this actor rejects caps under $0.50.
  // The run is already bounded by queries x maxPagesPerQuery.
  const run = await runActor(actorId, buildWebInput(queries, maxItemsPerKeyword));
  const taken = new Map<string, number>();
  const items: NormalizedItem[] = [];
  for (const page of run.items) {
    const kw = byQuery.get(String(page?.searchQuery?.term ?? '').toLowerCase()) ?? (kws.length === 1 ? kws[0] : null);
    if (!kw) continue;
    const mapped = mapWebPage(page, kw)
      .filter((item) => !excludeSocialWeb || !isSocialUrl(item.url))
      .slice(0, maxItemsPerKeyword - (taken.get(kw) ?? 0));
    taken.set(kw, (taken.get(kw) ?? 0) + mapped.length);
    items.push(...mapped);
  }
  return { queries, apifyRunIds: [run.runId], datasetIds: [run.datasetId], items: keepSince(items, since) };
}

export const webProvider: Provider = { platform: 'web', label: 'Web & blogs', actorId, search };
