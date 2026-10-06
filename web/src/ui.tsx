import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { ArrowUpRight, CircleAlert, Plus, X } from 'lucide-react';
import type { Platform, Result, RunStatus } from './api.ts';
import { PLATFORM_LABEL, absTime, hostname, relTime, safeUrl, str } from './lib.ts';

export function Mark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--primary)" />
      <path
        d="M6 18h5l3-8 4 13 3-8h5"
        fill="none"
        stroke="var(--on-primary)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PlatformBadge({ platform }: { platform: Platform }) {
  return (
    <span className={`tag tag--${platform}`}>
      <i className="dot" aria-hidden="true" />
      {PLATFORM_LABEL[platform]}
    </span>
  );
}

type Tone = 'ok' | 'warn' | 'err' | 'run' | 'idle';

/** Outlined chip: dot + text label, so state never relies on colour alone. */
export function Status({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`tag tag--${tone}`}>
      <i className={tone === 'run' ? 'dot dot--pulse' : 'dot'} aria-hidden="true" />
      {children}
    </span>
  );
}

export const RUN_TONE: Record<RunStatus, Tone> = { running: 'run', succeeded: 'ok', failed: 'err', throttled: 'warn' };
export const RUN_LABEL: Record<RunStatus, string> = {
  running: 'Running',
  succeeded: 'Completed',
  failed: 'Failed',
  throttled: 'Throttled',
};

export function Spinner() {
  return <i className="spin" aria-hidden="true" />;
}

/** The primary call to action: a circular "+" chip fused to a pill. */
export function Cta({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className="cta" {...props}>
      <span className="cta__plus">
        <Plus size={17} aria-hidden="true" />
      </span>
      <span className="cta__label">{children}</span>
    </button>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="note note--err" role="alert">
      <CircleAlert size={16} aria-hidden="true" />
      <span>{message}</span>
      {onRetry && (
        <button type="button" className="btn" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <p>{title}</p>
      {children && <div className="empty__actions">{children}</div>}
    </div>
  );
}

export function Skel({ h = 16, w = '100%' }: { h?: number; w?: number | string }) {
  return <span className="skel" style={{ height: h, width: w }} aria-hidden="true" />;
}

export function SkelRows({ rows = 4, h = 44 }: { rows?: number; h?: number }) {
  return (
    <div className="skel-rows" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skel key={i} h={h} />
      ))}
    </div>
  );
}

/** Native <dialog>: focus trap, inert background and top-layer stacking come from the platform. */
export function Dialog({
  title,
  onClose,
  children,
  narrow,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  narrow?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current!;
    const opener = document.activeElement as HTMLElement | null;
    d.showModal();
    return () => {
      d.close();
      opener?.focus?.();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`dialog${narrow ? ' dialog--narrow' : ''}`}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onMouseDown={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="dialog__inner">
        <header className="dialog__head">
          <h2 id={id}>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}

export function Chips({ items, max }: { items: string[]; max?: number }) {
  const shown = max ? items.slice(0, max) : items;
  const rest = items.slice(shown.length);
  return (
    <span className="chips">
      {shown.map((k) => (
        <span className="chip" key={k} title={k}>
          {k}
        </span>
      ))}
      {rest.length > 0 && (
        <span className="chip chip--more num" title={rest.join(', ')}>
          +{rest.length}
        </span>
      )}
    </span>
  );
}

export function resultWhen(r: Result): { iso: string; label: string } {
  return r.publishedAt
    ? { iso: r.publishedAt, label: relTime(r.publishedAt) }
    : { iso: r.discoveredAt, label: `discovered ${relTime(r.discoveredAt)}` };
}

const at = (handle: string) => `@${handle.replace(/^@/, '')}`;

/** Who/where a result came from, in one short line (used by compact rows). */
export function resultSource(r: Result): string {
  if (r.platform === 'web') return str(r.metadata.domain) ?? hostname(r.url);
  if (r.platform === 'x' && r.author.handle) return at(r.author.handle);
  return r.author.name ?? (r.author.handle ? at(r.author.handle) : 'Unknown author');
}

const LINK_LABEL: Record<Platform, string> = { linkedin: 'View original', x: 'View post', web: 'Read article' };
const TYPE_LABEL = { jobs: 'Jobs', people: 'People', news: 'News', courses: 'Courses', other: 'Other' };
const CLAMP_CHARS = 420;

export function ResultCard({ r }: { r: Result }) {
  const [open, setOpen] = useState(false);
  const when = resultWhen(r);
  const url = safeUrl(r.url);
  const profile = safeUrl(r.author.profileUrl);
  const handle = r.author.handle ? at(r.author.handle) : null;
  const long = r.content.length > CLAMP_CHARS || r.content.split('\n').length > 6;
  const domain = str(r.metadata.domain) ?? hostname(r.url);
  const headline = str(r.metadata.headline);

  const name = (text: string) =>
    profile ? (
      <a href={profile} target="_blank" rel="noopener noreferrer">
        {text}
      </a>
    ) : (
      text
    );

  return (
    <article className="result">
      <header className="result__top">
        <span className="result__src">
          <PlatformBadge platform={r.platform} />
          <span className="tag">{TYPE_LABEL[r.contentType]}</span>
          {r.platform === 'web' && domain && (
            <span className="result__domain" title={domain}>
              {domain}
            </span>
          )}
        </span>
        <time className="result__time num" dateTime={when.iso}>
          {when.label}
          <span className="result__abs"> · {absTime(when.iso)}</span>
        </time>
      </header>

      {r.platform === 'linkedin' && (
        <div className="result__who">
          <strong>{name(r.author.name ?? handle ?? 'Unknown author')}</strong>
          {headline && <span>{headline}</span>}
        </div>
      )}
      {r.platform === 'x' && (
        <div className="result__who result__who--inline">
          <strong>{name(handle ?? r.author.name ?? 'Unknown author')}</strong>
          {handle && r.author.name && <span>· {r.author.name}</span>}
        </div>
      )}
      {r.platform === 'web' && (r.title || r.author.name) && (
        <div className="result__who">
          {r.title && <h3>{r.title}</h3>}
          {r.author.name && <span>{r.author.name}</span>}
        </div>
      )}
      {r.platform !== 'web' && r.title && <h3 className="result__title">{r.title}</h3>}

      {r.content && <p className={`result__body${long && !open ? ' is-clamped' : ''}`}>{r.content}</p>}
      {long && (
        <button type="button" className="link-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Show less' : 'Show more'}
        </button>
      )}

      <footer className="result__foot">
        <span className="result__matched">
          <span className="micro">{r.matchVerified ? 'Matched' : 'Search query'}</span>
          <Chips items={r.matchedKeywords} />
        </span>
        {url && (
          <a className="result__link" href={url} target="_blank" rel="noopener noreferrer">
            {LINK_LABEL[r.platform]}
            <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        )}
      </footer>
      {!r.matchVerified && <p className="result__warning">Keyword match could not be verified from this page’s title or search snippet.</p>}
    </article>
  );
}
