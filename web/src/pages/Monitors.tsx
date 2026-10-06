import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Pause, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { api, errMsg, type Monitor } from '../api.ts';
import { useData } from '../data.tsx';
import { absTime, freqLabel, relTime } from '../lib.ts';
import { MonitorDialog } from '../MonitorForm.tsx';
import { Chips, Dialog, Empty, ErrorNote, PlatformBadge, SkelRows, Status } from '../ui.tsx';

function MonitorStatus({ m }: { m: Monitor }) {
  if (m.running) return <Status tone="run">Running</Status>;
  if (m.status === 'paused') return <Status tone="idle">Paused</Status>;
  if (m.lastRunStatus === 'failed') return <Status tone="err">Active · last run failed</Status>;
  if (m.lastRunStatus === 'throttled') return <Status tone="warn">Active · throttled</Status>;
  return <Status tone="ok">Active</Status>;
}

function When({ iso, empty }: { iso: string | null; empty: string }) {
  if (!iso) return <span className="muted">{empty}</span>;
  return (
    <time dateTime={iso} title={absTime(iso)}>
      {Date.parse(iso) <= Date.now() + 1000 || relTime(iso).startsWith('in') ? relTime(iso) : absTime(iso)}
    </time>
  );
}

export function Monitors() {
  const { monitors, error, refresh } = useData();
  const [editing, setEditing] = useState<Monitor | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Monitor | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const act = async (id: string, fn: () => Promise<string | void>) => {
    setBusy(id);
    setActionError(null);
    setNotice(null);
    try {
      setNotice((await fn()) ?? null);
      await refresh();
    } catch (e) {
      setActionError(errMsg(e));
    }
    setBusy(null);
  };

  return (
    <>
      <header className="page-head">
        <div>
          <p className="page-head__kicker num">
            {monitors ? `${monitors.filter((m) => m.status === 'active').length} active · ${monitors.length} total` : 'Loading…'}
          </p>
          <h1>Monitors</h1>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => setEditing('new')}>
          <Plus size={16} aria-hidden="true" />
          New Monitor
        </button>
      </header>

      {error && <ErrorNote message={error} onRetry={refresh} />}
      {actionError && <ErrorNote message={actionError} />}
      {notice && (
        <p className="note" role="status">
          {notice}
        </p>
      )}

      {!monitors ? (
        !error && <SkelRows rows={3} h={64} />
      ) : !monitors.length ? (
        <div className="panel">
          <Empty title="Create your first monitor to start collecting matches.">
            <button type="button" className="btn btn--primary" onClick={() => setEditing('new')}>
              Create a monitor
            </button>
          </Empty>
        </div>
      ) : (
        <div className="panel panel--flush">
          <div className="mon mon--head" aria-hidden="true">
            <span>Monitor</span>
            <span>Sources</span>
            <span>Frequency</span>
            <span>Status</span>
            <span>Last run</span>
            <span>Next run</span>
            <span>Results</span>
            <span />
          </div>
          <ul className="mons">
            {monitors.map((m) => {
              const isOpen = open === m.id;
              const disabled = busy === m.id;
              return (
                <li key={m.id}>
                  <div className="mon">
                    <div className="mon__name">
                      <strong>{m.name}</strong>
                      <button
                        type="button"
                        className="mon__kw"
                        aria-expanded={isOpen}
                        aria-controls={`kw-${m.id}`}
                        onClick={() => setOpen(isOpen ? null : m.id)}
                      >
                        {m.keywords.length} keyword{m.keywords.length === 1 ? '' : 's'}
                        <ChevronDown size={13} aria-hidden="true" />
                      </button>
                    </div>
                    <div className="mon__cell mon__src">
                      <span className="lbl">Sources</span>
                      <span className="mon__badges">
                        {m.platforms.map((p) => (
                          <PlatformBadge key={p} platform={p} />
                        ))}
                      </span>
                    </div>
                    <div className="mon__cell num">
                      <span className="lbl">Frequency</span>
                      {freqLabel(m.frequencyMinutes)}
                    </div>
                    <div className="mon__cell">
                      <span className="lbl">Status</span>
                      <MonitorStatus m={m} />
                    </div>
                    <div className="mon__cell num">
                      <span className="lbl">Last run</span>
                      <When iso={m.lastRunAt} empty="Never" />
                    </div>
                    <div className="mon__cell num">
                      <span className="lbl">Next run</span>
                      {m.running ? <span className="muted">In progress</span> : <When iso={m.nextRunAt} empty={m.status === 'paused' ? 'Paused' : '—'} />}
                    </div>
                    <div className="mon__cell num">
                      <span className="lbl">Results</span>
                      <Link to={`/results?monitorId=${encodeURIComponent(m.id)}`} className="mon__count">
                        {m.resultCount.toLocaleString()}
                      </Link>
                      {m.newCount24h > 0 && <span className="mon__new">+{m.newCount24h.toLocaleString()} 24h</span>}
                    </div>
                    <div className="mon__actions">
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Run ${m.name} now`}
                        title="Run now"
                        disabled={disabled || m.running}
                        onClick={() =>
                          act(m.id, async () => {
                            const { started } = await api.runMonitor(m.id);
                            return started ? `Run started for “${m.name}”.` : `“${m.name}” is already running.`;
                          })
                        }
                      >
                        <Play size={16} aria-hidden="true" />
                      </button>
                      <button type="button" className="icon-btn" aria-label={`Edit ${m.name}`} title="Edit" onClick={() => setEditing(m)}>
                        <Pencil size={16} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`${m.status === 'active' ? 'Pause' : 'Resume'} ${m.name}`}
                        title={m.status === 'active' ? 'Pause' : 'Resume'}
                        disabled={disabled}
                        onClick={() =>
                          act(m.id, async () => {
                            await api.updateMonitor(m.id, { status: m.status === 'active' ? 'paused' : 'active' });
                          })
                        }
                      >
                        {m.status === 'active' ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" className="resume" />}
                        {m.status === 'paused' && <span className="icon-btn__text">Resume</span>}
                      </button>
                      <button
                        type="button"
                        className="icon-btn icon-btn--danger"
                        aria-label={`Delete ${m.name}`}
                        title="Delete"
                        disabled={disabled}
                        onClick={() => setDeleting(m)}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  {isOpen && (
                    <div className="mon__keywords" id={`kw-${m.id}`}>
                      <span className="micro">Keywords</span>
                      <Chips items={m.keywords} />
                      <span className="micro">Match {m.matchMode === 'nearby' ? 'within 20 words' : 'anywhere'}</span>
                      <span className="micro">Types {m.contentTypes.join(', ')}</span>
                      {m.excludeSocialWeb && <span className="micro">Social Web excluded</span>}
                      <span className="micro">Lookback {m.lookbackDays}d</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {editing && (
        <MonitorDialog
          monitor={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void refresh();
          }}
        />
      )}

      {deleting && (
        <Dialog title="Delete monitor?" narrow onClose={() => setDeleting(null)}>
          <p className="dialog__text">
            “{deleting.name}” and its schedule will be removed. Results it already collected stay in your local index.
          </p>
          <div className="form__actions">
            <button type="button" className="btn" onClick={() => setDeleting(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => {
                const m = deleting;
                setDeleting(null);
                void act(m.id, () => api.deleteMonitor(m.id));
              }}
            >
              Delete monitor
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
