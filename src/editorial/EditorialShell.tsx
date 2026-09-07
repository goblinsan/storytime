import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useLocation, useMatch } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBars, faCircleHalfStroke } from '@fortawesome/free-solid-svg-icons';
import Sidebar from './Sidebar';
import { editorialApi } from './api';
import { useAsync } from './useAsync';
import { themeStyle } from './themes';
import { UNIVERSE_ROUTE_PATTERN, dashboardPath, isUniverseId, universePath, universesPath } from './paths';
import type { UniverseSummary } from './types';
import './styles/tokens.css';
import './styles/workspace.css';
import './styles/reader.css';

const COLLAPSED_KEY = 'editorial.sidebar.collapsed';
const THEME_KEY = 'editorial.appearance';

type Appearance = 'light' | 'dark';

function readStored(key: string, fallback: string): string {
  try {
    return window.localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function store(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // A private window or blocked site data is not a reason to fail the shell.
  }
}

/**
 * The editorial workspace frame: sidebar, top bar, and the region every surface
 * renders into. It owns only preferences -- collapsed rail, light/dark -- and
 * the active universe identity the sidebar needs. Domain state belongs to the
 * surfaces themselves.
 */
export default function EditorialShell() {
  const location = useLocation();
  // The shell is a layout route, so it has no path of its own and useParams
  // never sees :id. Match the universe pattern against the location instead.
  const universeMatch = useMatch({ path: UNIVERSE_ROUTE_PATTERN, end: false });
  const matchedId = universeMatch?.params.id;
  const universeId = isUniverseId(matchedId) ? matchedId : null;

  const [collapsed, setCollapsed] = useState(() => readStored(COLLAPSED_KEY, 'false') === 'true');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [drawerRoute, setDrawerRoute] = useState(location.pathname);
  /**
   * Three states, not two: chosen light, chosen dark, and nothing chosen -- in
   * which case the reader's system already answered the question and defaulting
   * to light overrides an answer they gave once for everything.
   */
  const [appearance, setAppearance] = useState<Appearance>(() => {
    const stored = readStored(THEME_KEY, '');
    if (stored === 'dark' || stored === 'light') return stored;
    return typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  // The summary is fetched, but the identity is derived from the route so the
  // universe navigation renders on the first paint rather than appearing a
  // moment later. The fetch only fills in the real title and counts.
  const fetched = useAsync(
    (signal) => (universeId ? editorialApi.getUniverse(universeId, signal) : Promise.resolve(null)),
    [universeId],
  );

  const universe = useMemo<UniverseSummary | null>(() => {
    if (!universeId) return null;
    if (fetched.status === 'ready' && fetched.data) return fetched.data;
    return {
      id: universeId,
      title: universeId,
      description: '',
      canonCounts: {
        characters: 0, locations: 0, factions: 0, timelineEvents: 0,
        bestiaryEntries: 0, technologies: 0, mysterySignals: 0,
        arcs: 0, relationships: 0,
      },
      worksCount: 0,
      concernsCount: 0,
    };
  }, [universeId, fetched.status, fetched.data]);

  // Navigating with the drawer open closes it: leaving it up strands the
  // backdrop over content the reader just moved to, and the back button can
  // change the route without the sidebar's own close ever firing. Adjusted
  // during render rather than in an effect, so there is no second paint with
  // the drawer still covering the new surface.
  if (mobileOpen && drawerRoute !== location.pathname) {
    setDrawerRoute(location.pathname);
    setMobileOpen(false);
  }

  useEffect(() => { store(COLLAPSED_KEY, String(collapsed)); }, [collapsed]);
  useEffect(() => {
    store(THEME_KEY, appearance);
    document.documentElement.dataset.editorialAppearance = appearance;
  }, [appearance]);

  const toggleCollapsed = useCallback(() => setCollapsed((v) => !v), []);
  const openMobile = useCallback(() => {
    setDrawerRoute(location.pathname);
    setMobileOpen(true);
  }, [location.pathname]);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  return (
    <div
      className="editorial-app editorial-shell"
      style={themeStyle(universe?.themeId ?? 'neutral-codex', null, appearance)}
      data-appearance={appearance}
    >
      <Sidebar
        universe={universe}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={closeMobile}
      />

      <div className="editorial-shell__main">
        <header className="editorial-topbar">
          <div className="editorial-topbar__inner">
            <div className="editorial-topbar__leading">
              <button
                type="button"
                className="editorial-button editorial-button--icon editorial-topbar__menu-toggle"
                onClick={openMobile}
                aria-label="Open navigation sidebar"
                aria-expanded={mobileOpen}
              >
                <FontAwesomeIcon icon={faBars} aria-hidden="true" />
              </button>

              <nav className="editorial-topbar__breadcrumbs" aria-label="Breadcrumb">
                <Link className="editorial-topbar__breadcrumb-item" to={dashboardPath()}>StoryTime</Link>
                {universe && (
                  <>
                    <span className="editorial-topbar__breadcrumb-separator" aria-hidden="true">/</span>
                    <Link className="editorial-topbar__breadcrumb-item" to={universesPath()}>Universes</Link>
                    <span className="editorial-topbar__breadcrumb-separator" aria-hidden="true">/</span>
                    <Link className="editorial-topbar__breadcrumb-current" to={universePath(universe.id)}>
                      {universe.title}
                    </Link>
                  </>
                )}
              </nav>
            </div>

            <div className="editorial-topbar__actions">
              <button
                type="button"
                className="editorial-button editorial-button--icon editorial-topbar__menu-toggle"
                onClick={() => setAppearance((v) => (v === 'light' ? 'dark' : 'light'))}
                aria-label={appearance === 'light' ? 'Switch to dark appearance' : 'Switch to light appearance'}
                title={appearance === 'light' ? 'Dark appearance' : 'Light appearance'}
              >
                <FontAwesomeIcon icon={faCircleHalfStroke} aria-hidden="true" />
              </button>
            </div>
          </div>
        </header>

        <main className="editorial-shell__content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
