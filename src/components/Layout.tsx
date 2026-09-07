import { useState, useEffect } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBookOpen, faSun, faMoon, faGlobe } from '@fortawesome/free-solid-svg-icons';
import { api } from '../api';
import './Layout.css';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('storytime_theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return 'light';
  });

  const [activeUniverse, setActiveUniverse] = useState<{ id: string; title: string } | null>(() => {
    const id = localStorage.getItem('storytime_active_universe_id');
    const title = localStorage.getItem('storytime_active_universe_title');
    return id ? { id, title: title || 'Active Universe' } : null;
  });

  const location = useLocation();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('storytime_theme', theme);
  }, [theme]);

  // Listen to custom universe change events across components
  useEffect(() => {
    const handleUniverseChanged = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.id) {
        setActiveUniverse({ id: detail.id, title: detail.title || 'Active Universe' });
      }
    };
    window.addEventListener('storytime:active_universe_changed', handleUniverseChanged);
    return () => {
      window.removeEventListener('storytime:active_universe_changed', handleUniverseChanged);
    };
  }, []);

  // Update active universe on route change if visiting a universe page
  useEffect(() => {
    const m = location.pathname.match(/^\/(?:projects|universes|create)\/([a-zA-Z0-9_-]+)/);
    const routeId = m ? m[1] : null;
    if (routeId) {
      const savedId = localStorage.getItem('storytime_active_universe_id');
      const savedTitle = localStorage.getItem('storytime_active_universe_title');
      if (savedId === routeId && savedTitle) {
        setActiveUniverse({ id: routeId, title: savedTitle });
      } else {
        api.stories.get(routeId).then((story) => {
          if (story && story.id) {
            setActiveUniverse({ id: story.id, title: story.title || 'Active Universe' });
            localStorage.setItem('storytime_active_universe_id', story.id);
            localStorage.setItem('storytime_active_universe_title', story.title || 'Active Universe');
          }
        }).catch(() => {});
      }
    }
  }, [location.pathname]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <div className="layout">
      <nav className="navbar">
        <div className="nav-container">
          <Link to="/" className="nav-logo">
            <FontAwesomeIcon icon={faBookOpen} className="logo-icon" /> Contesora
          </Link>
          <div className="nav-links">
            {activeUniverse && (
              <Link
                to={`/projects/${activeUniverse.id}`}
                className="active-universe-nav-pill"
                title={`Active universe: ${activeUniverse.title}`}
              >
                <FontAwesomeIcon icon={faGlobe} className="nav-globe-icon" />
                <span>{activeUniverse.title}</span>
              </Link>
            )}
            <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              Home
            </NavLink>
            <NavLink to="/projects" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              Universes
            </NavLink>
            <NavLink to="/create" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              + New Universe
            </NavLink>
            <NavLink to="/drafts" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              Drafts Queue
            </NavLink>
            <NavLink to="/tools" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              Studio Tools
            </NavLink>
            <button
              onClick={toggleTheme}
              className="theme-toggle-btn"
              title={theme === 'light' ? 'Switch to Obsidian Dark' : 'Switch to Warm Paper Light'}
            >
              <FontAwesomeIcon icon={theme === 'light' ? faMoon : faSun} />
            </button>
          </div>
        </div>
      </nav>
      <main className="main-content">
        {children}
      </main>
      <footer className="footer">
        <p>&copy; 2026 Contesora · Every story finds its place</p>
      </footer>
    </div>
  );
}
