import type { Monitor, MonitorInput, Result, ResultsQuery, Run, Stats, SystemInfo } from '../../server/types.ts';

export type { ContentType, MatchMode, Monitor, MonitorInput, Platform, Result, ResultsQuery, Run, RunStatus, Stats, SystemInfo } from '../../server/types.ts';

const OFFLINE = 'The local service is not reachable. Make sure it is running, then retry.';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** A message that is always safe to show in the UI (never a stack trace). */
export function errMsg(e: unknown): string {
  return e instanceof ApiError ? e.message : 'Something went wrong. Please retry.';
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch('/api' + path, {
      ...init,
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    });
  } catch {
    throw new ApiError(OFFLINE, 0);
  }
  if (res.status === 204) return undefined as T;
  const body: unknown = await res.json().catch(() => undefined);
  if (!res.ok) {
    const error = (body as { error?: unknown } | undefined)?.error;
    // No JSON {error} on a 5xx means the dev proxy could not reach the backend.
    if (typeof error !== 'string') throw new ApiError(res.status >= 500 ? OFFLINE : `Request failed (${res.status}).`, res.status);
    throw new ApiError(error.split('\n')[0].slice(0, 300), res.status);
  }
  if (body === undefined) throw new ApiError(OFFLINE, res.status);
  return body as T;
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

function qs(params: object): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const api = {
  system: () => req<SystemInfo>('/system'),
  stats: () => req<Stats>('/stats'),
  monitors: () => req<Monitor[]>('/monitors'),
  createMonitor: (input: MonitorInput) => req<Monitor>('/monitors', json('POST', input)),
  updateMonitor: (id: string, patch: Partial<MonitorInput>) =>
    req<Monitor>(`/monitors/${encodeURIComponent(id)}`, json('PATCH', patch)),
  deleteMonitor: (id: string) => req<void>(`/monitors/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  runMonitor: (id: string) => req<{ started: boolean }>(`/monitors/${encodeURIComponent(id)}/run`, { method: 'POST' }),
  results: (query: ResultsQuery) => req<{ items: Result[]; total: number }>(`/results${qs(query)}`),
  runs: (query: { monitorId?: string; limit?: number }) => req<Run[]>(`/runs${qs(query)}`),
};
