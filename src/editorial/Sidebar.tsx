import { useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { UniverseSummary } from './types';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
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

  // Keyboard accessibility: handle Escape to close mobile drawer
  useEffect(() => {
    if (!mobileOpen || !onCloseMobile) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseMobile();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen, onCloseMobile]);

  // Global Navigation Items
  const globalItems: NavItemConfig[] = [
    { id: 'dashboard', label: 'Dashboard', to: '/editorial', icon: faHouse, end: true },
    { id: 'universes', label: 'Universes', to: '/editorial/universes', icon: faBookAtlas },
    { id: 'library', label: 'Library', to: '/editorial/library', icon: faBookBookmark },
    { id: 'compendium', label: 'Shared Compendium', to: '/editorial/compendium', icon: faLayerGroup },
    { id: 'search', label: 'Search', to: '/editorial/search', icon: faMagnifyingGlass },
  ];

  // Universe-scoped Navigation Items
  const universeBase = universe ? `/editorial/universes/${encodeURIComponent(universe.id)}` : '';
  const universeItems: NavItemConfig[] = universe
    ? [
        { id: 'overview', label: 'Overview', to: `${universeBase}`, icon: faCompass, end: true },
        { id: 'development', label: 'Development', to: `${universeBase}/development`, icon: faBrain },
        { id: 'encyclopedia', label: 'Encyclopedia', to: `${universeBase}/encyclopedia`, icon: faBook },
        {
          id: 'characters',
          label: 'Characters',
          to: `${universeBase}/characters`,
          icon: faUsers,
          badge: universe.canonCounts?.characters,
        },
        {
          id: 'world',
          label: 'World',
          to: `${universeBase}/world`,
          icon: faEarthAmericas,
          badge: universe.canonCounts?.locations,
        },
        {
          id: 'history',
          label: 'History',
          to: `${universeBase}/history`,
          icon: faClockRotateLeft,
          badge: universe.canonCounts?.timelineEvents,
        },
        {
          id: 'societies',
          label: 'Societies',
          to: `${universeBase}/societies`,
          icon: faBuildingColumns,
          badge: universe.canonCounts?.factions,
        },
        {
          id: 'bestiary',
          label: 'Bestiary',
          to: `${universeBase}/bestiary`,
          icon: faDragon,
          badge: universe.canonCounts?.bestiaryEntries,
        },
        {
          id: 'works',
          label: 'Works',
          to: `${universeBase}/works`,
          icon: faFeatherPointed,
          badge: universe.worksCount,
        },
        { id: 'media', label: 'Media', to: `${universeBase}/media`, icon: faPhotoFilm },
        { id: 'settings', label: 'Settings', to: `${universeBase}/settings`, icon: faGear },
      ]
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

  return (
    <>
      {/* Mobile/Tablet Backdrop */}
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
        className={`editorial-shell__sidebar ${collapsed ? 'editorial-shell__sidebar--collapsed' : ''} ${
          mobileOpen ? 'editorial-shell__sidebar--open' : ''
        }`}
        aria-label="Editorial Navigation"
      >
        <div className="editorial-sidebar">
          {/* Header & Brand */}
          <div className="editorial-sidebar__header">
            <NavLink
              to="/editorial"
              className="editorial-sidebar__brand"
              onClick={handleLinkClick}
              title={collapsed ? 'StoryTime Editorial' : undefined}
            >
              <span className="editorial-sidebar__brand-mark" aria-hidden="true">
                ST
              </span>
              <span>StoryTime</span>
            </NavLink>

            {/* Mobile close button */}
            {mobileOpen && (
              <button
                type="button"
                className="editorial-sidebar__toggle"
                onClick={onCloseMobile}
                aria-label="Close navigation sidebar"
                title="Close sidebar"
              >
                <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
              </button>
            )}

            {/* Desktop collapse toggle */}
            {!mobileOpen && onToggleCollapse && (
              <button
                type="button"
                className="editorial-sidebar__toggle"
                onClick={onToggleCollapse}
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                <FontAwesomeIcon
                  icon={collapsed ? faChevronRight : faChevronLeft}
                  aria-hidden="true"
                />
              </button>
            )}
          </div>

          {/* Universe Identity Card / Selector (When inside a universe) */}
          {universe && (
            <div className="editorial-sidebar__universe-picker">
              <span className="editorial-sidebar__universe-label">Active Universe</span>
              {onSelectUniverse ? (
                <button
                  type="button"
                  className="editorial-sidebar__universe-title"
                  onClick={onSelectUniverse}
                  title={`Switch universe (Current: ${universe.title})`}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                  }}
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

          {/* Universe Navigation Section (Rendered when inside a universe) */}
          {universe && (
            <nav aria-label="Universe Sections">
              <div className="editorial-sidebar__section-label">Universe</div>
              <ul className="editorial-sidebar__nav">
                {universeItems.map((item) => (
                  <li key={item.id}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      onClick={handleLinkClick}
                      className={({ isActive }) =>
                        `editorial-sidebar__link ${isActive ? 'editorial-sidebar__link--active' : ''}`
                      }
                      title={collapsed ? item.label : undefined}
                      aria-label={item.label}
                    >
                      <FontAwesomeIcon
                        icon={item.icon}
                        className="editorial-sidebar__icon"
                        aria-hidden="true"
                      />
                      <span className="editorial-sidebar__text">{item.label}</span>
                      {hasPositiveBadge(item.badge) && (
                        <span className="editorial-sidebar__badge" aria-label={`${item.badge} items`}>
                          {item.badge}
                        </span>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          {/* Global Navigation Section */}
          <nav aria-label="Global Workspace">
            <div className="editorial-sidebar__section-label">Global</div>
            <ul className="editorial-sidebar__nav">
              {globalItems.map((item) => (
                <li key={item.id}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={handleLinkClick}
                    className={({ isActive }) =>
                      `editorial-sidebar__link ${isActive ? 'editorial-sidebar__link--active' : ''}`
                    }
                    title={collapsed ? item.label : undefined}
                    aria-label={item.label}
                  >
                    <FontAwesomeIcon
                      icon={item.icon}
                      className="editorial-sidebar__icon"
                      aria-hidden="true"
                    />
                    <span className="editorial-sidebar__text">{item.label}</span>
                    {hasPositiveBadge(item.badge) && (
                      <span className="editorial-sidebar__badge">{item.badge}</span>
                    )}
                  </NavLink>
                </li>
              ))}

              {/* New Universe Action */}
              <li>
                {onNewUniverse ? (
                  <button
                    type="button"
                    onClick={() => {
                      handleLinkClick();
                      onNewUniverse();
                    }}
                    className="editorial-sidebar__link"
                    style={{
                      width: '100%',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                    title={collapsed ? 'New Universe' : undefined}
                    aria-label="New Universe"
                  >
                    <FontAwesomeIcon
                      icon={faPlus}
                      className="editorial-sidebar__icon"
                      aria-hidden="true"
                    />
                    <span className="editorial-sidebar__text">New Universe</span>
                  </button>
                ) : (
                  <NavLink
                    to="/editorial/universes/new"
                    onClick={handleLinkClick}
                    className={({ isActive }) =>
                      `editorial-sidebar__link ${isActive ? 'editorial-sidebar__link--active' : ''}`
                    }
                    title={collapsed ? 'New Universe' : undefined}
                    aria-label="New Universe"
                  >
                    <FontAwesomeIcon
                      icon={faPlus}
                      className="editorial-sidebar__icon"
                      aria-hidden="true"
                    />
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
