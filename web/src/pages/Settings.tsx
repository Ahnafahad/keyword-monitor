import { Download, RefreshCw } from 'lucide-react';
import { useData } from '../data.tsx';
import { PLATFORMS, PLATFORM_LABEL } from '../lib.ts';
import { PlatformBadge, Skel, Status } from '../ui.tsx';

const EXPORTS = [
  { href: '/api/export/results.jsonl', label: 'Results', file: 'results.jsonl' },
  { href: '/api/export/monitors.json', label: 'Monitors', file: 'monitors.json' },
  { href: '/api/export/runs.jsonl', label: 'Run history', file: 'runs.jsonl' },
];

export const APIFY_FIX = (
  <>
    Add <code>APIFY_API_TOKEN</code> to <code>.env</code> and restart.
  </>
);

/** Shared by Settings and onboarding: the three connection states plus "service unreachable". */
export function ApifyStatus() {
  const { system, error, monitors, checkSystem, refresh } = useData();
  const recheck = (
    <button
      type="button"
      className="btn btn--sm"
      onClick={() => {
        void checkSystem();
        void refresh();
      }}
    >
      <RefreshCw size={14} aria-hidden="true" />
      Re-check
    </button>
  );
  if (!system) {
    const offline = !!error || monitors !== null;
    return (
      <div className="conn">
        {offline ? (
          <>
            <Status tone="err">Local service not reachable</Status>
            <p>Start the local service (for example with <code>npm start</code>), then re-check. Stored results are not affected.</p>
            {recheck}
          </>
        ) : (
          <Skel h={20} w={220} />
        )}
      </div>
    );
  }
  const { apify } = system;
  return (
    <div className="conn">
      {apify.ok ? (
        <>
          <Status tone="ok">Connected{apify.username ? ` as ${apify.username}` : ''}</Status>
          <p>The token stays on the local service and is never sent to this page.</p>
        </>
      ) : !apify.configured ? (
        <>
          <Status tone="warn">Not configured</Status>
          <p>No Apify token was found. {APIFY_FIX}</p>
        </>
      ) : (
        <>
          <Status tone="err">Token not accepted</Status>
          <p>
            Apify rejected the configured token{apify.error ? ` (${apify.error.split('\n')[0].slice(0, 160)})` : ''}. Replace{' '}
            <code>APIFY_API_TOKEN</code> in <code>.env</code> with a valid token and restart.
          </p>
        </>
      )}
      {recheck}
    </div>
  );
}

export function Settings() {
  const { system, theme, setTheme } = useData();
  return (
    <>
      <header className="page-head">
        <div>
          <p className="page-head__kicker">Local, single-user</p>
          <h1>Settings</h1>
        </div>
      </header>

      <div className="settings">
        <section className="panel" aria-labelledby="s-apify">
          <h2 id="s-apify">Apify connection</h2>
          <ApifyStatus />
        </section>

        <section className="panel" aria-labelledby="s-theme">
          <h2 id="s-theme">Theme</h2>
          <div className="seg" role="radiogroup" aria-label="Theme">
            {(['dark', 'light'] as const).map((t) => (
              <label className="seg__opt" key={t}>
                <input type="radio" name="theme" checked={theme === t} onChange={() => setTheme(t)} />
                <span>{t === 'dark' ? 'Dark' : 'Light'}</span>
              </label>
            ))}
          </div>
          <p className="hint">Saved in this browser only.</p>
        </section>

        <section className="panel" aria-labelledby="s-prov">
          <h2 id="s-prov">Default providers</h2>
          <dl className="kv">
            {PLATFORMS.map((p) => {
              const prov = system?.providers?.[p];
              return (
                <div key={p}>
                  <dt>
                    <PlatformBadge platform={p} />
                  </dt>
                  <dd>
                    {prov ? (
                      <>
                        {prov.label}
                        <code>{prov.actorId}</code>
                      </>
                    ) : system ? (
                      <span className="muted">Not available</span>
                    ) : (
                      <Skel h={14} w={180} />
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
          <p className="hint">Each source is served by one Apify Actor ({PLATFORMS.map((p) => PLATFORM_LABEL[p]).join(', ')}).</p>
        </section>

        <section className="panel" aria-labelledby="s-data">
          <h2 id="s-data">Local data</h2>
          <dl className="kv">
            <div>
              <dt>Location</dt>
              <dd>{system ? <code>{system.dataDir}</code> : <Skel h={14} w={220} />}</dd>
            </div>
            <div>
              <dt>Version</dt>
              <dd className="num">{system ? system.version : <Skel h={14} w={60} />}</dd>
            </div>
          </dl>
          <div className="exports">
            {EXPORTS.map((e) => (
              <a key={e.href} className="btn" href={e.href} download={e.file}>
                <Download size={14} aria-hidden="true" />
                {e.label}
                <span className="muted num">{e.file}</span>
              </a>
            ))}
          </div>
          <p className="hint">Exports are plain JSON / JSON Lines and never include the Apify token.</p>
        </section>
      </div>
    </>
  );
}
