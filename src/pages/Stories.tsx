import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { Story, ProjectType } from '../types/story';
import { api } from '../api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrashCan, faPenNib, faDragon } from '@fortawesome/free-solid-svg-icons';
import './Stories.css';

export default function Projects() {
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
    if (!confirm('Delete this project? This cannot be undone.')) return;
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
        <h1>Your Projects</h1>
        <p>Stories and campaigns saved locally</p>
      </div>

      <div className="stories-filters">
        <div className="filter-tabs">
          <button className={`filter-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>All</button>
          <button className={`filter-btn ${filter === 'story' ? 'active' : ''}`} onClick={() => setFilter('story')}>
            <FontAwesomeIcon icon={faPenNib} /> Stories
          </button>
          <button className={`filter-btn ${filter === 'campaign' ? 'active' : ''}`} onClick={() => setFilter('campaign')}>
            <FontAwesomeIcon icon={faDragon} /> Campaigns
          </button>
        </div>
        <Link to="/create" className="new-story-link">+ New Project</Link>
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', padding: '2rem' }}>Loading projects...</p>
      ) : projects.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <p>No projects yet. Start creating!</p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1rem' }}>
            <Link to="/create?type=story" className="cta-button" style={{ display: 'inline-block' }}>New Story</Link>
            <Link to="/create?type=campaign" className="cta-button" style={{ display: 'inline-block' }}>New Campaign</Link>
          </div>
        </div>
      ) : (
        <div className="stories-grid">
          {projects.map((project) => (
            <div key={project.id} className="story-card">
              <div className="story-card-header">
                <span className={`project-type-badge badge-${project.type || 'story'}`}>
                  <FontAwesomeIcon icon={project.type === 'campaign' ? faDragon : faPenNib} />
                  {' '}{project.type === 'campaign' ? 'Campaign' : 'Story'}
                </span>
              </div>
              <h3>{project.title || 'Untitled Project'}</h3>
              {project.author && <p className="story-author">by {project.author}</p>}
              <p className="story-excerpt">
                {project.description || project.content
                  ? (project.description || project.content || '').substring(0, 150) +
                    ((project.description || project.content || '').length > 150 ? '...' : '')
                  : 'No content yet'}
              </p>
              <div className="story-stats">
                <span>{project.characters?.length || 0} characters</span>
                <span>{project.content?.split(/\s+/).filter(Boolean).length || 0} words</span>
              </div>
              <div className="story-actions">
                <Link to={`/create/${project.id}`} className="read-button">Edit</Link>
                <button className="delete-button" onClick={() => handleDelete(project.id)}>
                  <FontAwesomeIcon icon={faTrashCan} /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
