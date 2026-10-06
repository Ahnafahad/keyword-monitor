import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { api, errMsg, type ContentType, type Platform, type Result } from '../api.ts';
import { useData } from '../data.tsx';
import { PLATFORMS, PLATFORM_LABEL, dayBoundary } from '../lib.ts';
import { Empty, ErrorNote, ResultCard, SkelRows } from '../ui.tsx';

const PAGE = 30;
const FILTER_KEYS = ['q', 'platform', 'contentType', 'monitorId', 'keyword', 'from', 'to'];
const CONTENT_TYPES: Array<[ContentType, string]> = [['jobs', 'Jobs'], ['people', 'People'], ['news', 'News'], ['courses', 'Courses'], ['other', 'Other']];

export function Results() {
  const { monitors } = useData();
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(k) ?? '';
  const q = get('q');
  const platform = PLATFORMS.includes(get('platform') as Platform) ? (get('platform') as Platform) : '';
  const contentType = CONTENT_TYPES.some(([type]) => type === get('contentType')) ? (get('contentType') as ContentType) : '';
  const monitorId = get('monitorId');
  const keyword = get('keyword');
  const from = get('from');
  const to = get('to');
  const sort = get('sort') === 'oldest' ? 'oldest' : 'newest';
  const filtered = FILTER_KEYS.some((k) => params.get(k));

  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    setParams(next, { replace: true });
  };

  // Search box: local text, debounced into the URL; follows the URL when the top-bar search navigates here.
  const [text, setText] = useState(q);
  useEffect(() => setText(q), [q]);
  useEffect(() => {
    if (text.trim() === q) return;
    const t = setTimeout(() => set({ q: text.trim() }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const [state, setState] = useState<{ items: Result[]; total: number; loading: boolean; error: string | null }>({
    items: [],
    total: 0,
    loading: true,
    error: null,
  });
  const reqId = useRef(0);
  const load = useCallback(
    async (offset: number) => {
      const id = ++reqId.current;
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const r = await api.results({
          q: q || undefined,
          platform: platform || undefined,
          contentType: contentType || undefined,
          monitorId: monitorId || undefined,
          keyword: keyword || undefined,
          from: dayBoundary(from, false),
          to: dayBoundary(to, true),
          sort,
          limit: PAGE,
          offset,
        });
        if (id !== reqId.current) return;
        setState((s) => {
          // New results can arrive between pages and shift offsets; never show one twice.
          const have = new Set(offset ? s.items.map((i) => i.id) : []);
          const items = offset ? [...s.items, ...r.items.filter((i) => !have.has(i.id))] : r.items;
          return { items, total: r.total, loading: false, error: null };
        });
      } catch (e) {
        if (id === reqId.current) setState((s) => ({ ...s, loading: false, error: errMsg(e) }));
      }
    },
    [q, platform, contentType, monitorId, keyword, from, to, sort],
  );
  useEffect(() => {
    void load(0);
  }, [load]);

  const selected = monitors?.find((m) => m.id === monitorId);
  const keywords = [...new Set((selected ? [selected] : (monitors ?? [])).flatMap((m) => m.keywords))].sort((a, b) =>
    a.localeCompare(b),
  );
  if (keyword && !keywords.includes(keyword)) keywords.unshift(keyword);

  const { items, total, loading, error } = state;

  return (
    <>
      <header className="page-head">
        <div>
          <p className="page-head__kicker num" aria-live="polite">
            {loading && !items.length ? 'Loading…' : `${total.toLocaleString()} stored result${total === 1 ? '' : 's'}${filtered ? ' match these filters' : ''}`}
          </p>
          <h1>Results</h1>
        </div>
      </header>

      <div className="toolbar" role="group" aria-label="Filter results">
        <label className="search toolbar__search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search within results…"
            aria-label="Search within results"
          />
        </label>
        <select className="input select" aria-label="Platform" value={platform} onChange={(e) => set({ platform: e.target.value })}>
          <option value="">All platforms</option>
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {PLATFORM_LABEL[p]}
            </option>
          ))}
        </select>
        <select className="input select" aria-label="Result type" value={contentType} onChange={(e) => set({ contentType: e.target.value })}>
          <option value="">All types</option>
          {CONTENT_TYPES.map(([type, label]) => <option key={type} value={type}>{label}</option>)}
        </select>
        <select
          className="input select"
          aria-label="Monitor"
          value={monitorId}
          onChange={(e) => set({ monitorId: e.target.value, keyword: '' })}
        >
          <option value="">All monitors</option>
          {monitors?.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <select className="input select" aria-label="Keyword" value={keyword} onChange={(e) => set({ keyword: e.target.value })}>
          <option value="">All keywords</option>
          {keywords.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <span className="range">
          <input className="input num" type="date" aria-label="From date" value={from} max={to || undefined} onChange={(e) => set({ from: e.target.value })} />
          <span aria-hidden="true">–</span>
          <input className="input num" type="date" aria-label="To date" value={to} min={from || undefined} onChange={(e) => set({ to: e.target.value })} />
        </span>
        <select className="input select" aria-label="Sort" value={sort} onChange={(e) => set({ sort: e.target.value === 'oldest' ? 'oldest' : '' })}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
        {filtered && (
          <button type="button" className="btn" onClick={() => setParams(sort === 'oldest' ? { sort } : {}, { replace: true })}>
            Clear
          </button>
        )}
      </div>

      {error && <ErrorNote message={error} onRetry={() => load(0)} />}

      {loading && !items.length ? (
        <SkelRows rows={4} h={148} />
      ) : !items.length && !error ? (
        <div className="panel">
          {filtered ? (
            <Empty title="No stored results match these filters.">
              <button type="button" className="btn" onClick={() => setParams({}, { replace: true })}>
                Clear filters
              </button>
            </Empty>
          ) : monitors?.length === 0 ? (
            <Empty title="Create your first monitor to start collecting matches.">
              <Link className="btn btn--primary" to="/welcome">
                Create a monitor
              </Link>
            </Empty>
          ) : (
            <Empty title="No matches yet. Your monitor will keep checking while the local service is running.">
              <Link className="btn" to="/monitors">
                View monitors
              </Link>
            </Empty>
          )}
        </div>
      ) : (
        <div className={`results${loading ? ' is-stale' : ''}`}>
          {items.map((r) => (
            <ResultCard key={r.id} r={r} />
          ))}
        </div>
      )}

      {items.length > 0 && (
        <div className="more num">
          <span>
            Showing {items.length.toLocaleString()} of {total.toLocaleString()}
          </span>
          {items.length < total && (
            <button type="button" className="btn" disabled={loading} onClick={() => load(items.length)}>
              {loading ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
      )}
    </>
  );
}
