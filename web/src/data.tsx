import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, errMsg, type Monitor, type Stats, type SystemInfo } from './api.ts';

export type Theme = 'dark' | 'light';

interface Data {
  monitors: Monitor[] | null;
  stats: Stats | null;
  system: SystemInfo | null;
  /** Set when the last poll failed (stale data, if any, is kept). */
  error: string | null;
  /** Increments after every poll; pages use it to refresh their own queries. */
  tick: number;
  refresh: () => Promise<void>;
  checkSystem: () => Promise<void>;
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const Ctx = createContext<Data | null>(null);

export function useData(): Data {
  const d = useContext(Ctx);
  if (!d) throw new Error('useData outside DataProvider');
  return d;
}

function storedTheme(): Theme {
  try {
    return localStorage.getItem('km-theme') === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [monitors, setMonitors] = useState<Monitor[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [theme, setThemeState] = useState<Theme>(storedTheme);

  const checkSystem = useCallback(async () => {
    try {
      setSystem(await api.system());
    } catch {
      setSystem(null);
    }
  }, []);

  const refresh = useCallback(async () => {
    const [m, s] = await Promise.allSettled([api.monitors(), api.stats()]);
    if (m.status === 'fulfilled') setMonitors(m.value);
    if (s.status === 'fulfilled') setStats(s.value);
    const failed = m.status === 'rejected' ? m.reason : s.status === 'rejected' ? s.reason : null;
    setError(failed ? errMsg(failed) : null);
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    void refresh();
    void checkSystem();
  }, [refresh, checkSystem]);

  // The service came back (or was never reachable at mount): pick up system info without polling it.
  const reachable = !error && monitors !== null;
  useEffect(() => {
    if (reachable && !system) void checkSystem();
  }, [reachable, system, checkSystem]);

  // 5s while a run is in flight, 30s otherwise; nothing while the tab is hidden.
  const running = !!monitors?.some((m) => m.running);
  useEffect(() => {
    const poll = () => {
      if (!document.hidden) void refresh();
    };
    const timer = setInterval(poll, running ? 5000 : 30000);
    document.addEventListener('visibilitychange', poll);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', poll);
    };
  }, [running, refresh]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem('km-theme', t);
    } catch {
      /* storage unavailable: the choice just won't persist */
    }
  }, []);

  return (
    <Ctx.Provider value={{ monitors, stats, system, error, tick, refresh, checkSystem, theme, setTheme }}>
      {children}
    </Ctx.Provider>
  );
}

/** Load on mount and whenever deps change. Keeps the previous data while refetching or on error. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({
    data: null,
    error: null,
    loading: true,
  });
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    fn().then(
      (data) => live && setState({ data, error: null, loading: false }),
      (e) => live && setState((s) => ({ ...s, error: errMsg(e), loading: false })),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return { ...state, reload: () => setN((x) => x + 1) };
}
