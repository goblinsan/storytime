import { useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { UniverseSummary } from './types';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  compendiumPath,
  dashboardPath,
  libraryPath,
  newUniversePath,
  searchPath,
  universePath,
  universeSectionPath,
  universesPath,
  type UniverseSection,
} from './paths';
import {
  faHouse,
  faBookAtlas,
  faBookBookmark,
  faLayerGroup,
  faMagnifyingGlass,
  faPlus,
  faCompass,
  faBrain,
  faBook,
  faUsers,
  faEarthAmericas,
  faClockRotateLeft,
  faBuildingColumns,
  faDragon,
  faFeatherPointed,
  faPhotoFilm,
  faGear,
  faChevronLeft,
  faChevronRight,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';

export interface EditorialSidebarProps {
  /**
   * Active universe identity when inside a universe context.
   * If null/undefined, sidebar renders in global navigation mode.
   */
  universe?: UniverseSummary | null;
  /**
   * Controlled collapsed state of the desktop sidebar (68px vs 248px).
   */
  collapsed?: boolean;
  /**
   * Callback fired when the desktop collapse toggle is invoked.
   */
  onToggleCollapse?: () => void;
  /**
   * Controlled open state for responsive mobile/tablet drawer.
   */
  mobileOpen?: boolean;
  /**
   * Callback to close the mobile drawer (e.g. on backdrop click, route click, or Escape).
   */
  onCloseMobile?: () => void;
  /**
   * Optional callback when New Universe action is clicked.
   */
  onNewUniverse?: () => void;
  /**
   * Optional callback when universe switcher is clicked.
   */
  onSelectUniverse?: () => void;
}

interface NavItemConfig {
  id: string;
  label: string;
  to: string;
  icon: IconDefinition;
  badge?: number | string;
  end?: boolean;
}

const UNIVERSE_SECTIONS: Array<{
  id: UniverseSection | 'overview';
  label: string;
  icon: IconDefinition;
  count?: (universe: UniverseSummary) => number | undefined;
}> = [
  { id: 'overview', label: 'Overview', icon: faCompass },
  { id: 'direction', label: 'Direction', icon: faBrain },
  { id: 'encyclopedia', label: 'Encyclopedia', icon: faBook },
  { id: 'characters', label: 'Characters', icon: faUsers, count: (u) => u.canonCounts?.characters },
  { id: 'geography', label: 'Geography', icon: faEarthAmericas, count: (u) => u.canonCounts?.locations },
  { id: 'timeline', label: 'Timeline', icon: faClockRotateLeft, count: (u) => u.canonCounts?.timelineEvents },
  { id: 'societies', label: 'Societies', icon: faBuildingColumns, count: (u) => u.canonCounts?.factions },
  { id: 'bestiary', label: 'Bestiary', icon: faDragon, count: (u) => u.canonCounts?.bestiaryEntries },
  { id: 'works', label: 'Works', icon: faFeatherPointed, count: (u) => u.worksCount },
  { id: 'media', label: 'Media', icon: faPhotoFilm },
  { id: 'settings', label: 'Settings', icon: faGear },
];

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Sidebar({
  universe,
  collapsed = false,
  onToggleCollapse,
  mobileOpen = false,
  onCloseMobile,
  onNewUniverse,
  onSelectUniverse,
}: EditorialSidebarProps) {
  const sidebarRef = useRef<HTMLElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // Drawer focus contract: entering the drawer moves focus into it, Tab stays
  // inside it while the backdrop covers the page, and closing returns focus to
  // whatever opened it. Without the trap, tabbing past the last link lands on
  // page content the backdrop is covering.
  useEffect(() => {
    if (!mobileOpen) return;

    const drawer = sidebarRef.current;
    if (!drawer) return;

    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const focusable = () => Array.from(drawer.querySelectorAll<HTMLElement>(FOCUSABLE));
    focusable()[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseMobile?.();
        return;
      }

      if (event.key !== 'Tab') return;

      const items = focusable();
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !drawer.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      restoreFocusRef.current?.focus?.();
      restoreFocusRef.current = null;
    };
  }, [mobileOpen, onCloseMobile]);

  const globalItems: NavItemConfig[] = [
    { id: 'dashboard', label: 'Dashboard', to: dashboardPath(), icon: faHouse, end: true },
    { id: 'universes', label: 'Universes', to: universesPath(), icon: faBookAtlas },
    { id: 'library', label: 'Library', to: libraryPath(), icon: faBookBookmark },
    { id: 'compendium', label: 'Shared Compendium', to: compendiumPath(), icon: faLayerGroup },
    { id: 'search', label: 'Search', to: searchPath(), icon: faMagnifyingGlass },
  ];

  const universeItems: NavItemConfig[] = universe
    ? UNIVERSE_SECTIONS.map(({ id, label, icon, count }) => ({
        id,
        label,
        icon,
        to: id === 'overview' ? universePath(universe.id) : universeSectionPath(universe.id, id as UniverseSection),
        end: id === 'overview',
        badge: count?.(universe),
      }))
    : [];

  const handleLinkClick = () => {
    if (mobileOpen && onCloseMobile) {
      onCloseMobile();
    }
  };

  const hasPositiveBadge = (badge?: number | string): boolean => {
    if (badge === undefined || badge === null) return false;
    if (typeof badge === 'number') return badge > 0;
    return Boolean(String(badge).trim());
  };

  const renderItem = (item: NavItemConfig) => (
    <li key={item.id}>
      <NavLink
        to={item.to}
        end={item.end}
        onClick={handleLinkClick}
        className={({ isActive }) =>
          isActive ? 'editorial-sidebar__link editorial-sidebar__link--active' : 'editorial-sidebar__link'
        }
        title={collapsed ? item.label : undefined}
        // Collapsed hides the label and the badge, so the link needs a name of
        // its own. Expanded, the label and count are in the markup and become
        // the accessible name ("Characters 24") without any ARIA.
        aria-label={collapsed ? item.label : undefined}
      >
        <FontAwesomeIcon icon={item.icon} className="editorial-sidebar__icon" aria-hidden="true" />
        <span className="editorial-sidebar__text">{item.label}</span>
        {hasPositiveBadge(item.badge) && (
          <span className="editorial-sidebar__badge">{item.badge}</span>
        )}
      </NavLink>
    </li>
  );

  return (
    <>
      {mobileOpen && (
        <div
          className="editorial-sidebar-backdrop editorial-sidebar-backdrop--visible"
          role="presentation"
          aria-hidden="true"
          onClick={onCloseMobile}
        />
      )}

      <aside
        ref={sidebarRef}
        className={[
          'editorial-shell__sidebar',
          collapsed ? 'editorial-shell__sidebar--collapsed' : '',
          mobileOpen ? 'editorial-shell__sidebar--open' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label="Editorial Navigation"
      >
        <div className="editorial-sidebar">
          <div className="editorial-sidebar__header">
            <NavLink
              to={dashboardPath()}
              className="editorial-sidebar__brand"
              onClick={handleLinkClick}
              title={collapsed ? 'Contesora' : undefined}
            >
              {/* The mark, as the artwork rather than as a redrawing of it.
                  It is loaded by path instead of imported so that a missing
                  file is a missing image and not a failed build: until the
                  asset is dropped in, the brand is the wordmark alone, which
                  is a mark in its own right rather than a broken one. */}
              <img
                className="editorial-sidebar__emblem"
                src={`${import.meta.env.BASE_URL}brand/contesora-mark.png`}
                alt=""
                width={28}
                height={28}
                onError={(e) => { e.currentTarget.hidden = true; }}
              />
              <span className="editorial-sidebar__wordmark">Contesora</span>
            </NavLink>

            {mobileOpen && (
              <button
                type="button"
                className="editorial-button editorial-button--icon editorial-sidebar__toggle"
                onClick={onCloseMobile}
                aria-label="Close navigation sidebar"
                title="Close sidebar"
              >
                <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
              </button>
            )}

            {!mobileOpen && onToggleCollapse && (
              <button
                type="button"
                className="editorial-button editorial-button--icon editorial-sidebar__toggle"
                onClick={onToggleCollapse}
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                aria-expanded={!collapsed}
              >
                <FontAwesomeIcon icon={collapsed ? faChevronRight : faChevronLeft} aria-hidden="true" />
              </button>
            )}
          </div>

          {universe && (
            <div className="editorial-sidebar__universe-picker">
              <span className="editorial-sidebar__universe-label">Active Universe</span>
              {onSelectUniverse ? (
                <button
                  type="button"
                  className="editorial-button editorial-button--ghost editorial-sidebar__universe-title editorial-sidebar__universe-switch"
                  onClick={onSelectUniverse}
                  title={`Switch universe (current: ${universe.title})`}
                >
                  {universe.title}
                </button>
              ) : (
                <span className="editorial-sidebar__universe-title" title={universe.title}>
                  {universe.title}
                </span>
              )}
            </div>
          )}

          {universe && (
            <nav aria-label="Universe Sections">
              <div className="editorial-sidebar__section-label">Universe</div>
              <ul className="editorial-sidebar__nav">{universeItems.map(renderItem)}</ul>
            </nav>
          )}

          <nav aria-label="Global Workspace">
            <div className="editorial-sidebar__section-label">Global</div>
            <ul className="editorial-sidebar__nav">
              {globalItems.map(renderItem)}

              <li>
                {onNewUniverse ? (
                  <button
                    type="button"
                    onClick={() => {
                      handleLinkClick();
                      onNewUniverse();
                    }}
                    className="editorial-link editorial-link--nav editorial-sidebar__link editorial-sidebar__link--action"
                    title={collapsed ? 'New Universe' : undefined}
                    aria-label={collapsed ? 'New Universe' : undefined}
                  >
                    <FontAwesomeIcon icon={faPlus} className="editorial-sidebar__icon" aria-hidden="true" />
                    <span className="editorial-sidebar__text">New Universe</span>
                  </button>
                ) : (
                  <NavLink
                    to={newUniversePath()}
                    onClick={handleLinkClick}
                    className={({ isActive }) =>
                      isActive ? 'editorial-sidebar__link editorial-sidebar__link--active' : 'editorial-sidebar__link'
                    }
                    title={collapsed ? 'New Universe' : undefined}
                    aria-label={collapsed ? 'New Universe' : undefined}
                  >
                    <FontAwesomeIcon icon={faPlus} className="editorial-sidebar__icon" aria-hidden="true" />
                    <span className="editorial-sidebar__text">New Universe</span>
                  </NavLink>
                )}
              </li>
            </ul>
          </nav>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
