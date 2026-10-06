import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Monitor } from '../api.ts';
import { useData } from '../data.tsx';
import { freqLabel } from '../lib.ts';
import { MonitorForm } from '../MonitorForm.tsx';
import { Mark, Status } from '../ui.tsx';
import { ApifyStatus } from './Settings.tsx';

const STEPS = ['Welcome', 'Apify connection', 'First monitor', 'Start'];

export function Onboarding() {
  const { system, refresh } = useData();
  const [step, setStep] = useState(0);
  const [created, setCreated] = useState<Monitor | null>(null);
  const ready = !!system?.apify.ok;

  return (
    <div className="onb">
      <ol className="steps" aria-label="Setup progress">
        {STEPS.map((s, i) => (
          <li key={s} className={i === step ? 'is-current' : i < step ? 'is-done' : ''} aria-current={i === step ? 'step' : undefined}>
            <span className="num">{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>

      <section className="panel onb__card" aria-live="polite">
        {step === 0 && (
          <>
            <Mark size={36} />
            <h1>Keyword Monitor</h1>
            <p className="onb__lead">
              Watch LinkedIn, X and the web for the keywords you care about. Matches are collected on a schedule and stored on
              this machine.
            </p>
            <div className="form__actions">
              <button type="button" className="btn btn--primary" onClick={() => setStep(1)}>
                Get started
              </button>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h1>Apify connection</h1>
            <p className="onb__lead">Searches run through your Apify account. The token is read from the local service only.</p>
            <ApifyStatus />
            <div className="form__actions">
              <button type="button" className="btn" onClick={() => setStep(0)}>
                Back
              </button>
              <button type="button" className="btn btn--primary" disabled={!ready} onClick={() => setStep(2)}>
                Continue
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1>Create your first monitor</h1>
            <p className="onb__lead">Name it, add a few keywords, pick sources. You can change everything later.</p>
            <MonitorForm
              onCancel={() => setStep(1)}
              onSaved={(m) => {
                setCreated(m);
                setStep(3);
                void refresh();
              }}
            />
          </>
        )}

        {step === 3 && created && (
          <>
            <Status tone="run">First run started</Status>
            <h1>{created.name}</h1>
            <p className="onb__lead num">
              Checking {created.keywords.length} keyword{created.keywords.length === 1 ? '' : 's'} across {created.platforms.length}{' '}
              source{created.platforms.length === 1 ? '' : 's'}, then {freqLabel(created.frequencyMinutes).toLowerCase()} while the
              local service is running.
            </p>
            <div className="form__actions">
              <Link className="btn" to="/monitors">
                View monitors
              </Link>
              <Link className="btn btn--primary" to="/">
                Open dashboard
              </Link>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
