import { Link } from 'react-router-dom';
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
            <Link to="/" className="nav-link">Home</Link>
            <Link to="/create" className="nav-link">New Project</Link>
            <Link to="/projects" className="nav-link">Browse Projects</Link>
            <Link to="/tools" className="nav-link">Tools</Link>
          </div>
        </div>
      </nav>
      <main className="main-content">
        {children}
      </main>
      <footer className="footer">
        <p>&copy; 2024 StoryTime - Framework for storytelling & campaigns</p>
      </footer>
    </div>
  );
}
