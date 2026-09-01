import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Story, ProjectType } from '../types/story';
import { api } from '../api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faTrashCan, faGlobe, faUsers, faMap, faLandmark,
  faRoute, faDragon, faWandMagicSparkles, faBookOpen,
} from '@fortawesome/free-solid-svg-icons';
import './Stories.css';

export default function Projects() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ProjectType | 'all'>('all');

  useEffect(() => {
    const type = filter === 'all' ? undefined : filter;
    setLoading(true);
    api.stories.list(type)
      .then(setProjects)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [filter]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this universe project? This cannot be undone.')) return;
    try {
      await api.stories.delete(id);
      setProjects(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  return (
    <div className="stories-page">
      <div className="stories-header">
        <h1>Universe Encyclopedias</h1>
        <p>Durable setting canon, world facts, and lorebooks for downstream derivatives</p>
      </div>

      <div className="stories-filters">
        <div className="filter-tabs">
          <button className={`filter-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
            All Projects
          </button>
          <button className={`filter-btn ${filter === 'universe' ? 'active' : ''}`} onClick={() => setFilter('universe')}>
            <FontAwesomeIcon icon={faGlobe} /> Universes
          </button>
        </div>
        <Link to="/create" className="new-story-link">+ New Universe</Link>
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', padding: '2rem' }}>Loading universe encyclopedias...</p>
      ) : projects.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ fontSize: '1.1rem', color: '#94a3b8' }}>No universe encyclopedias yet. Build your first setting canon!</p>
          <div style={{ marginTop: '1.5rem' }}>
            <Link to="/create" className="cta-button" style={{ display: 'inline-block' }}>
              + Create Universe Encyclopedia
            </Link>
          </div>
        </div>
      ) : (
        <div className="stories-grid">
          {projects.map((project) => {
            const counts = project.counts || {
              characters: project.characters?.length || 0,
              locations: 0,
              factions: 0,
              timelineEvents: 0,
              bestiary: 0,
              drafts: 0,
            };
            const isUniverse = (project.type || 'universe') === 'universe';

            return (
              <div
                key={project.id}
                className="story-card"
                onClick={() => navigate(`/projects/${project.id}`)}
                style={{ display: 'flex', flexDirection: 'column', cursor: 'pointer' }}
              >
                <div className="story-card-header">
                  <span className={`project-type-badge ${isUniverse ? 'badge-universe' : 'badge-' + project.type}`}
                        style={{ background: isUniverse ? '#0284c7' : undefined, color: '#fff' }}>
                    <FontAwesomeIcon icon={isUniverse ? faGlobe : faBookOpen} />
                    {' '}{isUniverse ? 'Universe Encyclopedia' : (project.type || 'Universe')}
                  </span>
                </div>
                <h3 style={{ marginTop: '0.5rem' }}>{project.title || 'Untitled Universe'}</h3>
                {project.author && <p className="story-author">by {project.author}</p>}
                <p className="story-excerpt" style={{ flexGrow: 1 }}>
                  {project.description || project.content
                    ? (project.description || project.content || '').substring(0, 160) +
                      ((project.description || project.content || '').length > 160 ? '...' : '')
                    : 'No lore summary recorded yet.'}
                </p>

                {/* Canon dimension counts */}
                <div className="story-stats" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem 0.8rem', fontSize: '0.78rem', color: '#94a3b8', margin: '0.75rem 0' }}>
                  <span><FontAwesomeIcon icon={faUsers} /> {counts.characters} characters</span>
                  <span><FontAwesomeIcon icon={faMap} /> {counts.locations} places</span>
                  <span><FontAwesomeIcon icon={faLandmark} /> {counts.factions} factions</span>
                  <span><FontAwesomeIcon icon={faRoute} /> {counts.timelineEvents} events</span>
                  <span><FontAwesomeIcon icon={faDragon} /> {counts.bestiary} bestiary</span>
                  {counts.drafts > 0 && (
                    <span style={{ color: '#eab308' }}><FontAwesomeIcon icon={faWandMagicSparkles} /> {counts.drafts} drafts</span>
                  )}
                </div>

                <div className="story-actions" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.75rem' }}>
                  <Link
                    to={`/projects/${project.id}`}
                    className="read-button"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Open Encyclopedia
                  </Link>
                  <button
                    className="delete-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(project.id);
                    }}
                  >
                    <FontAwesomeIcon icon={faTrashCan} /> Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
