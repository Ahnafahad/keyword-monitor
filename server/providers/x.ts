// X (Twitter) public post search via xquik/x-tweet-scraper (no login, pay-per-result: $0.00015/tweet, no start fee).
// Its output does not say which search term produced a tweet, so we do one bounded run per keyword
// (same cost as one batched run, since only results are billed) and run them in parallel.
import { runActor } from '../apify.ts';
import type { NormalizedItem } from '../types.ts';
import type { Provider, ProviderQuery, ProviderResult } from './types.ts';
import { cleanKeywords, compact, isObject, isoDay, keepSince, num, str, toIso } from './query.ts';

export const DEFAULT_X_ACTOR = 'xquik/x-tweet-scraper';
const actorId = process.env.APIFY_ACTOR_X?.trim() || DEFAULT_X_ACTOR;

/** Plain words are AND-matched by X in any language; `since:` is day-precise (UTC). Add operators here later. */
export function buildXQuery(keyword: string, since: Date): string {
  return `${keyword} since:${isoDay(since)}`;
}

export function buildXInput(query: string, maxItems: number) {
  return { searchTerms: [query], maxItems, queryType: 'Latest' }; // native retweets are excluded by default
}

/** Replace t.co short links with their real targets and drop the trailing media link. */
function expandLinks(text: string, urls: unknown, media: unknown): string {
  for (const u of Array.isArray(urls) ? urls : []) {
    if (str(u?.url) && str(u?.expanded_url)) text = text.split(u.url).join(u.expanded_url);
  }
  for (const m of Array.isArray(media) ? media : []) {
    if (str(m?.url)) text = text.split(m.url).join('');
  }
  return text.trim();
}

export function mapXItem(raw: unknown, keyword: string): NormalizedItem | null {
  if (!isObject(raw) || (raw.type && raw.type !== 'tweet')) return null;
  const id = str(raw.id) ?? (num(raw.id) != null ? String(raw.id) : null);
  if (!id) return null;
  const a = isObject(raw.author) ? raw.author : {};
  const handle = str(a.username) ?? str(a.userName);
  const note = isObject(raw.noteTweet) ? raw.noteTweet : null; // long-form tweets: `text` is truncated
  const text = str(note?.text) ?? str(raw.text) ?? '';
  const entities = (note?.entities ?? raw.entities) as any;
  const card = raw.card?.bindingValues;
  const article = isObject(raw.article) ? raw.article : null; // X long-form article: the tweet text is just a link
  const articleText = [str(article?.title), str(article?.previewText)].filter(Boolean).join('\n\n');
  const body = expandLinks(text, entities?.urls, raw.media);
  return {
    platform: 'x',
    sourceId: id,
    url: str(raw.url) ?? `https://x.com/${handle ?? 'i'}/status/${id}`,
    author: { name: str(a.name), handle, profileUrl: handle ? `https://x.com/${handle}` : null },
    title: null,
    content: articleText ? `${articleText}\n\n${body}` : body,
    publishedAt: toIso(raw.createdAt),
    matchedKeywords: [keyword],
    metadata: compact({
      likes: num(raw.likeCount),
      reposts: num(raw.retweetCount),
      replies: num(raw.replyCount),
      quotes: num(raw.quoteCount),
      views: num(raw.viewCount),
      bookmarks: num(raw.bookmarkCount),
      language: raw.lang === 'zxx' || raw.lang === 'und' ? null : str(raw.lang),
      hashtags: (Array.isArray(raw.entities?.hashtags) ? raw.entities.hashtags : []).map((h: any) => str(h?.text)).filter(Boolean),
      isReply: raw.isReply === true ? true : null,
      isQuote: raw.isQuoteStatus === true ? true : null,
      conversationId: str(raw.conversationId),
      authorFollowers: num(a.followers),
      authorVerified: a.isBlueVerified === true || a.isVerified === true ? true : null,
      authorBio: str(a.description),
      linkTitle: str(card?.title) ?? str(article?.title),
      linkDomain: str(card?.domain),
      mediaCount: Array.isArray(raw.media) && raw.media.length ? raw.media.length : null,
    }),
    raw,
  };
}

async function search({ keywords, since, maxItemsPerKeyword }: ProviderQuery): Promise<ProviderResult> {
  const kws = cleanKeywords(keywords);
  const queries = kws.map((k) => buildXQuery(k, since));
  // ponytail: all keywords run at once (Apify STARTER allows 32 concurrent runs); add a pool if monitors grow past that.
  const runs = await Promise.all(
    queries.map((q) => runActor(actorId, buildXInput(q, maxItemsPerKeyword), { maxItems: maxItemsPerKeyword })),
  );
  const items = runs.flatMap((run, i) =>
    run.items.map((raw) => mapXItem(raw, kws[i])).filter((item): item is NormalizedItem => item !== null),
  );
  return {
    queries,
    apifyRunIds: runs.map((r) => r.runId),
    datasetIds: runs.map((r) => r.datasetId),
    items: keepSince(items, since),
  };
}

export const xProvider: Provider = { platform: 'x', label: 'X posts', actorId, search };
