import { useId, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { api, errMsg, type ContentType, type MatchMode, type Monitor, type Platform } from './api.ts';
import { useData } from './data.tsx';
import { DEFAULT_ACTORS, estimateWeeklyCost, type ApifyPlan } from './cost.ts';
import { MIN_FREQUENCY_MINUTES, PLATFORMS, PLATFORM_LABEL, addKeywords, splitKeywords } from './lib.ts';
import { Dialog, Spinner } from './ui.tsx';

const LOOKBACKS = [1, 3, 7, 14, 30];
const SOURCE_LABEL: Record<Platform, string> = { ...PLATFORM_LABEL, web: 'Web / Blogs' };
type FieldKey = 'name' | 'keywords' | 'platforms' | 'contentTypes' | 'frequency';
const CONTENT_TYPES: Array<[ContentType, string]> = [
  ['jobs', 'Jobs'], ['people', 'People'], ['news', 'News'], ['courses', 'Courses'], ['other', 'Other'],
];

function KeywordInput({
  value,
  onChange,
  id,
  invalid,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  id: string;
  invalid: boolean;
}) {
  const [draft, setDraft] = useState('');
  const commit = (text: string) => {
    const next = addKeywords(value, splitKeywords(text));
    if (next.length !== value.length) onChange(next);
    setDraft('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit(draft);
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    if (!/[\n,]/.test(text)) return;
    e.preventDefault();
    commit(draft + text);
  };
  return (
    <div className="kw">
      {value.map((k) => (
        <span className="chip chip--rm" key={k} title={k}>
          <span>{k}</span>
          <button type="button" aria-label={`Remove keyword ${k}`} onClick={() => onChange(value.filter((x) => x !== k))}>
            <X size={13} aria-hidden="true" />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onPaste={onPaste}
        onBlur={() => draft.trim() && commit(draft)}
        placeholder={value.length ? 'Add another…' : 'e.g. AI automation Bangladesh'}
        autoComplete="off"
        aria-invalid={invalid || undefined}
        aria-describedby={`${id}-hint`}
      />
    </div>
  );
}

export function MonitorForm({
  monitor,
  onSaved,
  onCancel,
}: {
  monitor?: Monitor;
  onSaved: (m: Monitor) => void;
  onCancel?: () => void;
}) {
  const uid = useId();
  const { system } = useData();
  const initFreq = monitor?.frequencyMinutes ?? 60;
  const [name, setName] = useState(monitor?.name ?? '');
  const [keywords, setKeywords] = useState<string[]>(monitor?.keywords ?? []);
  const [platforms, setPlatforms] = useState<Platform[]>(monitor?.platforms ?? PLATFORMS);
  const [lookback, setLookback] = useState(monitor?.lookbackDays ?? 7);
  const [matchMode, setMatchMode] = useState<MatchMode>(monitor?.matchMode ?? 'anywhere');
  const [contentTypes, setContentTypes] = useState<ContentType[]>(monitor?.contentTypes ?? CONTENT_TYPES.map(([type]) => type));
  const [excludeSocialWeb, setExcludeSocialWeb] = useState(monitor?.excludeSocialWeb ?? false);
  const [freqMode, setFreqMode] = useState<'60' | '180' | 'custom'>(
    initFreq === 60 ? '60' : initFreq === 180 ? '180' : 'custom',
  );
  const [customValue, setCustomValue] = useState(String(initFreq % 60 === 0 ? initFreq / 60 : initFreq));
  const [customUnit, setCustomUnit] = useState<'minutes' | 'hours'>(initFreq % 60 === 0 ? 'hours' : 'minutes');
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [plan, setPlan] = useState<ApifyPlan>('free');

  const lookbacks = LOOKBACKS.includes(lookback) ? LOOKBACKS : [...LOOKBACKS, lookback].sort((a, b) => a - b);
  const frequencyMinutes =
    freqMode === 'custom' ? Math.round(Number(customValue) * (customUnit === 'hours' ? 60 : 1)) : Number(freqMode);
  const cost = system && keywords.length && platforms.length && Number.isFinite(frequencyMinutes) && frequencyMinutes >= MIN_FREQUENCY_MINUTES
    ? estimateWeeklyCost(keywords.length, platforms, frequencyMinutes, system.maxItemsPerKeyword, plan)
    : null;
  const customActors = platforms.filter((source) => system && system.providers[source].actorId !== DEFAULT_ACTORS[source]);

  // Field key -> the element to focus when that field is the first invalid one.
  const focusId: Record<FieldKey, string> = {
    name: `${uid}-name`,
    keywords: `${uid}-kw`,
    platforms: `${uid}-src-${PLATFORMS[0]}`,
    contentTypes: `${uid}-type-${CONTENT_TYPES[0][0]}`,
    frequency: freqMode === 'custom' ? `${uid}-fqv` : `${uid}-fq-60`,
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found: Partial<Record<FieldKey, string>> = {};
    if (!name.trim()) found.name = 'Give the monitor a name.';
    if (!keywords.length) found.keywords = 'Add at least one keyword. Press Enter or comma after each one.';
    if (!platforms.length) found.platforms = 'Choose at least one source.';
    if (!contentTypes.length) found.contentTypes = 'Choose at least one result type.';
    if (!Number.isFinite(frequencyMinutes) || frequencyMinutes < MIN_FREQUENCY_MINUTES)
      found.frequency = `Frequency must be at least ${MIN_FREQUENCY_MINUTES} minutes.`;
    setErrors(found);
    setServerError(null);
    const first = (Object.keys(focusId) as FieldKey[]).find((k) => found[k]);
    if (first) return document.getElementById(focusId[first])?.focus();

    setSaving(true);
    const input = { name: name.trim(), keywords, platforms, lookbackDays: lookback, frequencyMinutes, matchMode, contentTypes, excludeSocialWeb };
    try {
      onSaved(monitor ? await api.updateMonitor(monitor.id, input) : await api.createMonitor(input));
    } catch (err) {
      setServerError(errMsg(err));
      setSaving(false);
    }
  };

  const fieldError = (k: FieldKey) =>
    errors[k] && (
      <p className="field__error" role="alert" id={`${uid}-${k}-err`}>
        {errors[k]}
      </p>
    );

  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor={`${uid}-name`}>Monitor name</label>
        <input
          id={`${uid}-name`}
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="AI Automation Talent — Bangladesh"
          autoComplete="off"
          maxLength={120}
          aria-invalid={!!errors.name || undefined}
          aria-describedby={errors.name ? `${uid}-name-err` : undefined}
        />
        {fieldError('name')}
      </div>

      <div className="field">
        <label htmlFor={`${uid}-kw`}>Keywords</label>
        <KeywordInput id={`${uid}-kw`} value={keywords} onChange={setKeywords} invalid={!!errors.keywords} />
        <p className="hint" id={`${uid}-kw-hint`}>
          Enter or comma adds a keyword. Paste a list to add several at once.
        </p>
        {fieldError('keywords')}
      </div>

      <fieldset className="field">
        <legend>Sources</legend>
        <div className="seg seg--check">
          {PLATFORMS.map((p) => (
            <label className="seg__opt" key={p}>
              <input
                id={`${uid}-src-${p}`}
                type="checkbox"
                checked={platforms.includes(p)}
                onChange={(e) =>
                  setPlatforms(PLATFORMS.filter((x) => (x === p ? e.target.checked : platforms.includes(x))))
                }
              />
              <span>{SOURCE_LABEL[p]}</span>
            </label>
          ))}
        </div>
        {fieldError('platforms')}
      </fieldset>

      {platforms.includes('web') && (
        <div className="field">
          <label className="check-row">
            <input type="checkbox" checked={excludeSocialWeb} onChange={(e) => setExcludeSocialWeb(e.target.checked)} />
            <span>Exclude social sites from Web results</span>
          </label>
          <p className="hint">Skips common social domains such as Facebook, Reddit, Instagram, LinkedIn, X, and YouTube. The LinkedIn and X sources above are separate.</p>
        </div>
      )}

      <fieldset className="field">
        <legend>Result types</legend>
        <div className="seg seg--check">
          {CONTENT_TYPES.map(([type, label]) => (
            <label className="seg__opt" key={type}>
              <input
                id={`${uid}-type-${type}`}
                type="checkbox"
                checked={contentTypes.includes(type)}
                onChange={(e) => setContentTypes(CONTENT_TYPES.map(([value]) => value).filter((value) => value === type ? e.target.checked : contentTypes.includes(value)))}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <p className="hint">Types are estimated from each result’s text and link. Change this selection later without starting another search.</p>
        {fieldError('contentTypes')}
      </fieldset>

      <fieldset className="field">
        <legend>Keyword matching</legend>
        <div className="seg">
          {([['anywhere', 'Anywhere in result'], ['nearby', 'Within 20 words']] as const).map(([value, label]) => (
            <label className="seg__opt" key={value}>
              <input type="radio" name={`${uid}-match`} checked={matchMode === value} onChange={() => setMatchMode(value)} />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <p className="hint">Every word in a keyword must appear in the title or text. Common forms such as AI / artificial intelligence and Bangladesh / Dhaka count. Web snippets that cannot confirm a match stay in the feed with a warning.</p>
      </fieldset>

      <fieldset className="field">
        <legend>Initial lookback</legend>
        <div className="seg">
          {lookbacks.map((d) => (
            <label className="seg__opt" key={d}>
              <input type="radio" name={`${uid}-lb`} checked={lookback === d} onChange={() => setLookback(d)} />
              <span>{d === 1 ? '1 day' : `${d} days`}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend>Check frequency</legend>
        <div className="seg">
          {(
            [
              ['60', '1 hour'],
              ['180', '3 hours'],
              ['custom', 'Custom'],
            ] as const
          ).map(([v, label]) => (
            <label className="seg__opt" key={v}>
              <input id={`${uid}-fq-${v}`} type="radio" name={`${uid}-fq`} checked={freqMode === v} onChange={() => setFreqMode(v)} />
              <span>{label}</span>
            </label>
          ))}
        </div>
        {freqMode === 'custom' && (
          <div className="custom-freq">
            <span>Every</span>
            <input
              id={`${uid}-fqv`}
              className="input num"
              type="number"
              min={customUnit === 'hours' ? 1 : MIN_FREQUENCY_MINUTES}
              step={1}
              inputMode="numeric"
              aria-label="Custom frequency value"
              aria-invalid={!!errors.frequency || undefined}
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
            />
            <select
              className="input select"
              aria-label="Custom frequency unit"
              value={customUnit}
              onChange={(e) => setCustomUnit(e.target.value as 'minutes' | 'hours')}
            >
              <option value="minutes">minutes</option>
              <option value="hours">hours</option>
            </select>
          </div>
        )}
        <p className="hint">
          Each run uses Apify credit, so shorter intervals cost more. Minimum {MIN_FREQUENCY_MINUTES} minutes.
        </p>
        {fieldError('frequency')}
      </fieldset>

      <section className="cost-estimate" aria-live="polite">
        <div className="cost-estimate__head">
          <strong>Estimated cost per week</strong>
          <select className="input select" aria-label="Apify plan for cost estimate" value={plan} onChange={(e) => setPlan(e.target.value as ApifyPlan)}>
            <option value="free">Free plan</option>
            <option value="starter">Starter plan</option>
            <option value="scale">Scale plan</option>
            <option value="business">Business plan</option>
          </select>
        </div>
        {customActors.length ? (
          <p>Estimate unavailable for custom {customActors.map((source) => SOURCE_LABEL[source]).join(', ')} Actor pricing.</p>
        ) : cost ? (
          <>
            <p className="cost-estimate__value">~${cost.weekly.toFixed(2)} <span>/ week</span></p>
            <p>{cost.runs.toFixed(1)} runs/week × ~${cost.perRun.toFixed(3)}/run, assuming {system!.maxItemsPerKeyword} items per keyword and all selected sources return their limit. The first run starts on creation.</p>
          </>
        ) : (
          <p>{!system ? 'Connect to the local server to calculate the estimate.' : 'Add a keyword and select a source to see an estimate.'}</p>
        )}
        <p className="cost-estimate__warning">⚠ This is only an estimate, not a spending cap. Actual charges depend on returned items, empty searches, Actor pricing, and your Apify plan. X also bills platform usage separately. Result type, matching, and social site filters apply after or during search and do not guarantee lower charges.</p>
        <p className="cost-estimate__sources">Rates checked 7 Oct 2026: <a href="https://apify.com/harvestapi/linkedin-post-search/pricing" target="_blank" rel="noreferrer">LinkedIn</a> · <a href="https://apify.com/xquik/x-tweet-scraper/pricing" target="_blank" rel="noreferrer">X</a> · <a href="https://apify.com/apify/google-search-scraper/pricing" target="_blank" rel="noreferrer">Web</a></p>
      </section>

      {serverError && (
        <p className="note note--err" role="alert">
          {serverError}
        </p>
      )}

      <div className="form__actions">
        {!monitor && <p className="hint">The first run starts as soon as you save.</p>}
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving && <Spinner />}
          {monitor ? 'Save changes' : 'Start monitoring'}
        </button>
      </div>
    </form>
  );
}

export function MonitorDialog({
  monitor,
  onClose,
  onSaved,
}: {
  monitor?: Monitor;
  onClose: () => void;
  onSaved: (m: Monitor) => void;
}) {
  return (
    <Dialog title={monitor ? 'Edit monitor' : 'New monitor'} onClose={onClose}>
      <MonitorForm monitor={monitor} onSaved={onSaved} onCancel={onClose} />
    </Dialog>
  );
}
