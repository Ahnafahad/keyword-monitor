import { useState, type FormEvent } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import {
  CircleHelp,
  LayoutDashboard,
  List,
  Moon,
  Radar,
  Search,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Sun,
  TriangleAlert,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useData } from './data.tsx';
import { Mark, Spinner } from './ui.tsx';
import { Dashboard } from './pages/Dashboard.tsx';
import { Results } from './pages/Results.tsx';
import { Monitors } from './pages/Monitors.tsx';
import { Settings } from './pages/Settings.tsx';
import { Onboarding } from './pages/Onboarding.tsx';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, cls: '' },
  { to: '/results', label: 'Results', icon: List, cls: '' },
  { to: '/monitors', label: 'Monitors', icon: Radar, cls: '' },
  { to: '/welcome', label: 'Setup guide', icon: CircleHelp, cls: ' rail__item--end rail__item--desk' },
  { to: '/settings', label: 'Settings', icon: SettingsIcon, cls: '' },
];

/** Takes the avatar's place: a circular local-service / Apify status indicator. */
function SystemIndicator() {
  const { system, error, monitors } = useData();
  const offline = !!error || (!system && monitors !== null);
  const [tone, label, icon] = offline
    ? (['err', 'Local service offline', <WifiOff size={17} aria-hidden="true" />] as const)
    : !system
      ? (['idle', 'Checking connection…', <Spinner />] as const)
      : !system.apify.configured
        ? (['warn', 'Apify not configured', <TriangleAlert size={17} aria-hidden="true" />] as const)
        : !system.apify.ok
          ? (['err', 'Apify token not accepted', <TriangleAlert size={17} aria-hidden="true" />] as const)
          : (['ok', 'Connected to Apify', <Wifi size={17} aria-hidden="true" />] as const);
  return (
    <Link to="/settings" className={`icon-btn sys sys--${tone}`} aria-label={`System status: ${label}`} data-tip={label} data-tip-pos="below">
      {icon}
      <i className="sys__dot" aria-hidden="true" />
    </Link>
  );
}

export function App() {
  const { monitors, theme, setTheme } = useData();
  const navigate = useNavigate();
  const [q, setQ] = useState('');

  const search = (e: FormEvent) => {
    e.preventDefault();
    navigate(q.trim() ? `/results?q=${encodeURIComponent(q.trim())}` : '/results');
  };

  return (
    <div className="app">
      <a className="skip" href="#main">
        Skip to content
      </a>

      <nav className="rail" aria-label="Primary">
        <Link to="/" className="rail__mark" aria-label="Keyword Monitor home">
          <Mark />
        </Link>
        {NAV.map(({ to, label, icon: Icon, cls }) => (
          <NavLink key={to} to={to} end={to === '/'} className={`rail__item${cls}`} aria-label={label} data-tip={label}>
            <Icon size={19} aria-hidden="true" />
            <span className="rail__label">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="main">
        <header className="topbar">
          <form className="search" role="search" onSubmit={search}>
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search monitored results…"
              aria-label="Search monitored results"
            />
          </form>
          <Link to="/results" className="icon-btn topbar__filter" aria-label="Browse and filter results" data-tip="Browse and filter results" data-tip-pos="below">
            <SlidersHorizontal size={17} aria-hidden="true" />
          </Link>
          <div className="topbar__tools">
            <div className="theme" role="group" aria-label="Theme">
              <button type="button" aria-label="Light theme" aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>
                <Sun size={17} aria-hidden="true" />
              </button>
              <button type="button" aria-label="Dark theme" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>
                <Moon size={17} aria-hidden="true" />
              </button>
            </div>
            <SystemIndicator />
          </div>
        </header>

        <main id="main" className="content" tabIndex={-1}>
          <Routes>
            <Route path="/" element={monitors?.length === 0 ? <Navigate to="/welcome" replace /> : <Dashboard />} />
            <Route path="/welcome" element={<Onboarding />} />
            <Route path="/results" element={<Results />} />
            <Route path="/monitors" element={<Monitors />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
