// SQLite storage: schema, row <-> contract mappers, and the read queries shared by the API and exports.
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Monitor, MonitorInput, Platform, Result, ResultsQuery, Run, RunStatus, Stats } from './types.ts';

export type DB = DatabaseSync;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS monitors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  keywords TEXT NOT NULL,            -- JSON string[]
  platforms TEXT NOT NULL,           -- JSON Platform[]
  lookback_days INTEGER NOT NULL,
  frequency_minutes INTEGER NOT NULL,
  match_mode TEXT NOT NULL DEFAULT 'anywhere',
  content_types TEXT NOT NULL DEFAULT '["jobs","people","news","courses","other"]',
  exclude_social_web INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,              -- active | paused
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_run_at TEXT,
  next_run_at TEXT                   -- null when paused
);
CREATE TABLE IF NOT EXISTS results (
  id TEXT PRIMARY KEY,               -- first 16 hex of sha256(dedupe_key)
  dedupe_key TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL,
  source_id TEXT,
  url TEXT NOT NULL,
  author TEXT NOT NULL,              -- JSON {name, handle, profileUrl}
  title TEXT,
  content TEXT NOT NULL,
  published_at TEXT,                 -- ISO UTC or null
  discovered_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  matched_keywords TEXT NOT NULL,    -- JSON string[]
  match_verified INTEGER NOT NULL DEFAULT 1,
  content_type TEXT NOT NULL DEFAULT 'other',
  social_web INTEGER NOT NULL DEFAULT 0,
  metadata TEXT NOT NULL             -- JSON object
);
CREATE INDEX IF NOT EXISTS results_sort ON results (coalesce(published_at, discovered_at));
CREATE INDEX IF NOT EXISTS results_platform ON results (platform);
CREATE INDEX IF NOT EXISTS results_discovered ON results (discovered_at);
CREATE TABLE IF NOT EXISTS result_monitors (
  result_id TEXT NOT NULL REFERENCES results(id) ON DELETE CASCADE,
  monitor_id TEXT NOT NULL,
  PRIMARY KEY (result_id, monitor_id)
);
CREATE INDEX IF NOT EXISTS result_monitors_monitor ON result_monitors (monitor_id);
CREATE TABLE IF NOT EXISTS raw_payloads (  -- latest provider payload per result
  result_id TEXT PRIMARY KEY REFERENCES results(id) ON DELETE CASCADE,
  fetched_at TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (          -- one row per monitor x platform execution
  id TEXT PRIMARY KEY,
  monitor_id TEXT NOT NULL,
  monitor_name TEXT NOT NULL,              -- kept so history survives monitor deletion
  platform TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  queries TEXT NOT NULL,
  status TEXT NOT NULL,                    -- running | succeeded | failed | throttled
  trigger TEXT NOT NULL,                   -- schedule | manual
  started_at TEXT NOT NULL,
  finished_at TEXT,
  apify_run_ids TEXT NOT NULL DEFAULT '[]',
  dataset_ids TEXT NOT NULL DEFAULT '[]',
  fetched INTEGER NOT NULL DEFAULT 0,
  new_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  retry_after TEXT
);
CREATE INDEX IF NOT EXISTS runs_monitor ON runs (monitor_id, platform, started_at);
CREATE INDEX IF NOT EXISTS runs_started ON runs (started_at);
`;

export function openDb(path = ':memory:'): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  const columns = (table: string) => new Set((db.prepare(`PRAGMA table_info(${table})`).all() as any[]).map((r) => r.name));
  if (!columns('monitors').has('match_mode')) db.exec("ALTER TABLE monitors ADD COLUMN match_mode TEXT NOT NULL DEFAULT 'anywhere'");
  if (!columns('monitors').has('content_types')) db.exec(`ALTER TABLE monitors ADD COLUMN content_types TEXT NOT NULL DEFAULT '["jobs","people","news","courses","other"]'`);
  if (!columns('monitors').has('exclude_social_web')) db.exec('ALTER TABLE monitors ADD COLUMN exclude_social_web INTEGER NOT NULL DEFAULT 0');
  if (!columns('results').has('match_verified')) db.exec('ALTER TABLE results ADD COLUMN match_verified INTEGER NOT NULL DEFAULT 1');
  if (!columns('results').has('content_type')) db.exec("ALTER TABLE results ADD COLUMN content_type TEXT NOT NULL DEFAULT 'other'");
  if (!columns('results').has('social_web')) db.exec('ALTER TABLE results ADD COLUMN social_web INTEGER NOT NULL DEFAULT 0');
  return db;
}

// ---------- monitors ----------

/** The stored (non-derived) part of a Monitor. This is also what monitors.json exports. */
export type MonitorRow = Omit<Monitor, 'running' | 'lastRunStatus' | 'resultCount' | 'newCount24h'>;

function toMonitorRow(r: any): MonitorRow {
  return {
    id: r.id,
    name: r.name,
    keywords: JSON.parse(r.keywords),
    platforms: JSON.parse(r.platforms),
    lookbackDays: r.lookback_days,
    frequencyMinutes: r.frequency_minutes,
    matchMode: r.match_mode,
    contentTypes: JSON.parse(r.content_types),
    excludeSocialWeb: !!r.exclude_social_web,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    lastRunAt: r.last_run_at,
    nextRunAt: r.next_run_at,
  };
}

export function getMonitorRow(db: DB, id: string): MonitorRow | null {
  const r = db.prepare('SELECT * FROM monitors WHERE id = ?').get(id);
  return r ? toMonitorRow(r) : null;
}

export function listMonitorRows(db: DB): MonitorRow[] {
  return db.prepare('SELECT * FROM monitors ORDER BY created_at, id').all().map(toMonitorRow);
}

/** Active monitors start immediately (next_run_at = now); paused ones have no next run. */
export function insertMonitor(db: DB, input: MonitorInput, now: Date): MonitorRow {
  const id = randomUUID();
  const iso = now.toISOString();
  const status = input.status ?? 'active';
  db.prepare(
    `INSERT INTO monitors (id, name, keywords, platforms, lookback_days, frequency_minutes, match_mode, content_types, exclude_social_web, status, created_at, updated_at, next_run_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id, input.name, JSON.stringify(input.keywords), JSON.stringify(input.platforms),
    input.lookbackDays, input.frequencyMinutes, input.matchMode ?? 'anywhere', JSON.stringify(input.contentTypes ?? ['jobs', 'people', 'news', 'courses', 'other']), Number(input.excludeSocialWeb ?? false), status, iso, iso, status === 'active' ? iso : null,
  );
  return getMonitorRow(db, id)!;
}

/** Adds the derived read-only fields. A few small queries per monitor; fine at local single-user scale. */
export function toMonitor(db: DB, row: MonitorRow, now: Date, running: boolean): Monitor {
  // All platform runs of one monitor execution share started_at; summarize that latest batch.
  const statuses = db
    .prepare('SELECT status FROM runs WHERE monitor_id = ?1 AND started_at = (SELECT max(started_at) FROM runs WHERE monitor_id = ?1)')
    .all(row.id)
    .map((r: any) => r.status as RunStatus);
  const lastRunStatus =
    (['running', 'failed', 'throttled', 'succeeded'] as RunStatus[]).find((s) => statuses.includes(s)) ?? null;
  const counts: any = db
    .prepare(
      `SELECT count(*) AS total, coalesce(sum(r.discovered_at >= ?), 0) AS fresh
       FROM result_monitors rm JOIN results r ON r.id = rm.result_id
       WHERE rm.monitor_id = ? AND EXISTS (SELECT 1 FROM json_each(?) ct WHERE ct.value = r.content_type)
         AND (? = 0 OR r.platform != 'web' OR r.social_web = 0)`,
    )
    .get(new Date(now.getTime() - 864e5).toISOString(), row.id, JSON.stringify(row.contentTypes), Number(row.excludeSocialWeb));
  return { ...row, running, lastRunStatus, resultCount: counts.total, newCount24h: counts.fresh };
}

// ---------- results ----------

const RESULT_SELECT = `SELECT r.*,
  (SELECT json_group_array(monitor_id) FROM result_monitors WHERE result_id = r.id) AS monitor_ids,
  EXISTS (SELECT 1 FROM raw_payloads p WHERE p.result_id = r.id) AS has_raw
  FROM results r`;
const SORT_AT = 'coalesce(r.published_at, r.discovered_at)';
const VISIBLE_RESULT = `(NOT EXISTS (SELECT 1 FROM result_monitors rm WHERE rm.result_id = r.id)
  OR EXISTS (SELECT 1 FROM result_monitors rm JOIN monitors m ON m.id = rm.monitor_id
    JOIN json_each(m.content_types) ct ON ct.value = r.content_type
    WHERE rm.result_id = r.id AND (m.exclude_social_web = 0 OR r.platform != 'web' OR r.social_web = 0)))`;

function toResult(r: any): Result {
  return {
    id: r.id,
    dedupeKey: r.dedupe_key,
    platform: r.platform,
    sourceId: r.source_id,
    url: r.url,
    author: JSON.parse(r.author),
    title: r.title,
    content: r.content,
    publishedAt: r.published_at,
    discoveredAt: r.discovered_at,
    lastSeenAt: r.last_seen_at,
    matchedKeywords: JSON.parse(r.matched_keywords),
    matchVerified: !!r.match_verified,
    contentType: r.content_type,
    socialWeb: !!r.social_web,
    monitorIds: (JSON.parse(r.monitor_ids) as string[]).sort(),
    metadata: JSON.parse(r.metadata),
    rawRef: r.has_raw ? `/api/results/${r.id}/raw` : null,
  };
}

/** `from`/`to` must already be full ISO instants (the API boundary expands date-only values). */
export function listResults(db: DB, q: ResultsQuery): { items: Result[]; total: number } {
  const where: string[] = [VISIBLE_RESULT];
  const args: string[] = [];
  if (q.q) {
    const like = `%${q.q.replace(/[\\%_]/g, '\\$&')}%`;
    where.push(
      `(r.title LIKE ? ESCAPE '\\' OR r.content LIKE ? ESCAPE '\\' OR r.url LIKE ? ESCAPE '\\'
        OR json_extract(r.author, '$.name') LIKE ? ESCAPE '\\' OR json_extract(r.author, '$.handle') LIKE ? ESCAPE '\\')`,
    );
    args.push(like, like, like, like, like);
  }
  if (q.platform) (where.push('r.platform = ?'), args.push(q.platform));
  if (q.contentType) (where.push('r.content_type = ?'), args.push(q.contentType));
  if (q.monitorId) {
    where.push(`EXISTS (SELECT 1 FROM result_monitors rm JOIN monitors m ON m.id = rm.monitor_id
      JOIN json_each(m.content_types) ct ON ct.value = r.content_type
      WHERE rm.result_id = r.id AND rm.monitor_id = ? AND (m.exclude_social_web = 0 OR r.platform != 'web' OR r.social_web = 0))`);
    args.push(q.monitorId);
  }
  if (q.keyword) {
    where.push('EXISTS (SELECT 1 FROM json_each(r.matched_keywords) k WHERE lower(k.value) = lower(?))');
    args.push(q.keyword);
  }
  if (q.from) (where.push(`${SORT_AT} >= ?`), args.push(q.from));
  if (q.to) (where.push(`${SORT_AT} <= ?`), args.push(q.to));
  const cond = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  const dir = q.sort === 'oldest' ? 'ASC' : 'DESC';
  const total = (db.prepare(`SELECT count(*) AS n FROM results r${cond}`).get(...args) as any).n as number;
  const items = db
    .prepare(`${RESULT_SELECT}${cond} ORDER BY ${SORT_AT} ${dir}, r.id LIMIT ? OFFSET ?`)
    .all(...args, q.limit ?? 50, q.offset ?? 0)
    .map(toResult);
  return { items, total };
}

export function getRaw(db: DB, resultId: string): { resultId: string; fetchedAt: string; payload: unknown } | null {
  const r: any = db.prepare('SELECT * FROM raw_payloads WHERE result_id = ?').get(resultId);
  return r ? { resultId, fetchedAt: r.fetched_at, payload: JSON.parse(r.payload) } : null;
}

// ---------- runs ----------

function toRun(r: any): Run {
  return {
    id: r.id,
    monitorId: r.monitor_id,
    monitorName: r.monitor_name,
    platform: r.platform,
    actorId: r.actor_id,
    queries: JSON.parse(r.queries),
    status: r.status,
    trigger: r.trigger,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    apifyRunIds: JSON.parse(r.apify_run_ids),
    datasetIds: JSON.parse(r.dataset_ids),
    fetched: r.fetched,
    newCount: r.new_count,
    updatedCount: r.updated_count,
    duplicateCount: r.duplicate_count,
    error: r.error,
    retryAfter: r.retry_after,
  };
}

/** Newest first. */
export function listRuns(db: DB, opts: { monitorId?: string; limit?: number } = {}): Run[] {
  const cond = opts.monitorId ? ' WHERE monitor_id = ?' : '';
  const args = opts.monitorId ? [opts.monitorId] : [];
  return db
    .prepare(`SELECT * FROM runs${cond} ORDER BY started_at DESC, rowid DESC LIMIT ?`)
    .all(...args, opts.limit ?? 50)
    .map(toRun);
}

// ---------- exports (deterministic order: oldest first, id as tiebreak) ----------

export function* resultLines(db: DB): Generator<string> {
  for (const r of db.prepare(`${RESULT_SELECT} ORDER BY r.discovered_at, r.id`).iterate()) {
    yield JSON.stringify(toResult(r)) + '\n';
  }
}

export function* runLines(db: DB): Generator<string> {
  for (const r of db.prepare('SELECT * FROM runs ORDER BY started_at, rowid').iterate()) {
    yield JSON.stringify(toRun(r)) + '\n';
  }
}

// ---------- stats ----------

const localDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function getStats(db: DB, now: Date): Stats {
  const one = (sql: string, ...args: string[]) => (db.prepare(sql).get(...args) as any).v;
  const byPlatform: Record<Platform, number> = { linkedin: 0, x: 0, web: 0 };
  for (const r of db.prepare(`SELECT platform, count(*) AS n FROM results r WHERE ${VISIBLE_RESULT} GROUP BY platform`).all() as any[]) {
    byPlatform[r.platform as Platform] = r.n;
  }
  const series: Stats['series'] = [];
  const index = new Map<string, Stats['series'][number]>();
  for (let i = 13; i >= 0; i--) {
    const day = { date: localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)), linkedin: 0, x: 0, web: 0, total: 0 };
    series.push(day);
    index.set(day.date, day);
  }
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13).toISOString();
  for (const r of db.prepare(`SELECT platform, discovered_at FROM results r WHERE discovered_at >= ? AND ${VISIBLE_RESULT}`).all(start) as any[]) {
    const day = index.get(localDay(new Date(r.discovered_at)));
    if (!day) continue;
    day[r.platform as Platform]++;
    day.total++;
  }
  return {
    activeMonitors: one("SELECT count(*) AS v FROM monitors WHERE status = 'active'"),
    totalMonitors: one('SELECT count(*) AS v FROM monitors'),
    totalResults: one(`SELECT count(*) AS v FROM results r WHERE ${VISIBLE_RESULT}`),
    newResults24h: one(`SELECT count(*) AS v FROM results r WHERE discovered_at >= ? AND ${VISIBLE_RESULT}`, new Date(now.getTime() - 864e5).toISOString()),
    lastRunAt: one('SELECT max(started_at) AS v FROM runs'),
    nextRunAt: one("SELECT min(next_run_at) AS v FROM monitors WHERE status = 'active'"),
    byPlatform,
    series,
  };
}
