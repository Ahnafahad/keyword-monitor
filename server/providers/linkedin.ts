// LinkedIn public post search via harvestapi/linkedin-post-search (no cookies, pay-per-event: ~$0.002/post).
// All keywords go into ONE run; each item carries `query.search`, which attributes it to its keyword.
import { runActor } from '../apify.ts';
import type { NormalizedItem } from '../types.ts';
import type { Provider, ProviderQuery, ProviderResult } from './types.ts';
import { cleanKeywords, compact, isObject, keepSince, num, str, toIso } from './query.ts';

export const DEFAULT_LINKEDIN_ACTOR = 'harvestapi/linkedin-post-search';
const actorId = process.env.APIFY_ACTOR_LINKEDIN?.trim() || DEFAULT_LINKEDIN_ACTOR;

/** LinkedIn's search bar takes plain words; richer syntax (quotes, OR, hiring terms) can be added here later. */
export function buildLinkedinQuery(keyword: string): string {
  return keyword;
}

export function buildLinkedinInput(queries: string[], since: Date, maxItemsPerKeyword: number) {
  return {
    searchQueries: queries,
    maxPosts: maxItemsPerKeyword,
    // The actor rounds this up to LinkedIn's buckets (24h/week/month...) and trims; we re-filter client-side.
    postedLimitDate: since.toISOString(),
    sortBy: 'relevance', // "date" returns far looser matches
    scrapeReactions: false,
    scrapeComments: false,
  };
}

const cleanProfileUrl = (u: unknown) => str(u)?.split('?')[0].replace(/\/posts\/?$/, '') ?? null;

export function mapLinkedinItem(raw: unknown, keyword: string): NormalizedItem | null {
  if (!isObject(raw) || (raw.type && raw.type !== 'post')) return null;
  const id = str(raw.id) ?? str(raw.entityId) ?? (num(raw.id) != null ? String(raw.id) : null);
  const url = str(raw.linkedinUrl) ?? str(raw.shareLinkedinUrl) ?? (id ? `https://www.linkedin.com/feed/update/urn:li:activity:${id}` : null);
  const article = isObject(raw.article) ? raw.article : null;
  const content = str(raw.content) ?? str(article?.title) ?? '';
  if (!url || (!id && !content)) return null;

  const a = isObject(raw.author) ? raw.author : {};
  const posted = isObject(raw.postedAt) ? raw.postedAt : {};
  const eng = isObject(raw.engagement) ? raw.engagement : {};
  return {
    platform: 'linkedin',
    sourceId: id ?? str(raw.shareUrn),
    url,
    author: {
      name: str(a.name),
      handle: str(a.publicIdentifier) ?? str(a.universalName),
      profileUrl: cleanProfileUrl(a.linkedinUrl),
    },
    title: null,
    content,
    publishedAt: toIso(posted.date) ?? toIso(posted.timestamp) ?? toIso(posted.postedAgoShort),
    matchedKeywords: [keyword],
    metadata: compact({
      likes: num(eng.likes),
      comments: num(eng.comments),
      shares: num(eng.shares),
      authorType: str(a.type), // "profile" | "company"
      authorHeadline: str(a.info), // headline for people, follower count for companies
      shareUrn: str(raw.shareUrn),
      context: str(raw.header?.text), // e.g. "New post in <group>", "X reposted this"
      linkTitle: str(article?.title),
      linkUrl: str(article?.link),
      imageCount: Array.isArray(raw.postImages) && raw.postImages.length ? raw.postImages.length : null,
    }),
    raw,
  };
}

async function search({ keywords, since, maxItemsPerKeyword }: ProviderQuery): Promise<ProviderResult> {
  const kws = cleanKeywords(keywords);
  if (!kws.length) return { queries: [], apifyRunIds: [], datasetIds: [], items: [] };
  const queries = kws.map(buildLinkedinQuery);
  const byQuery = new Map(queries.map((q, i) => [q.toLowerCase(), kws[i]]));

  const run = await runActor(actorId, buildLinkedinInput(queries, since, maxItemsPerKeyword), {
    maxItems: kws.length * maxItemsPerKeyword,
  });
  const items = run.items
    .map((raw) => {
      const kw = byQuery.get(String(raw?.query?.search ?? '').toLowerCase()) ?? (kws.length === 1 ? kws[0] : null);
      return kw ? mapLinkedinItem(raw, kw) : null;
    })
    .filter((i): i is NormalizedItem => i !== null);
  return { queries, apifyRunIds: [run.runId], datasetIds: [run.datasetId], items: keepSince(items, since) };
}

export const linkedinProvider: Provider = { platform: 'linkedin', label: 'LinkedIn posts', actorId, search };
