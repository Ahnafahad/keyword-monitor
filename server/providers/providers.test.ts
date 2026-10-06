import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { NormalizedItem } from '../types.ts';
import { cleanKeywords, keepSince, toIso } from './query.ts';
import { buildLinkedinInput, buildLinkedinQuery, mapLinkedinItem } from './linkedin.ts';
import { buildXInput, buildXQuery, mapXItem } from './x.ts';
import { buildWebInput, buildWebQuery, mapWebItem, mapWebPage } from './web.ts';

const fixture = (name: string): any[] => JSON.parse(readFileSync(new URL(`./__fixtures__/${name}.json`, import.meta.url), 'utf8'));
const KW = 'AI engineer Bangladesh';
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const BAD = [null, undefined, 42, 'str', [], {}, { id: null }, { type: 'comment', id: '1' }, { author: 'x', url: 12 }];

function assertNormalized(item: NormalizedItem | null, platform: string, raw: unknown): asserts item is NormalizedItem {
  assert.ok(item, 'fixture item should map');
  assert.equal(item.platform, platform);
  assert.match(item.url, /^https?:\/\//);
  assert.equal(typeof item.content, 'string');
  assert.ok(item.publishedAt === null || ISO.test(item.publishedAt), `publishedAt ${item.publishedAt}`);
  assert.deepEqual(item.matchedKeywords, [KW]);
  assert.deepEqual(Object.keys(item.author).sort(), ['handle', 'name', 'profileUrl']);
  assert.equal(item.raw, raw, 'raw is the untouched item');
  assert.doesNotThrow(() => JSON.stringify(item.metadata));
  assert.ok(!Object.values(item.metadata).some((v) => v == null), 'metadata has no null entries');
}

test('linkedin: fixtures map to normalized items', () => {
  const raws = fixture('linkedin');
  assert.ok(raws.length >= 5);
  for (const raw of raws) {
    const item = mapLinkedinItem(raw, KW);
    assertNormalized(item, 'linkedin', raw);
    assert.equal(item.sourceId, String(raw.id));
    assert.equal(item.sourceId, mapLinkedinItem(structuredClone(raw), 'other')!.sourceId, 'sourceId is stable');
    assert.equal(item.title, null);
    assert.ok(item.content.length > 0);
    assert.match(item.url, /linkedin\.com/);
    assert.ok(item.publishedAt, 'linkedin fixtures all carry a date');
    assert.ok(item.author.name);
    assert.ok(item.author.profileUrl && !item.author.profileUrl.includes('?') && !item.author.profileUrl.endsWith('/posts'));
    assert.equal(typeof item.metadata.likes, 'number');
  }
});

test('linkedin: falls back to relative date and survives odd shapes', () => {
  const now = Date.now();
  const item = mapLinkedinItem({ id: '1', linkedinUrl: 'https://www.linkedin.com/posts/x', content: 'hi', postedAt: { postedAgoShort: '3h' } }, KW)!;
  assert.ok(Math.abs(now - 3 * 36e5 - Date.parse(item.publishedAt!)) < 5000);
  assert.equal(mapLinkedinItem({ id: '1', linkedinUrl: 'https://l/x', content: 'hi', postedAt: 'garbage', author: null }, KW)!.publishedAt, null);
  for (const bad of BAD) assert.equal(mapLinkedinItem(bad, KW), null);
});

test('x: fixtures map to normalized items', () => {
  const raws = fixture('x');
  assert.ok(raws.length >= 5);
  for (const raw of raws) {
    const item = mapXItem(raw, KW);
    assertNormalized(item, 'x', raw);
    assert.equal(item.sourceId, raw.id);
    assert.match(item.sourceId!, /^\d+$/);
    assert.equal(item.title, null);
    assert.ok(item.url.endsWith(`/status/${raw.id}`));
    assert.equal(item.author.handle, raw.author.username);
    assert.equal(item.author.profileUrl, `https://x.com/${raw.author.username}`);
    assert.equal(item.publishedAt, new Date(raw.createdAt).toISOString());
    assert.ok(!item.content.includes('https://t.co/') || !raw.entities?.urls?.length, 't.co links are expanded');
    assert.equal(typeof item.metadata.likes, 'number');
  }
  const long = raws.find((r) => r.noteTweet?.text);
  if (long) assert.ok(mapXItem(long, KW)!.content.length >= long.text.length, 'note tweets use the full text');
});

test('x: malformed items are skipped, bad dates become null', () => {
  for (const bad of BAD) assert.equal(mapXItem(bad, KW), null);
  const item = mapXItem({ id: 123, text: 'hello', createdAt: 'not a date' }, KW)!;
  assert.equal(item.sourceId, '123');
  assert.equal(item.publishedAt, null);
  assert.equal(item.url, 'https://x.com/i/status/123');
  assert.deepEqual(item.author, { name: null, handle: null, profileUrl: null });
});

test('web: fixture pages map to normalized items', () => {
  const pages = fixture('web');
  const results = pages.flatMap((p) => p.organicResults);
  assert.ok(results.length >= 5);
  for (const raw of results) {
    const item = mapWebItem(raw, KW);
    assertNormalized(item, 'web', raw);
    assert.equal(item.sourceId, null);
    assert.equal(item.url, raw.url);
    assert.equal(item.title, raw.title);
    assert.ok(item.content.length <= 2000);
    assert.equal(item.metadata.domain, new URL(raw.url).hostname.replace(/^www\./, ''));
    assert.equal(item.metadata.searchRank, raw.position);
    assert.equal(item.publishedAt !== null, Boolean(raw.date), 'date present iff Google gave one');
  }
  assert.equal(mapWebPage(pages[0], KW).length, pages[0].organicResults.length);
  assert.equal(mapWebPage(pages[0], KW, 3).length, 3);
});

test('web: malformed items/pages are skipped', () => {
  for (const bad of [...BAD, { url: 'not a url', title: 't' }, { url: 'ftp://x.y/z', title: 't' }, { url: 'https://a.b/c' }]) {
    assert.equal(mapWebItem(bad, KW), null);
  }
  for (const bad of [null, {}, { organicResults: 'nope' }]) assert.deepEqual(mapWebPage(bad, KW), []);
  assert.equal(mapWebPage({ organicResults: [null, { url: 'https://a.b/c', title: 'ok' }] }, KW).length, 1);
  const long = mapWebItem({ url: 'https://a.b/c', title: 't', description: 'x'.repeat(5000), date: '3 days ago' }, KW)!;
  assert.equal(long.content.length, 2000);
  assert.ok(long.publishedAt);
});

test('query builders', () => {
  const since = new Date('2026-09-30T15:04:05Z');
  assert.equal(buildLinkedinQuery(KW), KW);
  assert.deepEqual(buildLinkedinInput(['a', 'b'], since, 7), {
    searchQueries: ['a', 'b'], maxPosts: 7, postedLimitDate: '2026-09-30T15:04:05.000Z',
    sortBy: 'relevance', scrapeReactions: false, scrapeComments: false,
  });
  assert.equal(buildXQuery(KW, since), `${KW} since:2026-09-30`);
  assert.deepEqual(buildXInput('q', 5), { searchTerms: ['q'], maxItems: 5, queryType: 'Latest' });
  assert.equal(buildWebQuery(KW, since), `${KW} after:2026-09-30`);
  assert.equal(buildWebInput(['a', 'b'], 20).queries, 'a\nb');
  assert.deepEqual([1, 10, 11, 20, 25].map((n) => buildWebInput(['a'], n).maxPagesPerQuery), [1, 1, 2, 2, 3]);
  assert.deepEqual(cleanKeywords(['  AI   engineer ', '', 'ai engineer', 'LLM']), ['AI engineer', 'LLM']);
});

test('toIso: formats and edge cases', () => {
  const now = new Date('2026-10-07T00:00:00.000Z');
  assert.equal(toIso('2026-10-06T18:37:01.090Z', now), '2026-10-06T18:37:01.090Z');
  assert.equal(toIso('Tue Oct 06 18:57:39 +0000 2026', now), '2026-10-06T18:57:39.000Z');
  assert.equal(toIso(1791311821090, now), new Date(1791311821090).toISOString());
  assert.equal(toIso(1791311821, now), new Date(1791311821000).toISOString());
  assert.equal(toIso('1791311821090', now), new Date(1791311821090).toISOString());
  assert.equal(toIso(new Date('2026-01-02T03:04:05Z'), now), '2026-01-02T03:04:05.000Z');
  assert.equal(toIso('3h', now), '2026-10-06T21:00:00.000Z');
  assert.equal(toIso('2 days ago', now), '2026-10-05T00:00:00.000Z');
  assert.equal(toIso('a week ago', now), '2026-09-30T00:00:00.000Z');
  assert.equal(toIso('1mo', now), '2026-09-07T00:00:00.000Z');
  assert.equal(toIso('Yesterday', now), '2026-10-06T00:00:00.000Z');
  for (const bad of [null, undefined, '', '   ', 'soon', '5', 'NaN', {}, [], NaN, Infinity, -1, '0000-00-00', '2026-13-45', '3 parsecs ago', new Date('x'), '2999-01-01']) {
    assert.equal(toIso(bad, now), null, `expected null for ${String(bad)}`);
  }
});

test('keepSince keeps unknown dates and drops old ones', () => {
  const since = new Date('2026-10-01T00:00:00Z');
  const items = [{ publishedAt: '2026-10-02T00:00:00.000Z' }, { publishedAt: null }, { publishedAt: '2026-09-30T23:59:59.000Z' }, { publishedAt: '2026-10-01T00:00:00.000Z' }];
  assert.deepEqual(keepSince(items, since).map((i) => i.publishedAt), ['2026-10-02T00:00:00.000Z', null, '2026-10-01T00:00:00.000Z']);
});
