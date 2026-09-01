import { Link, NavLink } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBookOpen } from '@fortawesome/free-solid-svg-icons';
import './Layout.css';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="layout">
      <nav className="navbar">
        <div className="nav-container">
          <Link to="/" className="nav-logo">
            <FontAwesomeIcon icon={faBookOpen} /> StoryTime
          </Link>
          <div className="nav-links">
            <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              Home
            </NavLink>
            <NavLink to="/create" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              + New Universe
            </NavLink>
            <NavLink to="/projects" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              Universes
            </NavLink>
            <NavLink to="/drafts" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              Draft Reviews
            </NavLink>
            <NavLink to="/tools" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              Tools
            </NavLink>
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
