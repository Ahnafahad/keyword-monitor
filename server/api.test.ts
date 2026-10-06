import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { createApp } from './api.ts';
import { ingest } from './ingest.ts';
import { item, monitorInput, testCtx } from './test-helpers.ts';
import type { Monitor, Result, Run, Stats, SystemInfo } from './types.ts';

// One app on an ephemeral loopback port for the whole file; tests use distinct data.
const t = testCtx({ x: () => ({ items: [item({ sourceId: 'from-run', content: 'produced by the fake run' })] }) });
const server = createApp(t.ctx).listen(0, '127.0.0.1');
let base = '';
before(async () => {
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
after(() => {
  server.close();
  server.closeAllConnections();
});

async function call<T = any>(method: string, path: string, body?: unknown): Promise<{ status: number; body: T }> {
  const res = await fetch(base + path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
}
const idle = async () => {
  while (t.ctx.running.size) await new Promise((r) => setTimeout(r, 5));
};
const paused = (over = {}) => monitorInput({ status: 'paused', ...over });

test('api: monitor validation rejects bad input with {error}', async () => {
  const cases: Array<[unknown, RegExp]> = [
    [paused({ name: '   ' }), /name/],
    [paused({ keywords: [] }), /keywords/],
    [paused({ keywords: [' ', ''] }), /keywords/],
    [paused({ keywords: Array.from({ length: 26 }, (_, i) => `k${i}`) }), /keywords/],
    [paused({ keywords: 'ai' as any }), /keywords/],
    [paused({ platforms: [] }), /platform/],
    [paused({ platforms: ['myspace'] as any }), /platforms/],
    [paused({ lookbackDays: 0 }), /lookbackDays/],
    [paused({ lookbackDays: 91 }), /lookbackDays/],
    [paused({ lookbackDays: 1.5 }), /lookbackDays/],
    [paused({ frequencyMinutes: 14 }), /minimum 15 minutes/],
    [paused({ frequencyMinutes: 10081 }), /frequencyMinutes/],
    [paused({ status: 'archived' as any }), /status/],
    [[1, 2], /JSON object/],
  ];
  for (const [input, pattern] of cases) {
    const res = await call('POST', '/monitors', input);
    assert.equal(res.status, 400, JSON.stringify(input));
    assert.match(res.body.error, pattern);
  }
  const malformed = await call('POST', '/monitors', '{"name": ');
  assert.equal(malformed.status, 400);
  assert.equal(typeof malformed.body.error, 'string');
  assert.equal((await call<Monitor[]>('GET', '/monitors')).body.length, 0);
});

test('api: monitor CRUD, pause/resume scheduling fields', async () => {
  const created = await call<Monitor>('POST', '/monitors', paused({
    name: '  Bangladesh AI  ', keywords: [' AI engineer ', 'ai  ENGINEER', 'AI jobs'], platforms: ['web', 'x', 'x'],
  }));
  assert.equal(created.status, 201);
  const m = created.body;
  assert.equal(m.name, 'Bangladesh AI');
  assert.deepEqual(m.keywords, ['AI engineer', 'AI jobs'], 'trimmed, de-duplicated case-insensitively');
  assert.deepEqual(m.platforms, ['x', 'web']);
  assert.deepEqual(
    [m.status, m.nextRunAt, m.lastRunAt, m.running, m.lastRunStatus, m.resultCount, m.newCount24h],
    ['paused', null, null, false, null, 0, 0],
  );

  const list = await call<Monitor[]>('GET', '/monitors');
  assert.deepEqual(list.body.map((x) => x.id), [m.id]);

  const edited = await call<Monitor>('PATCH', `/monitors/${m.id}`, { name: 'Renamed', frequencyMinutes: 180 });
  assert.equal(edited.status, 200);
  assert.deepEqual([edited.body.name, edited.body.frequencyMinutes, edited.body.status], ['Renamed', 180, 'paused']);
  assert.deepEqual(edited.body.keywords, m.keywords, 'untouched fields are kept');
  assert.equal((await call('PATCH', `/monitors/${m.id}`, { frequencyMinutes: 5 })).status, 400);
  assert.equal((await call('PATCH', `/monitors/${m.id}`, { platforms: [] })).status, 400);

  // Resume a never-run monitor: due now, so it runs straight away; afterwards it is scheduled one interval out.
  const resumed = await call<Monitor>('PATCH', `/monitors/${m.id}`, { status: 'active' });
  assert.equal(resumed.body.status, 'active');
  await idle();
  const afterRun = (await call<Monitor[]>('GET', '/monitors')).body[0];
  assert.equal(afterRun.lastRunStatus, 'succeeded');
  assert.equal(afterRun.resultCount, 1);
  assert.equal(afterRun.newCount24h, 1);
  assert.equal(afterRun.nextRunAt, new Date(t.clock.t + 180 * 60e3).toISOString());

  const repaused = await call<Monitor>('PATCH', `/monitors/${m.id}`, { status: 'paused' });
  assert.equal(repaused.body.nextRunAt, null);
  const again = await call<Monitor>('PATCH', `/monitors/${m.id}`, { status: 'active' });
  assert.equal(again.body.nextRunAt, new Date(t.clock.t + 180 * 60e3).toISOString(), 'already ran: resume waits one interval');

  const runs = await call<Run[]>('GET', `/runs?monitorId=${m.id}`);
  assert.equal(runs.body.length, 2, 'one run per platform');
  assert.ok(runs.body.every((r) => r.status === 'succeeded' && r.trigger === 'schedule' && r.monitorName === 'Renamed'));
  assert.equal((await call('GET', '/runs?limit=1')).body.length, 1);
  assert.equal((await call('GET', '/runs?limit=abc')).status, 400);

  assert.equal((await call('DELETE', `/monitors/${m.id}`)).status, 204);
  assert.equal((await call('GET', '/monitors')).body.length, 0);
  for (const [method, path] of [['PATCH', ''], ['DELETE', ''], ['POST', '/run']]) {
    const res = await call(method, `/monitors/${m.id}${path}`, method === 'PATCH' ? {} : undefined);
    assert.equal(res.status, 404);
    assert.equal(res.body.error, 'Monitor not found');
  }
  const kept = await call<{ items: Result[]; total: number }>('GET', '/results');
  assert.equal(kept.body.total, 1, 'results survive monitor deletion');
  assert.deepEqual(kept.body.items[0].monitorIds, [], 'association removed');
  assert.equal((await call('GET', `/runs?monitorId=${m.id}`)).body.length, 2, 'run history survives too');
});

test('api: creating an active monitor runs it immediately; manual run returns 202', async () => {
  const created = await call<Monitor>('POST', '/monitors', monitorInput({ name: 'Auto' }));
  assert.equal(created.body.status, 'active');
  assert.ok(created.body.nextRunAt);
  await idle();
  const run = await call('POST', `/monitors/${created.body.id}/run`);
  assert.equal(run.status, 202);
  assert.deepEqual(run.body, { started: true });
  await idle();
  const runs = (await call<Run[]>('GET', `/runs?monitorId=${created.body.id}`)).body;
  assert.deepEqual(runs.map((r) => r.trigger), ['manual', 'schedule'], 'newest first');
  await call('DELETE', `/monitors/${created.body.id}`);
});

test('api: results filtering, search, sort, pagination', async () => {
  const a = (await call<Monitor>('POST', '/monitors', paused({ name: 'A' }))).body;
  const b = (await call<Monitor>('POST', '/monitors', paused({ name: 'B' }))).body;
  const now = t.ctx.now().toISOString();
  ingest(t.db, a.id, [
    item({ platform: 'linkedin', sourceId: 'li1', url: 'https://linkedin.com/posts/li1', content: 'We are HIRING an LLM engineer', publishedAt: '2026-09-01T00:00:00Z', matchedKeywords: ['LLM engineer'], author: { name: 'Rahim Uddin', handle: null, profileUrl: null } }),
    item({ platform: 'web', sourceId: null, url: 'https://blog.example.com/100%-remote', title: 'Remote AI roles', content: 'snake_case and 100% remote', publishedAt: '2026-09-15T00:00:00Z', matchedKeywords: ['ai jobs'] }),
    item({ platform: 'web', sourceId: null, url: 'https://blog.example.com/undated', title: 'Undated page', content: 'no date here', publishedAt: null, matchedKeywords: ['ai jobs'] }),
  ], now);
  ingest(t.db, b.id, [
    item({ platform: 'x', sourceId: 'tw1', content: 'thread about agents', publishedAt: '2026-09-20T00:00:00Z', matchedKeywords: ['ai agents'], author: { name: 'Karim', handle: 'karim_dev', profileUrl: null } }),
  ], now);
  type Page = { items: Result[]; total: number };
  const get = async (qs: string) => (await call<Page>('GET', `/results?${qs}`)).body;
  const ids = (p: Page) => p.items.map((r) => r.sourceId ?? r.title);
  const mine = `monitorId=${a.id}`;

  // Sort uses coalesce(publishedAt, discoveredAt): the undated page sorts by its discovery time (now).
  assert.deepEqual(ids(await get(mine)), ['Undated page', 'Remote AI roles', 'li1']);
  assert.deepEqual(ids(await get(`${mine}&sort=oldest`)), ['li1', 'Remote AI roles', 'Undated page']);

  assert.deepEqual(ids(await get('platform=linkedin')), ['li1']);
  assert.deepEqual(ids(await get(`monitorId=${b.id}`)), ['tw1']);
  assert.deepEqual(ids(await get('keyword=AI%20JOBS&sort=oldest')), ['Remote AI roles', 'Undated page']);
  assert.equal((await get('keyword=ai')).total, 0, 'keyword matches a whole element, not a substring');

  assert.deepEqual(ids(await get('q=hiring')), ['li1'], 'content, case-insensitive');
  assert.deepEqual(ids(await get('q=remote%20ai')), ['Remote AI roles'], 'title');
  assert.deepEqual(ids(await get('q=rahim')), ['li1'], 'author name');
  assert.deepEqual(ids(await get('q=KARIM_DEV')), ['tw1'], 'author handle');
  assert.deepEqual(ids(await get('q=example.com%2Fundated')), ['Undated page'], 'url');
  assert.deepEqual(ids(await get('q=100%25')), ['Remote AI roles'], '% is literal');
  assert.deepEqual(ids(await get('q=snake_case')), ['Remote AI roles'], '_ is literal');
  assert.equal((await get('q=snakeXcase')).total, 0);
  assert.equal((await get('q=profileUrl')).total, 0, 'does not match JSON structure');

  assert.deepEqual(ids(await get(`${mine}&from=2026-09-10&to=2026-09-15`)), ['Remote AI roles'], 'to is inclusive');
  assert.deepEqual(ids(await get(`${mine}&to=2026-09-10T00:00:00Z`)), ['li1']);
  assert.deepEqual(ids(await get(`${mine}&from=2026-10-01`)), ['Undated page']);

  const page1 = await get(`${mine}&limit=2`);
  const page2 = await get(`${mine}&limit=2&offset=2`);
  assert.deepEqual([page1.total, page2.total], [3, 3], 'total ignores pagination');
  assert.deepEqual([...ids(page1), ...ids(page2)], ['Undated page', 'Remote AI roles', 'li1']);
  assert.equal((await get('limit=9999')).items.length <= 200, true);

  for (const qs of ['platform=myspace', 'sort=random', 'limit=-1', 'from=notadate']) {
    assert.equal((await call('GET', `/results?${qs}`)).status, 400, qs);
  }

  const li = (await get('platform=linkedin')).items[0];
  assert.deepEqual(li.monitorIds, [a.id]);
  const raw = await call('GET', li.rawRef!.replace('/api', ''));
  assert.deepEqual(raw.body.payload, { original: true });
  assert.equal((await call('GET', '/results/nope/raw')).status, 404);
});

test('api: stats, system, exports, 404', async () => {
  const stats = (await call<Stats>('GET', '/stats')).body;
  assert.equal(stats.totalResults, stats.byPlatform.linkedin + stats.byPlatform.x + stats.byPlatform.web);
  assert.equal(stats.totalMonitors, 2);
  assert.equal(stats.activeMonitors, 0);
  assert.equal(stats.nextRunAt, null);
  assert.ok(stats.lastRunAt);
  assert.equal(stats.series.length, 14);
  assert.deepEqual(stats.series.map((d) => d.date), stats.series.map((d) => d.date).sort(), 'oldest first');
  const today = stats.series.at(-1)!;
  assert.equal(today.total, stats.totalResults, 'everything was discovered "today" on the test clock');
  assert.equal(today.total, today.linkedin + today.x + today.web);
  assert.equal(stats.series[0].total, 0, 'zero-filled');
  assert.equal(stats.newResults24h, stats.totalResults);

  delete process.env.APIFY_API_TOKEN; // unconfigured => no network call
  const system = (await call<SystemInfo>('GET', '/system')).body;
  assert.deepEqual(system.apify, { configured: false, ok: false, username: null, error: 'APIFY_API_TOKEN is not set' });
  assert.deepEqual(system.providers.x, { actorId: 'fake/x', label: 'Fake x' });
  assert.equal(typeof system.version, 'string');

  const text = async (path: string) => (await fetch(base + path)).text();
  const results = (await text('/export/results.jsonl')).trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(results.length, stats.totalResults);
  assert.ok(results.every((r) => r.id && r.dedupeKey && Array.isArray(r.monitorIds)));
  assert.equal(JSON.parse(await text('/export/monitors.json')).length, 2);
  assert.ok((await text('/export/runs.jsonl')).trim().split('\n').every((l) => JSON.parse(l).status));

  const missing = await call('GET', '/nope');
  assert.equal(missing.status, 404);
  assert.deepEqual(missing.body, { error: 'Not found' });
});
