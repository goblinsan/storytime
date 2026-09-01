import { useState, useEffect } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBookOpen, faSun, faMoon, faGlobe } from '@fortawesome/free-solid-svg-icons';
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

  const [activeUniverse, setActiveUniverse] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('storytime_theme', theme);
  }, [theme]);

  useEffect(() => {
    const id = localStorage.getItem('storytime_active_universe_id');
    const title = localStorage.getItem('storytime_active_universe_title');
    if (id) {
      setActiveUniverse({ id, title: title || 'Active Universe' });
    }
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <div className="layout">
      <nav className="navbar">
        <div className="nav-container">
          <Link to="/" className="nav-logo">
            <FontAwesomeIcon icon={faBookOpen} className="logo-icon" /> StoryTime
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
        <p>&copy; 2026 StoryTime: Universe encyclopedia and canon catalog for worldbuilding and derivative works</p>
      </footer>
    </div>
  );
}
