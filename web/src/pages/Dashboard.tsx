import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Clock, Database, Radar, Sparkles, type LucideIcon } from 'lucide-react';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, errMsg, type Run, type Stats } from '../api.ts';
import { useData, useLoad } from '../data.tsx';
import { PLATFORMS, PLATFORM_LABEL, absTime, relTime, safeUrl } from '../lib.ts';
import { MonitorDialog } from '../MonitorForm.tsx';
import { Chips, Cta, Empty, ErrorNote, PlatformBadge, RUN_LABEL, RUN_TONE, Skel, SkelRows, Spinner, Status, resultSource, resultWhen } from '../ui.tsx';

const n = (v: number) => v.toLocaleString();
const day = (date: string, long?: boolean) =>
  new Date(`${date}T00:00:00`).toLocaleDateString(undefined, long ? { weekday: 'short', day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short' });

function Metric({
  icon: Icon,
  label,
  value,
  chip,
  focal,
}: {
  icon: LucideIcon;
  label: string;
  value: string | null;
  /** Only pass a chip backed by a real number. */
  chip?: string | null;
  focal?: boolean;
}) {
  return (
    <div className={`metric${focal ? ' metric--focal' : ''}`}>
      <span className="metric__icon">
        <Icon size={17} aria-hidden="true" />
      </span>
      <span className="metric__label">{label}</span>
      <span className="metric__row">
        <span className="metric__value num">{value ?? <Skel h={30} w={90} />}</span>
        {chip && <span className="metric__chip num">{chip}</span>}
      </span>
    </div>
  );
}

function ChartTip({ active, payload, label }: { active?: boolean; payload?: Array<{ payload?: Stats['series'][number] }>; label?: string }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="tip">
      <div className="tip__date num">{day(String(label), true)}</div>
      <div className="tip__row">
        <i className="swatch swatch--total" aria-hidden="true" />
        <span>Total</span>
        <b className="num">{n(row.total)}</b>
      </div>
      {PLATFORMS.map((p) => (
        <div className="tip__row" key={p}>
          <i className={`swatch swatch--${p}`} aria-hidden="true" />
          <span>{PLATFORM_LABEL[p]}</span>
          <b className="num">{n(row[p])}</b>
        </div>
      ))}
    </div>
  );
}

function Discoveries({ stats }: { stats: Stats | null }) {
  const [range, setRange] = useState<7 | 14>(14);
  const series = (stats?.series ?? []).slice(-range);
  const total = series.reduce((sum, d) => sum + d.total, 0);
  return (
    <section className="panel chart" aria-labelledby="chart-h">
      <header className="panel__head">
        <div>
          <h2 id="chart-h">Discoveries Over Time</h2>
          <p className="panel__sub num">{stats ? `${n(total)} new results in the last ${series.length} days` : 'New results per day'}</p>
        </div>
        <div className="seg seg--sm" role="radiogroup" aria-label="Chart range">
          {([7, 14] as const).map((d) => (
            <label className="seg__opt" key={d}>
              <input type="radio" name="chart-range" checked={range === d} onChange={() => setRange(d)} />
              <span className="num">{d}d</span>
            </label>
          ))}
        </div>
      </header>
      {!stats ? (
        <Skel h={260} />
      ) : !total ? (
        <Empty title={`No new results in the last ${range} days. Discoveries are charted here as monitors find them.`} />
      ) : (
        <>
          <div className="chart__body" role="img" aria-label={`Daily discoveries: ${n(total)} new results in the last ${series.length} days`}>
            <ResponsiveContainer width="100%" height={250}>
              <ComposedChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                <defs>
                  <linearGradient id="total-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d: string) => day(d)}
                  tick={{ fill: 'var(--text-3)', fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--border)' }}
                  minTickGap={28}
                  tickMargin={8}
                />
                <YAxis allowDecimals={false} tick={{ fill: 'var(--text-3)', fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
                <Tooltip content={<ChartTip />} cursor={{ stroke: 'var(--text-3)', strokeDasharray: '3 4' }} />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="var(--primary)"
                  strokeWidth={1.75}
                  fill="url(#total-fill)"
                  isAnimationActive={false}
                  activeDot={{ r: 4, strokeWidth: 0, className: 'glow-dot' }}
                />
                {PLATFORMS.map((p) => (
                  <Line
                    key={p}
                    type="monotone"
                    dataKey={p}
                    stroke={`var(--p-${p})`}
                    strokeWidth={1.25}
                    strokeDasharray={p === 'x' ? '4 3' : undefined}
                    dot={false}
                    activeDot={false}
                    isAnimationActive={false}
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <ul className="legend" aria-label="Chart series">
            <li>
              <i className="swatch swatch--total" aria-hidden="true" />
              Total
            </li>
            {PLATFORMS.map((p) => (
              <li key={p}>
                <i className={`swatch swatch--${p}`} aria-hidden="true" />
                {PLATFORM_LABEL[p]}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function runSummary(r: Run): string {
  const p = PLATFORM_LABEL[r.platform];
  switch (r.status) {
    case 'running':
      return `Searching ${p}…`;
    case 'succeeded':
      return `${n(r.fetched)} fetched · ${n(r.newCount)} new`;
    case 'failed':
      return `${p} search failed on this run. Existing results are safe. Retry now or wait for the next scheduled run.`;
    case 'throttled':
      return `${p} is rate-limited. Existing results are safe.${r.retryAfter ? ` Retrying ${relTime(r.retryAfter)}.` : ' It will retry on the next scheduled run.'}`;
  }
}

function Activity() {
  const { tick, refresh, monitors } = useData();
  const runs = useLoad(() => api.runs({ limit: 12 }), [tick]);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  // Only the latest run of a monitor+platform offers Retry; older failures are history.
  const seen = new Set<string>();

  const retry = async (monitorId: string) => {
    setRetrying(monitorId);
    setRetryError(null);
    try {
      await api.runMonitor(monitorId);
      await refresh();
    } catch (e) {
      setRetryError(errMsg(e));
    }
    setRetrying(null);
  };

  return (
    <section className="panel activity" aria-labelledby="act-h">
      <header className="panel__head">
        <h2 id="act-h">Monitor Activity</h2>
        <Link className="icon-btn" to="/monitors" aria-label="Open monitors" title="Open monitors">
          <ArrowUpRight size={17} aria-hidden="true" />
        </Link>
      </header>
      {retryError && <ErrorNote message={retryError} />}
      {runs.error && !runs.data ? (
        <ErrorNote message={runs.error} onRetry={runs.reload} />
      ) : !runs.data ? (
        <SkelRows rows={4} h={56} />
      ) : !runs.data.length ? (
        <Empty title="No runs yet. Activity appears here as soon as a monitor checks its sources." />
      ) : (
        <ul className="runs" tabIndex={0} aria-label="Recent runs">
          {runs.data.map((r) => {
            const key = `${r.monitorId}:${r.platform}`;
            const latest = !seen.has(key);
            seen.add(key);
            const monitor = monitors?.find((m) => m.id === r.monitorId);
            const when = r.finishedAt ?? r.startedAt;
            return (
              <li className="run" key={r.id}>
                <div className="run__top">
                  <PlatformBadge platform={r.platform} />
                  <Status tone={RUN_TONE[r.status]}>{RUN_LABEL[r.status]}</Status>
                  <time className="run__time num" dateTime={when} title={absTime(when)}>
                    {r.status === 'running' ? `started ${relTime(r.startedAt)}` : relTime(when)}
                  </time>
                </div>
                <p className="run__sum">{runSummary(r)}</p>
                <p className="run__mon" title={r.monitorName}>
                  {r.monitorName}
                </p>
                {r.status === 'failed' && (
                  <div className="run__extra">
                    {latest && monitor && !monitor.running && (
                      <button type="button" className="btn" disabled={retrying === r.monitorId} onClick={() => retry(r.monitorId)}>
                        {retrying === r.monitorId && <Spinner />}
                        Retry now
                      </button>
                    )}
                    {r.error && (
                      <details>
                        <summary>Details</summary>
                        <p>{r.error.split('\n')[0].slice(0, 300)}</p>
                      </details>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function RecentMatches() {
  const { tick } = useData();
  const recent = useLoad(() => api.results({ limit: 8, sort: 'newest' }), [tick]);
  return (
    <section className="panel" aria-labelledby="recent-h">
      <header className="panel__head">
        <h2 id="recent-h">Recent Matches</h2>
        <Link className="icon-btn" to="/results" aria-label="Open all results" title="Open all results">
          <ArrowUpRight size={17} aria-hidden="true" />
        </Link>
      </header>
      {recent.error && !recent.data ? (
        <ErrorNote message={recent.error} onRetry={recent.reload} />
      ) : !recent.data ? (
        <SkelRows rows={5} h={40} />
      ) : !recent.data.items.length ? (
        <Empty title="No matches yet. Your monitor will keep checking while the local service is running." />
      ) : (
        <table className="matches">
          <thead>
            <tr>
              <th scope="col">Source</th>
              <th scope="col">Author / domain</th>
              <th scope="col">Content</th>
              <th scope="col">Matched</th>
              <th scope="col">When</th>
              <th scope="col">
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {recent.data.items.map((r) => {
              const when = resultWhen(r);
              const url = safeUrl(r.url);
              const who = resultSource(r);
              return (
                <tr key={r.id}>
                  <td className="matches__src">
                    <PlatformBadge platform={r.platform} />
                  </td>
                  <td className="matches__who" title={who}>
                    {who}
                  </td>
                  <td className="matches__text">{r.title || r.content}</td>
                  <td className="matches__kw">
                    {!r.matchVerified && <span className="matches__unverified" title="The page title and search snippet do not confirm the keyword">Unverified</span>}
                    <Chips items={r.matchedKeywords} max={1} />
                  </td>
                  <td className="matches__when num">
                    <time dateTime={when.iso} title={absTime(when.iso)}>
                      {when.label}
                    </time>
                  </td>
                  <td className="matches__open">
                    {url && (
                      <a className="icon-btn icon-btn--plain" href={url} target="_blank" rel="noopener noreferrer" aria-label="View original (opens in a new tab)">
                        <ArrowUpRight size={16} aria-hidden="true" />
                      </a>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function Dashboard() {
  const { stats, monitors, error, refresh } = useData();
  const [creating, setCreating] = useState(false);

  const running = monitors?.filter((m) => m.running).length ?? 0;
  const nextDue = stats?.nextRunAt && Date.parse(stats.nextRunAt) <= Date.now();
  const nextRun = !stats ? null : running ? 'Running' : !stats.nextRunAt ? '—' : nextDue ? 'Due now' : relTime(stats.nextRunAt);
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const todayRow = stats?.series.at(-1);
  const newToday = todayRow?.date === todayKey ? todayRow.total : 0;
  const kicker = !stats
    ? 'Local keyword intelligence'
    : `${n(stats.activeMonitors)} monitor${stats.activeMonitors === 1 ? '' : 's'} active · ${stats.lastRunAt ? `last sync ${relTime(stats.lastRunAt)}` : 'no runs yet'}`;

  return (
    <>
      <header className="page-head">
        <div>
          <p className="page-head__kicker">{kicker}</p>
          <h1>Dashboard Overview</h1>
        </div>
        <Cta onClick={() => setCreating(true)}>New Monitor</Cta>
      </header>

      {error && <ErrorNote message={error} onRetry={refresh} />}

      <div className="metrics">
        <Metric
          focal
          icon={Radar}
          label="Active Monitors"
          value={stats && n(stats.activeMonitors)}
          chip={running ? `${running} running` : stats && stats.totalMonitors > stats.activeMonitors ? `of ${n(stats.totalMonitors)}` : null}
        />
        <Metric icon={Sparkles} label="New Matches (24h)" value={stats && n(stats.newResults24h)} chip={newToday > 0 ? `+${n(newToday)} today` : null} />
        <Metric icon={Database} label="Total Indexed" value={stats && n(stats.totalResults)} />
        <Metric icon={Clock} label="Next Run" value={nextRun} chip={stats?.lastRunAt ? `last ${relTime(stats.lastRunAt)}` : null} />
      </div>

      <div className="mid">
        <Discoveries stats={stats} />
        <Activity />
      </div>

      <RecentMatches />

      {creating && (
        <MonitorDialog
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            void refresh();
          }}
        />
      )}
    </>
  );
}
