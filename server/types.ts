// Shared contract: the API returns exactly these shapes; web/ imports this file for types.

export type Platform = 'linkedin' | 'x' | 'web';
export const PLATFORMS: Platform[] = ['linkedin', 'x', 'web'];

export type RunStatus = 'running' | 'succeeded' | 'failed' | 'throttled';
export type MatchMode = 'anywhere' | 'nearby';
export type ContentType = 'jobs' | 'people' | 'news' | 'courses' | 'other';
export const CONTENT_TYPES: ContentType[] = ['jobs', 'people', 'news', 'courses', 'other'];

export interface Author {
  name: string | null;
  handle: string | null;
  profileUrl: string | null;
}

/** What a provider adapter returns per item, before dedupe/persistence. */
export interface NormalizedItem {
  platform: Platform;
  /** Source-native id (post URN, tweet id). null when the source has none (most web pages). */
  sourceId: string | null;
  url: string;
  author: Author;
  title: string | null;
  content: string;
  publishedAt: string | null; // ISO
  /** The monitor keywords whose query surfaced this item. */
  matchedKeywords: string[];
  /** Whether the keyword words were found in the stored title/content. */
  matchVerified?: boolean;
  contentType?: ContentType;
  socialWeb?: boolean;
  /** Useful source extras: engagement counts, domain, headline, language... JSON-safe. */
  metadata: Record<string, unknown>;
  /** Untouched provider payload, preserved for reprocessing. */
  raw: unknown;
}

/** Canonical stored result. */
export interface Result extends Omit<NormalizedItem, 'raw'> {
  id: string; // stable: derived from dedupeKey
  dedupeKey: string; // `${platform}:id:${sourceId}` | `${platform}:url:${canonicalUrl}` | `${platform}:fp:${hash}`
  discoveredAt: string;
  lastSeenAt: string;
  monitorIds: string[];
  rawRef: string | null; // GET /api/results/:id/raw
  matchVerified: boolean;
  contentType: ContentType;
  socialWeb: boolean;
}

export interface Monitor {
  id: string;
  name: string;
  keywords: string[];
  platforms: Platform[];
  lookbackDays: number;
  frequencyMinutes: number; // min 15
  matchMode: MatchMode;
  contentTypes: ContentType[];
  excludeSocialWeb: boolean;
  status: 'active' | 'paused';
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
  nextRunAt: string | null; // null when paused
  // derived, read-only:
  running: boolean;
  lastRunStatus: RunStatus | null;
  resultCount: number;
  newCount24h: number;
}

export type MonitorInput = Pick<Monitor, 'name' | 'keywords' | 'platforms' | 'lookbackDays' | 'frequencyMinutes'> & {
  matchMode?: MatchMode;
  contentTypes?: ContentType[];
  excludeSocialWeb?: boolean;
  status?: Monitor['status'];
};

/** One row per monitor x platform execution. */
export interface Run {
  id: string;
  monitorId: string;
  monitorName: string;
  platform: Platform;
  actorId: string;
  queries: string[];
  status: RunStatus;
  trigger: 'schedule' | 'manual';
  startedAt: string;
  finishedAt: string | null;
  apifyRunIds: string[];
  datasetIds: string[];
  fetched: number;
  newCount: number;
  updatedCount: number; // already stored, but gained a keyword/monitor
  duplicateCount: number; // already stored, nothing new
  error: string | null;
  retryAfter: string | null; // ISO, when throttled
}

export interface Stats {
  activeMonitors: number;
  totalMonitors: number;
  totalResults: number;
  newResults24h: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  byPlatform: Record<Platform, number>;
  /** Daily discoveries (by discoveredAt), oldest first, last 14 days, zero-filled. */
  series: Array<{ date: string } & Record<Platform, number> & { total: number }>;
}

export interface SystemInfo {
  apify: { configured: boolean; ok: boolean; username: string | null; error: string | null };
  providers: Record<Platform, { actorId: string; label: string }>;
  maxItemsPerKeyword: number;
  dataDir: string;
  version: string;
}

export interface ResultsQuery {
  q?: string;
  platform?: Platform;
  contentType?: ContentType;
  monitorId?: string;
  keyword?: string;
  from?: string; // ISO date, inclusive, compared against coalesce(publishedAt, discoveredAt)
  to?: string;
  sort?: 'newest' | 'oldest';
  limit?: number; // default 50, max 200
  offset?: number;
}

/*
HTTP API (all JSON, prefix /api):
  GET    /system                    -> SystemInfo
  GET    /stats                     -> Stats
  GET    /monitors                  -> Monitor[]
  POST   /monitors        MonitorInput -> Monitor   (first run is scheduled immediately)
  PATCH  /monitors/:id    Partial<MonitorInput> -> Monitor   (pause/resume = {status})
  DELETE /monitors/:id              -> 204 (results stay; association removed)
  POST   /monitors/:id/run          -> 202 {started: boolean}  (false if already running)
  GET    /results?ResultsQuery      -> {items: Result[], total: number}
  GET    /results/:id/raw           -> raw provider payload(s)
  GET    /runs?monitorId&limit      -> Run[] newest first
  GET    /export/results.jsonl | /export/monitors.json | /export/runs.jsonl
Errors: {error: string} with 4xx/5xx.
*/
