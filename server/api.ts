// HTTP API. The contract (routes + shapes) is the comment at the bottom of types.ts.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import express from 'express';
import { apifyToken, checkConnection } from './apify.ts';
import { getMonitorRow, getRaw, getStats, insertMonitor, listMonitorRows, listResults, listRuns, resultLines, runLines, toMonitor } from './db.ts';
import { errorSummary, isRunning, monitorsJson, runMonitor, type Ctx } from './runner.ts';
import { tick } from './scheduler.ts';
import { CONTENT_TYPES, PLATFORMS, type MonitorInput, type Platform, type ResultsQuery, type SystemInfo } from './types.ts';

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
const bad = (message: string) => new HttpError(400, message);

const VERSION: string = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

function intInRange(v: unknown, name: string, min: number, max: number, hint = ''): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
    throw bad(`${name} must be a whole number between ${min} and ${max}${hint}`);
  }
  return v;
}

function parseMonitor(body: any): Required<MonitorInput> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad('Request body must be a JSON object');
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) throw bad('name is required');
  if (name.length > 200) throw bad('name must be at most 200 characters');

  if (!Array.isArray(body.keywords) || body.keywords.some((k: unknown) => typeof k !== 'string')) {
    throw bad('keywords must be an array of strings');
  }
  const keywords: string[] = [];
  for (const k of body.keywords.map((k: string) => k.trim().replace(/\s+/g, ' '))) {
    if (k && !keywords.some((x) => x.toLowerCase() === k.toLowerCase())) keywords.push(k);
  }
  if (keywords.length < 1 || keywords.length > 25) throw bad('keywords must contain between 1 and 25 distinct entries');
  if (keywords.some((k) => k.length > 200)) throw bad('each keyword must be at most 200 characters');

  if (!Array.isArray(body.platforms) || body.platforms.some((p: any) => !PLATFORMS.includes(p))) {
    throw bad(`platforms must be an array of: ${PLATFORMS.join(', ')}`);
  }
  const platforms = PLATFORMS.filter((p) => body.platforms.includes(p));
  if (!platforms.length) throw bad('Select at least one platform');

  const status = body.status ?? 'active';
  if (status !== 'active' && status !== 'paused') throw bad('status must be "active" or "paused"');
  const matchMode = body.matchMode ?? 'anywhere';
  if (matchMode !== 'anywhere' && matchMode !== 'nearby') throw bad('matchMode must be "anywhere" or "nearby"');
  const contentTypes = body.contentTypes ?? CONTENT_TYPES;
  if (!Array.isArray(contentTypes) || !contentTypes.length || contentTypes.some((type: unknown) => !CONTENT_TYPES.includes(type as any))) {
    throw bad(`contentTypes must contain one or more of: ${CONTENT_TYPES.join(', ')}`);
  }
  const excludeSocialWeb = body.excludeSocialWeb ?? false;
  if (typeof excludeSocialWeb !== 'boolean') throw bad('excludeSocialWeb must be true or false');
  return {
    name,
    keywords,
    platforms,
    lookbackDays: intInRange(body.lookbackDays, 'lookbackDays', 1, 90),
    frequencyMinutes: intInRange(body.frequencyMinutes, 'frequencyMinutes', 15, 10080, ' (minimum 15 minutes, to keep Apify usage sensible)'),
    matchMode,
    contentTypes: CONTENT_TYPES.filter((type) => contentTypes.includes(type)),
    excludeSocialWeb,
    status,
  };
}

function parseResultsQuery(query: Record<string, unknown>): ResultsQuery {
  const s = (k: string) => (typeof query[k] === 'string' && (query[k] as string).trim() ? (query[k] as string).trim() : undefined);
  const int = (k: string, min: number, max: number) => {
    const v = s(k);
    if (v === undefined) return undefined;
    if (!/^\d+$/.test(v)) throw bad(`${k} must be a non-negative integer`);
    return Math.min(max, Math.max(min, Number(v)));
  };
  // Date-only values mean the whole local day, so `to` stays inclusive.
  const instant = (k: string, endOfDay: boolean) => {
    const v = s(k);
    if (v === undefined) return undefined;
    const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`) : new Date(v);
    if (Number.isNaN(d.getTime())) throw bad(`${k} must be an ISO date`);
    return d.toISOString();
  };
  const platform = s('platform');
  if (platform && !PLATFORMS.includes(platform as Platform)) throw bad(`platform must be one of: ${PLATFORMS.join(', ')}`);
  const contentType = s('contentType');
  if (contentType && !CONTENT_TYPES.includes(contentType as any)) throw bad(`contentType must be one of: ${CONTENT_TYPES.join(', ')}`);
  const sort = s('sort');
  if (sort && sort !== 'newest' && sort !== 'oldest') throw bad('sort must be "newest" or "oldest"');
  return {
    q: s('q'),
    platform: platform as Platform | undefined,
    contentType: contentType as ResultsQuery['contentType'],
    monitorId: s('monitorId'),
    keyword: s('keyword'),
    from: instant('from', false),
    to: instant('to', true),
    sort: sort as ResultsQuery['sort'],
    limit: int('limit', 1, 200),
    offset: int('offset', 0, Number.MAX_SAFE_INTEGER),
  };
}

export function createApp(ctx: Ctx, opts: { staticDir?: string } = {}): express.Express {
  const { db } = ctx;
  const app = express();
  app.disable('x-powered-by');
  const api = express.Router();
  api.use(express.json({ limit: '100kb' }));

  const monitorOr404 = (id: string) => {
    const row = getMonitorRow(db, id);
    if (!row) throw new HttpError(404, 'Monitor not found');
    return row;
  };
  const present = (id: string) => toMonitor(db, monitorOr404(id), ctx.now(), isRunning(ctx, id));

  let apifyCache: { at: number; value: SystemInfo['apify'] } | null = null;
  async function apifyStatus(): Promise<SystemInfo['apify']> {
    if (!apifyToken()) return { configured: false, ok: false, username: null, error: 'APIFY_API_TOKEN is not set' };
    if (apifyCache && Date.now() - apifyCache.at < 60_000) return apifyCache.value;
    let value: SystemInfo['apify'];
    try {
      value = { configured: true, ok: true, username: (await checkConnection()).username, error: null };
    } catch (e) {
      value = { configured: true, ok: false, username: null, error: errorSummary(e) };
    }
    apifyCache = { at: Date.now(), value };
    return value;
  }

  api.get('/system', async (_req, res) => {
    const providers = Object.fromEntries(
      PLATFORMS.map((p) => [p, { actorId: ctx.providers[p].actorId, label: ctx.providers[p].label }]),
    ) as SystemInfo['providers'];
    const info: SystemInfo = { apify: await apifyStatus(), providers, maxItemsPerKeyword: ctx.maxItemsPerKeyword, dataDir: ctx.dataDir ? resolve(ctx.dataDir) : '', version: VERSION };
    res.json(info);
  });

  api.get('/stats', (_req, res) => {
    res.json(getStats(db, ctx.now()));
  });

  api.get('/monitors', (_req, res) => {
    const now = ctx.now();
    res.json(listMonitorRows(db).map((m) => toMonitor(db, m, now, isRunning(ctx, m.id))));
  });

  api.post('/monitors', (req, res) => {
    const row = insertMonitor(db, parseMonitor(req.body), ctx.now());
    tick(ctx); // an active monitor is due right now; start it without waiting for the next scheduler tick
    res.status(201).json(present(row.id));
  });

  api.patch('/monitors/:id', (req, res) => {
    const cur = monitorOr404(req.params.id);
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) throw bad('Request body must be a JSON object');
    const next = parseMonitor({ ...cur, ...req.body });
    const now = ctx.now();
    const afterInterval = new Date(now.getTime() + next.frequencyMinutes * 60e3).toISOString();
    let nextRunAt = cur.nextRunAt;
    if (next.status === 'paused') nextRunAt = null;
    else if (cur.status === 'paused') nextRunAt = cur.lastRunAt ? afterInterval : now.toISOString();
    else if (next.frequencyMinutes !== cur.frequencyMinutes) nextRunAt = afterInterval;
    db.prepare(
      `UPDATE monitors SET name = ?, keywords = ?, platforms = ?, lookback_days = ?, frequency_minutes = ?, match_mode = ?, content_types = ?, exclude_social_web = ?, status = ?, updated_at = ?, next_run_at = ?
       WHERE id = ?`,
    ).run(
      next.name, JSON.stringify(next.keywords), JSON.stringify(next.platforms), next.lookbackDays, next.frequencyMinutes,
      next.matchMode, JSON.stringify(next.contentTypes), Number(next.excludeSocialWeb), next.status, now.toISOString(), nextRunAt, cur.id,
    );
    tick(ctx);
    res.json(present(cur.id));
  });

  api.delete('/monitors/:id', (req, res) => {
    const { id } = monitorOr404(req.params.id);
    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM result_monitors WHERE monitor_id = ?').run(id); // results and run history stay
      db.prepare('DELETE FROM monitors WHERE id = ?').run(id);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    res.status(204).end();
  });

  api.post('/monitors/:id/run', (req, res) => {
    const { id } = monitorOr404(req.params.id);
    res.status(202).json({ started: runMonitor(ctx, id, 'manual').started });
  });

  api.get('/results', (req, res) => {
    res.json(listResults(db, parseResultsQuery(req.query)));
  });

  api.get('/results/:id/raw', (req, res) => {
    const raw = getRaw(db, req.params.id);
    if (!raw) throw new HttpError(404, 'No raw payload stored for this result');
    res.json(raw);
  });

  api.get('/runs', (req, res) => {
    const { monitorId, limit } = req.query;
    if (limit !== undefined && !/^\d+$/.test(String(limit))) throw bad('limit must be a non-negative integer');
    res.json(
      listRuns(db, {
        monitorId: typeof monitorId === 'string' && monitorId ? monitorId : undefined,
        limit: limit === undefined ? 50 : Math.min(500, Math.max(1, Number(limit))),
      }),
    );
  });

  // Same content as data/export/*, straight from the DB.
  const stream = (type: string, lines: () => Iterable<string>) => (_req: express.Request, res: express.Response) => {
    res.type(type);
    for (const line of lines()) res.write(line);
    res.end();
  };
  api.get('/export/results.jsonl', stream('application/x-ndjson', () => resultLines(db)));
  api.get('/export/runs.jsonl', stream('application/x-ndjson', () => runLines(db)));
  api.get('/export/monitors.json', stream('application/json', () => [monitorsJson(db)]));

  api.use((_req, _res) => {
    throw new HttpError(404, 'Not found');
  });
  api.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    // HttpError and body-parser errors (bad JSON, too large) carry a 4xx status and a safe message.
    const status = Number.isInteger(err?.status) && err.status >= 400 && err.status < 500 ? err.status : 500;
    if (status === 500) ctx.log(`[api] ${errorSummary(err)}`);
    if (res.headersSent) return res.end();
    res.status(status).json({ error: status === 500 ? 'Internal server error' : errorSummary(err) });
  });
  app.use('/api', api);

  // Built web app, when present, with SPA fallback.
  const dir = opts.staticDir;
  if (dir && existsSync(join(dir, 'index.html'))) {
    app.use(express.static(dir));
    app.use((req, res, next) => (req.method === 'GET' ? res.sendFile(join(dir, 'index.html')) : next()));
  }
  return app;
}
