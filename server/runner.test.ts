import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ApifyAuthError, ApifyError, ApifyThrottledError } from './apify.ts';
import { getMonitorRow, listResults, listRuns } from './db.ts';
import { isRunning, runMonitor } from './runner.ts';
import { repairStaleRuns, tick } from './scheduler.ts';
import { item, testCtx } from './test-helpers.ts';

const HOUR = 3600e3;

test('runner: records counts, apify ids and queries; reschedules the monitor', async () => {
  const { ctx, db, clock, addMonitor } = testCtx({
    x: () => ({ items: [item({ sourceId: '1' }), item({ sourceId: '1', matchedKeywords: ['ai jobs'] })], queries: ['"ai engineer" hiring'] }),
  });
  const m = addMonitor({ frequencyMinutes: 60 });
  const start = clock.t;
  const { started, done } = runMonitor(ctx, m.id, 'manual');
  assert.equal(started, true);
  assert.equal(isRunning(ctx, m.id), true);
  await done;
  assert.equal(isRunning(ctx, m.id), false);

  const [run] = listRuns(db);
  assert.equal(run.status, 'succeeded');
  assert.equal(run.trigger, 'manual');
  assert.equal(run.monitorName, 'Test monitor');
  assert.equal(run.actorId, 'fake/x');
  assert.deepEqual(run.queries, ['"ai engineer" hiring']);
  assert.deepEqual(run.apifyRunIds, ['run-x']);
  assert.deepEqual(run.datasetIds, ['ds-x']);
  assert.deepEqual([run.fetched, run.newCount, run.updatedCount, run.duplicateCount], [2, 1, 0, 0]);
  assert.ok(run.finishedAt);

  const after = getMonitorRow(db, m.id)!;
  assert.equal(after.lastRunAt, new Date(start).toISOString());
  assert.equal(after.nextRunAt, new Date(start + HOUR).toISOString());
});

test('runner: since = lookback on the first run, last successful start minus 1h afterwards', async () => {
  const { ctx, clock, providers, addMonitor } = testCtx();
  const m = addMonitor({ lookbackDays: 7 });
  const first = clock.t;
  await runMonitor(ctx, m.id, 'manual').done;
  clock.t += 3 * HOUR;
  await runMonitor(ctx, m.id, 'manual').done;
  assert.equal(providers.x.calls[0].since.getTime(), first - 7 * 24 * HOUR);
  assert.equal(providers.x.calls[1].since.getTime(), first - HOUR);
  assert.equal(providers.x.calls[0].maxItemsPerKeyword, ctx.maxItemsPerKeyword);
  assert.deepEqual(providers.x.calls[0].keywords, ['ai engineer']);
});

test('runner: one provider throwing leaves the other stored and existing data intact', async () => {
  let fail = false;
  const { ctx, db, addMonitor } = testCtx({
    x: () => {
      if (fail) throw new Error('boom\n    at secret/stack/frame.ts:1');
      return { items: [item({ sourceId: 'old' })] };
    },
    web: () => ({ items: [item({ platform: 'web', sourceId: null, url: 'https://example.com/a' })] }),
  });
  const m = addMonitor({ platforms: ['x', 'web'] });
  await runMonitor(ctx, m.id, 'manual').done;
  assert.equal(listResults(db, {}).total, 2);

  fail = true;
  await runMonitor(ctx, m.id, 'manual').done;
  const [a, b] = listRuns(db, { limit: 2 });
  const byPlatform = { [a.platform]: a, [b.platform]: b };
  assert.equal(byPlatform.x.status, 'failed');
  assert.equal(byPlatform.x.error, 'boom', 'first line only, no stack');
  assert.equal(byPlatform.web.status, 'succeeded');
  assert.equal(byPlatform.web.duplicateCount, 1);
  assert.equal(listResults(db, {}).total, 2, 'a failed run deletes nothing');
  assert.equal(isRunning(ctx, m.id), false);
});

test('runner: throttled status stores retryAfter and the monitor is not scheduled before it', async () => {
  const { ctx, db, clock, providers, addMonitor } = testCtx({
    x: () => {
      throw new ApifyThrottledError('Too many requests', 2 * 3600);
    },
  });
  const m = addMonitor({ frequencyMinutes: 15 });
  await Promise.all(tick(ctx));
  const [run] = listRuns(db);
  const retryAfter = new Date(clock.t + 2 * HOUR).toISOString();
  assert.equal(run.status, 'throttled');
  assert.equal(run.retryAfter, retryAfter);
  assert.equal(run.error, 'Too many requests');
  assert.equal(getMonitorRow(db, m.id)!.nextRunAt, retryAfter);
  assert.equal(providers.x.calls.length, 1, 'throttles are not retried');

  clock.t += HOUR; // past the 15 min interval, still before retryAfter
  assert.equal(tick(ctx).length, 0);
  clock.t += HOUR;
  assert.equal(tick(ctx).length, 1);
});

test('runner: one retry for a transient failure, none for auth errors', async () => {
  let attempts = 0;
  const { ctx, db, providers, addMonitor } = testCtx({
    x: () => {
      if (attempts++ === 0) throw new ApifyError('Network error calling Apify: reset');
      return { items: [item()] };
    },
    web: () => {
      throw new ApifyAuthError('User was not found or authentication token is not valid', 401);
    },
    linkedin: () => {
      throw new ApifyError('Actor run abc FAILED');
    },
  });
  const m = addMonitor({ platforms: ['linkedin', 'x', 'web'] });
  await runMonitor(ctx, m.id, 'manual').done;
  const status = Object.fromEntries(listRuns(db).map((r) => [r.platform, r.status]));
  assert.deepEqual(status, { x: 'succeeded', web: 'failed', linkedin: 'failed' });
  assert.equal(providers.x.calls.length, 2);
  assert.equal(providers.web.calls.length, 1);
  assert.equal(providers.linkedin.calls.length, 2, 'retried once, then gives up');
});

test('runner: overlap guard refuses a second run while one is in flight', async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const { ctx, db, providers, addMonitor } = testCtx({ x: () => gate.then(() => ({})) });
  const m = addMonitor();
  const first = runMonitor(ctx, m.id, 'manual');
  assert.equal(first.started, true);
  assert.equal(runMonitor(ctx, m.id, 'manual').started, false);
  assert.equal(tick(ctx).length, 0, 'scheduler skips a running monitor');
  assert.equal(listRuns(db)[0].status, 'running');
  release();
  await first.done;
  assert.equal(providers.x.calls.length, 1);
  assert.equal(listRuns(db).length, 1);
  assert.equal(runMonitor(ctx, 'no-such-monitor', 'manual').started, false);
});

test('runner: rewrites the export files after a run, without secrets', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kwmon-'));
  process.env.APIFY_API_TOKEN = 'apify_api_SECRETTOKEN';
  try {
    const { ctx, addMonitor } = testCtx({
      x: () => ({ items: [item({ sourceId: 'b' }), item({ sourceId: 'a' })] }),
      web: () => {
        throw new Error('GET https://api.apify.com/v2/x?token=apify_api_SECRETTOKEN failed');
      },
    });
    ctx.dataDir = dir;
    const m = addMonitor({ platforms: ['x', 'web'] });
    await runMonitor(ctx, m.id, 'manual').done;

    const read = (f: string) => readFileSync(join(dir, 'export', f), 'utf8');
    const results = read('results.jsonl').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(results.length, 2);
    assert.deepEqual(results.map((r) => r.id), results.map((r) => r.id).sort(), 'deterministic order');
    assert.deepEqual(results[0].monitorIds, [m.id]);
    assert.equal(JSON.parse(read('monitors.json'))[0].name, 'Test monitor');
    const runs = read('runs.jsonl').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(runs.length, 2);
    assert.ok(!(read('runs.jsonl') + read('results.jsonl') + read('monitors.json')).includes('SECRETTOKEN'));
    assert.ok(runs.find((r) => r.platform === 'web').error.includes('[redacted]'));
    assert.ok(!existsSync(join(dir, 'export', '.results.jsonl.tmp')));
    const before = read('results.jsonl');
    await runMonitor(ctx, m.id, 'manual').done;
    assert.equal(JSON.parse(read('results.jsonl').split('\n')[0]).discoveredAt, JSON.parse(before.split('\n')[0]).discoveredAt);
  } finally {
    delete process.env.APIFY_API_TOKEN;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('scheduler: due monitor is picked and next_run_at advances; paused is not picked', async () => {
  const { ctx, db, clock, providers, addMonitor } = testCtx();
  const active = addMonitor({ name: 'active', frequencyMinutes: 30 });
  const paused = addMonitor({ name: 'paused', status: 'paused' });
  assert.equal(active.nextRunAt, new Date(clock.t).toISOString(), 'new monitors are due immediately');
  assert.equal(paused.nextRunAt, null);

  await Promise.all(tick(ctx));
  assert.equal(providers.x.calls.length, 1);
  assert.equal(listRuns(db)[0].trigger, 'schedule');
  assert.equal(listRuns(db, { monitorId: paused.id }).length, 0);
  assert.equal(getMonitorRow(db, active.id)!.nextRunAt, new Date(clock.t + 30 * 60e3).toISOString());

  clock.t += 29 * 60e3;
  assert.equal(tick(ctx).length, 0, 'not due yet');

  // Long overdue (machine was off): exactly one catch-up run.
  clock.t += 10 * HOUR;
  await Promise.all(tick(ctx));
  assert.equal(tick(ctx).length, 0);
  assert.equal(providers.x.calls.length, 2);
  assert.equal(getMonitorRow(db, active.id)!.nextRunAt, new Date(clock.t + 30 * 60e3).toISOString());
});

test('scheduler: a manual run of a paused monitor does not schedule it', async () => {
  const { ctx, db, addMonitor } = testCtx();
  const m = addMonitor({ status: 'paused' });
  await runMonitor(ctx, m.id, 'manual').done;
  const row = getMonitorRow(db, m.id)!;
  assert.ok(row.lastRunAt);
  assert.equal(row.nextRunAt, null);
});

test('scheduler: stale running rows are repaired on boot', async () => {
  const { ctx, db, addMonitor } = testCtx();
  const m = addMonitor();
  await runMonitor(ctx, m.id, 'manual').done;
  db.prepare(
    `INSERT INTO runs (id, monitor_id, monitor_name, platform, actor_id, queries, status, trigger, started_at)
     VALUES ('stale', ?, 'Test monitor', 'x', 'fake/x', '[]', 'running', 'schedule', '2026-10-07T11:00:00.000Z')`,
  ).run(m.id);

  assert.equal(repairStaleRuns(ctx), 1);
  const runs = listRuns(db);
  const stale = runs.find((r) => r.id === 'stale')!;
  assert.equal(stale.status, 'failed');
  assert.equal(stale.error, 'interrupted by restart');
  assert.ok(stale.finishedAt);
  assert.equal(runs.find((r) => r.id !== 'stale')!.status, 'succeeded', 'finished runs are untouched');
  assert.equal(repairStaleRuns(ctx), 0);
});
