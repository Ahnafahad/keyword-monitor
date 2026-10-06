// Minimal Apify REST client. The token is read here and never leaves the server.

const BASE = 'https://api.apify.com/v2';

export class ApifyError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.status = status;
  }
}
export class ApifyAuthError extends ApifyError {}
export class ApifyThrottledError extends ApifyError {
  retryAfterSecs: number;
  constructor(message: string, retryAfterSecs: number) {
    super(message, 429);
    this.retryAfterSecs = retryAfterSecs;
  }
}

export function apifyToken(): string | null {
  return process.env.APIFY_API_TOKEN?.trim() || null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call<T>(method: string, path: string, body?: unknown, retries = 2): Promise<T> {
  const token = apifyToken();
  if (!token) throw new ApifyAuthError('APIFY_API_TOKEN is not set', 401);
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(BASE + path, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      if (attempt < retries && method === 'GET') {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      throw new ApifyError(`Network error calling Apify: ${(e as Error).message}`);
    }
    if (res.ok) return (await res.json()) as T;
    const text = await res.text();
    let message = text.slice(0, 300);
    try {
      message = JSON.parse(text).error?.message ?? message;
    } catch {}
    if (res.status === 401 || res.status === 403) throw new ApifyAuthError(message, res.status);
    // POST (run start) is only retried on 429, where nothing was started.
    const retryable = res.status === 429 || (res.status >= 500 && method === 'GET');
    if (retryable && attempt < retries) {
      await sleep(Number(res.headers.get('retry-after') ?? 0) * 1000 || 1500 * 2 ** attempt);
      continue;
    }
    if (res.status === 429) throw new ApifyThrottledError(message, Number(res.headers.get('retry-after') ?? 60));
    // Out of credit / usage limit: treat as throttled for a long while rather than hammering.
    if (res.status === 402) throw new ApifyThrottledError(message, 3600);
    throw new ApifyError(message, res.status);
  }
}

export async function checkConnection(): Promise<{ username: string }> {
  const { data } = await call<{ data: { username: string } }>('GET', '/users/me');
  return { username: data.username };
}

export interface ActorRun<T = any> {
  runId: string;
  datasetId: string;
  items: T[];
}

/**
 * Run an actor to completion and return its dataset items.
 * maxItems caps both the paid result count (pay-per-result actors) and the items fetched.
 */
export async function runActor<T = any>(
  actorId: string,
  input: unknown,
  opts: { maxItems?: number; timeoutSecs?: number } = {},
): Promise<ActorRun<T>> {
  const timeoutSecs = opts.timeoutSecs ?? 240;
  const qs = new URLSearchParams({ waitForFinish: '60', timeout: String(timeoutSecs) });
  if (opts.maxItems) qs.set('maxItems', String(opts.maxItems));
  type RunData = { data: { id: string; status: string; defaultDatasetId: string; statusMessage?: string } };
  let { data: run } = await call<RunData>('POST', `/acts/${actorId.replace('/', '~')}/runs?${qs}`, input);
  const deadline = Date.now() + (timeoutSecs + 60) * 1000;
  while (run.status === 'READY' || run.status === 'RUNNING') {
    if (Date.now() > deadline) throw new ApifyError(`Actor run ${run.id} did not finish in time`, 409);
    ({ data: run } = await call<RunData>('GET', `/actor-runs/${run.id}?waitForFinish=60`));
  }
  // 409: the run itself failed. Not retried by the runner, since a retry is a second paid run.
  if (run.status !== 'SUCCEEDED') {
    throw new ApifyError(`Actor run ${run.id} ${run.status}${run.statusMessage ? `: ${run.statusMessage}` : ''}`, 409);
  }
  const limit = opts.maxItems ? `&limit=${opts.maxItems}` : '';
  const items = await call<T[]>('GET', `/datasets/${run.defaultDatasetId}/items?clean=true&format=json${limit}`);
  return { runId: run.id, datasetId: run.defaultDatasetId, items };
}
