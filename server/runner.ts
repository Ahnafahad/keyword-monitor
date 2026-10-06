// Executes a monitor: one independent run per selected platform, then reschedules and rewrites exports.
import { randomUUID } from 'node:crypto';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ApifyAuthError, ApifyError, ApifyThrottledError, apifyToken } from './apify.ts';
import { getMonitorRow, listMonitorRows, resultLines, runLines, type DB, type MonitorRow } from './db.ts';
import { ingest } from './ingest.ts';
import { acceptMatch } from './match.ts';
import type { Provider } from './providers/types.ts';
import type { Platform, Run } from './types.ts';

export interface Ctx {
  db: DB;
  providers: Record<Platform, Provider>;
  now: () => Date;
  /** Where data/export/* is written; null disables file exports (tests). */
  dataDir: string | null;
  /** `monitorId:platform` keys currently executing. */
  running: Set<string>;
  maxItemsPerKeyword: number;
  retryDelayMs: number;
  log: (line: string) => void;
}

export function createCtx(o: Pick<Ctx, 'db' | 'providers'> & Partial<Ctx>): Ctx {
  return {
    now: () => new Date(),
    dataDir: null,
    running: new Set(),
    maxItemsPerKeyword: Math.max(1, Math.floor(Number(process.env.MAX_ITEMS_PER_KEYWORD)) || 10),
    retryDelayMs: 5000,
    log: console.log,
    ...o,
  };
}

const OVERLAP_MS = 3600e3;

export const isRunning = (ctx: Ctx, monitorId: string) => [...ctx.running].some((k) => k.startsWith(`${monitorId}:`));

/** Short, single-line, token-free error text safe to store, export and show. */
export function errorSummary(e: unknown): string {
  let msg = (e instanceof Error ? e.message : String(e)).split('\n')[0].trim() || 'Unknown error';
  const token = apifyToken();
  if (token) msg = msg.replaceAll(token, '[redacted]');
  return msg.slice(0, 300);
}

// Network errors, 5xx, and failed/timed-out actor runs. Auth, throttle, other 4xx and code bugs are not retried.
const isTransient = (e: unknown) =>
  e instanceof ApifyError &&
  !(e instanceof ApifyAuthError) &&
  !(e instanceof ApifyThrottledError) &&
  (e.status === 0 || e.status >= 500);

/**
 * Starts every selected platform that is not already running. Claims the overlap guard synchronously,
 * so `started` is known immediately; `done` settles (never rejects) when all platform runs have finished.
 */
export function runMonitor(ctx: Ctx, monitorId: string, trigger: Run['trigger']): { started: boolean; done: Promise<void> } {
  const monitor = getMonitorRow(ctx.db, monitorId);
  const platforms = (monitor?.platforms ?? []).filter((p) => !ctx.running.has(`${monitorId}:${p}`));
  if (!monitor || !platforms.length) return { started: false, done: Promise.resolve() };
  for (const p of platforms) ctx.running.add(`${monitorId}:${p}`);
  const startedAt = ctx.now();
  const done = Promise.all(
    platforms.map((p) =>
      runPlatform(ctx, monitor, p, trigger, startedAt)
        .catch((e) => (ctx.log(`[run] ${monitor.name}/${p} crashed: ${errorSummary(e)}`), null))
        .finally(() => ctx.running.delete(`${monitorId}:${p}`)),
    ),
  )
    .then((retryAfters) => finish(ctx, monitorId, startedAt, retryAfters))
    .catch((e) => ctx.log(`[run] ${monitor.name} finalize failed: ${errorSummary(e)}`));
  return { started: true, done };
}

/** Returns the retry-after instant when throttled, else null. Provider/ingest failures are recorded, not thrown. */
async function runPlatform(ctx: Ctx, monitor: MonitorRow, platform: Platform, trigger: Run['trigger'], startedAt: Date): Promise<string | null> {
  const { db } = ctx;
  const provider = ctx.providers[platform];
  const runId = randomUUID();
  const lastOk = (
    db.prepare("SELECT max(started_at) AS v FROM runs WHERE monitor_id = ? AND platform = ? AND status = 'succeeded'").get(monitor.id, platform) as any
  ).v as string | null;
  const since = lastOk
    ? new Date(Date.parse(lastOk) - OVERLAP_MS)
    : new Date(startedAt.getTime() - monitor.lookbackDays * 864e5);
  db.prepare(
    `INSERT INTO runs (id, monitor_id, monitor_name, platform, actor_id, queries, status, trigger, started_at)
     VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?)`,
  ).run(runId, monitor.id, monitor.name, platform, provider.actorId, JSON.stringify(monitor.keywords), trigger, startedAt.toISOString());
  ctx.log(`[run] start  "${monitor.name}" ${platform} (${trigger}) since ${since.toISOString()}`);

  const query = { keywords: monitor.keywords, since, maxItemsPerKeyword: ctx.maxItemsPerKeyword, excludeSocialWeb: monitor.excludeSocialWeb };
  let status: Run['status'] = 'succeeded';
  let error: string | null = null;
  let retryAfter: string | null = null;
  let detail = '';
  try {
    const res = await provider.search(query).catch(async (e) => {
      if (!isTransient(e)) throw e;
      ctx.log(`[run] retry  "${monitor.name}" ${platform}: ${errorSummary(e)}`);
      await new Promise((r) => setTimeout(r, ctx.retryDelayMs));
      return provider.search(query);
    });
    const fetched = res.items ?? [];
    const accepted = fetched.map((item) => acceptMatch(item, monitor.matchMode)).filter((item) => item !== null);
    const c = ingest(db, monitor.id, accepted, ctx.now().toISOString());
    db.prepare(
      `UPDATE runs SET queries = ?, apify_run_ids = ?, dataset_ids = ?, fetched = ?, new_count = ?, updated_count = ?, duplicate_count = ? WHERE id = ?`,
    ).run(
      JSON.stringify(res.queries ?? monitor.keywords), JSON.stringify(res.apifyRunIds ?? []), JSON.stringify(res.datasetIds ?? []),
      fetched.length, c.newCount, c.updatedCount, c.duplicateCount, runId,
    );
    detail = ` fetched=${fetched.length} accepted=${accepted.length} new=${c.newCount} updated=${c.updatedCount} dup=${c.duplicateCount}`;
  } catch (e) {
    error = errorSummary(e);
    status = 'failed';
    if (e instanceof ApifyThrottledError) {
      status = 'throttled';
      const secs = Number.isFinite(e.retryAfterSecs) && e.retryAfterSecs > 0 ? e.retryAfterSecs : 60;
      retryAfter = new Date(ctx.now().getTime() + secs * 1000).toISOString();
    }
    detail = ` error="${error}"${retryAfter ? ` retryAfter=${retryAfter}` : ''}`;
  }
  db.prepare('UPDATE runs SET status = ?, finished_at = ?, error = ?, retry_after = ? WHERE id = ?').run(
    status, ctx.now().toISOString(), error, retryAfter, runId,
  );
  ctx.log(`[run] finish "${monitor.name}" ${platform} ${status}${detail}`);
  return retryAfter;
}

function finish(ctx: Ctx, monitorId: string, startedAt: Date, retryAfters: Array<string | null>) {
  const monitor = getMonitorRow(ctx.db, monitorId); // re-read: it may have been paused, edited or deleted meanwhile
  if (monitor) {
    // Never schedule before a throttled platform's retry-after.
    const candidates = [new Date(ctx.now().getTime() + monitor.frequencyMinutes * 60e3).toISOString(), ...retryAfters.filter((r) => r !== null)];
    const next = monitor.status === 'active' ? candidates.sort().at(-1)! : null;
    ctx.db.prepare('UPDATE monitors SET last_run_at = ?, next_run_at = ? WHERE id = ?').run(startedAt.toISOString(), next, monitorId);
  }
  if (ctx.dataDir) {
    try {
      writeExports(ctx.db, ctx.dataDir);
    } catch (e) {
      ctx.log(`[export] failed: ${errorSummary(e)}`);
    }
  }
}

export const monitorsJson = (db: DB) => JSON.stringify(listMonitorRows(db), null, 2) + '\n';

/** Agent-readable snapshots, rewritten whole (temp file + rename) so readers never see a partial file. */
// ponytail: full rewrite per run, O(corpus). Switch to append/incremental if the corpus reaches ~100k results.
export function writeExports(db: DB, dataDir: string) {
  const dir = join(dataDir, 'export');
  mkdirSync(dir, { recursive: true });
  const files: Record<string, string> = {
    'results.jsonl': [...resultLines(db)].join(''),
    'monitors.json': monitorsJson(db),
    'runs.jsonl': [...runLines(db)].join(''),
  };
  for (const [name, body] of Object.entries(files)) {
    const tmp = join(dir, `.${name}.tmp`);
    writeFileSync(tmp, body);
    renameSync(tmp, join(dir, name));
  }
}
