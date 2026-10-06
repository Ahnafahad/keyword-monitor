// Shared fixtures for *.test.ts. No network, in-memory DB, controllable clock.
import { insertMonitor, openDb } from './db.ts';
import type { Provider, ProviderQuery, ProviderResult } from './providers/types.ts';
import { createCtx, type Ctx } from './runner.ts';
import type { MonitorInput, NormalizedItem, Platform } from './types.ts';

export function item(over: Partial<NormalizedItem> = {}): NormalizedItem {
  return {
    platform: 'x',
    sourceId: '1',
    url: 'https://x.com/someone/status/1',
    author: { name: 'Someone', handle: 'someone', profileUrl: null },
    title: null,
    content: 'Hiring an AI engineer in Dhaka',
    publishedAt: '2026-10-01T10:00:00.000Z',
    matchedKeywords: ['ai engineer'],
    metadata: {},
    raw: { original: true },
    ...over,
  };
}

export const monitorInput = (over: Partial<MonitorInput> = {}): MonitorInput => ({
  name: 'Test monitor',
  keywords: ['ai engineer'],
  platforms: ['x'],
  lookbackDays: 7,
  frequencyMinutes: 60,
  ...over,
});

type Search = (q: ProviderQuery) => Promise<Partial<ProviderResult>> | Partial<ProviderResult>;

export function fakeProvider(platform: Platform, search: Search = () => ({})): Provider & { calls: ProviderQuery[] } {
  const calls: ProviderQuery[] = [];
  return {
    platform,
    label: `Fake ${platform}`,
    actorId: `fake/${platform}`,
    calls,
    async search(q) {
      calls.push(q);
      return { queries: q.keywords, apifyRunIds: [`run-${platform}`], datasetIds: [`ds-${platform}`], items: [], ...(await search(q)) };
    },
  };
}

/** Ctx with an in-memory DB, fake providers and a clock the test moves by assigning `clock.t`. */
export function testCtx(searches: Partial<Record<Platform, Search>> = {}) {
  const clock = { t: Date.parse('2026-10-07T12:00:00.000Z') };
  const providers = {
    linkedin: fakeProvider('linkedin', searches.linkedin),
    x: fakeProvider('x', searches.x),
    web: fakeProvider('web', searches.web),
  };
  const db = openDb();
  const ctx: Ctx = createCtx({ db, providers, now: () => new Date(clock.t), retryDelayMs: 0, log: () => {} });
  const addMonitor = (over: Partial<MonitorInput> = {}) => insertMonitor(db, monitorInput(over), ctx.now());
  return { ctx, db, clock, providers, addMonitor };
}
