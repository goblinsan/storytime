import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faUsers, faMap, faLandmark, faChartBar, faArrowRight,
  faRoute, faShieldHalved, faDragon, faWandMagicSparkles, faScroll,
  faGlobe, faPenToSquare,
} from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import type { Story } from '../types/story';
import { api } from '../api';
import './Tools.css';

interface ToolDef {
  title: string;
  icon: IconDefinition;
  description: string;
  tab: string;
}

export default function Tools() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Story[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

  useEffect(() => {
    api.stories.list()
      .then((list) => {
        setProjects(list);
        const savedId = localStorage.getItem('storytime_active_universe_id');
        const match = list.find((p) => p.id === savedId);
        if (match) {
          setSelectedProjectId(match.id);
        } else if (list.length > 0) {
          setSelectedProjectId(list[0].id);
          localStorage.setItem('storytime_active_universe_id', list[0].id);
          localStorage.setItem('storytime_active_universe_title', list[0].title);
        }
      })
      .catch(console.error);
  }, []);

  const handleSelectProject = (id: string) => {
    setSelectedProjectId(id);
    const p = projects.find((proj) => proj.id === id);
    if (p) {
      localStorage.setItem('storytime_active_universe_id', p.id);
      localStorage.setItem('storytime_active_universe_title', p.title);
    }
  };

  const activeProject = projects.find((p) => p.id === selectedProjectId);

  const getToolLink = (tab: string) => {
    if (selectedProjectId) {
      return `/projects/${selectedProjectId}?tab=${tab}`;
    }
    return `/create?tab=${tab}`;
  };

  const canonTools: ToolDef[] = [
    {
      title: 'Geography & World Building',
      icon: faMap,
      description: 'Design world map nodes, territory regions, terrain, and travel routes.',
      tab: 'world',
    },
    {
      title: 'Factions & Culture Studio',
      icon: faLandmark,
      description: 'Document political blocs, diplomatic treaties, strategic goals, and rites.',
      tab: 'culture',
    },
    {
      title: 'Cast & Character Personas',
      icon: faUsers,
      description: 'Develop character lineages, factions loyalties, motivations, and backstories.',
      tab: 'characters',
    },
    {
      title: 'Universe Bestiary',
      icon: faDragon,
      description: 'Catalog regional beasts, tactics, hearts, and ecological threat profiles.',
      tab: 'bestiary',
    },
    {
      title: 'Macro Chronology & Timelines',
      icon: faRoute,
      description: 'Maintain causal historical chronologies and turning points across eras.',
      tab: 'world',
    },
  ];

  const derivativeTools: ToolDef[] = [
    {
      title: 'Campaign & Table Play Studio',
      icon: faShieldHalved,
      description: 'Generate playable session packets, NPC trackers, and live D&D table export bundles.',
      tab: 'derivatives',
    },
    {
      title: 'Narrative Arcs & Story Beats',
      icon: faRoute,
      description: 'Plan multi-beat storylines, chapter progressions, and character arcs.',
      tab: 'arcs',
    },
    {
      title: 'Generated Draft Review & Gates',
      icon: faWandMagicSparkles,
      description: 'Review, test against consistency gates, and promote generated drafts to canon.',
      tab: 'drafts',
    },
    {
      title: 'Project Planning & Tasks',
      icon: faChartBar,
      description: 'Track worldbuilding milestones, writing tasks, and release schedules.',
      tab: 'planning',
    },
    {
      title: 'Lore Research Notes',
      icon: faScroll,
      description: 'Jot down freeform lore fragments, brainstorming snippets, and reference links.',
      tab: 'notes',
    },
  ];

  return (
    <div className="tools-page">
      <div className="tools-header">
        <h1>Universe Studio Tools</h1>
        <p>Tactical authoring tools and worldbuilding workspaces operating on your active universe canon</p>

        {/* Active Universe Picker */}
        <div className="active-universe-bar">
          <div className="active-universe-label">
            <FontAwesomeIcon icon={faGlobe} className="globe-icon" />
            <span>Active Universe Scope:</span>
          </div>
          {projects.length > 0 ? (
            <div className="universe-selector-wrap">
              <select
                className="universe-select"
                value={selectedProjectId}
                onChange={(e) => handleSelectProject(e.target.value)}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title || 'Untitled Universe'}
                  </option>
                ))}
              </select>
              {activeProject && (
                <Link to={`/projects/${activeProject.id}`} className="view-codex-link">
                  <FontAwesomeIcon icon={faPenToSquare} /> Open Codex
                </Link>
              )}
            </div>
          ) : (
            <div className="no-universe-hint">
              <span>No universe created yet.</span>
              <Link to="/create" className="create-universe-inline">+ Create One</Link>
            </div>
          )}
        </div>
      </div>

      <h2 className="tools-section-title">Canon Lore Workspaces</h2>
      <div className="tools-grid">
        {canonTools.map((tool, index) => (
          <Link key={index} to={getToolLink(tool.tab)} className="tool-card">
            <div className="tool-icon"><FontAwesomeIcon icon={tool.icon} /></div>
            <h3>{tool.title}</h3>
            <p>{tool.description}</p>
            <div className="tool-card-footer">
              <span className="tool-scope-badge">
                {activeProject ? activeProject.title : 'New Universe'}
              </span>
              <span className="tool-link-arrow"><FontAwesomeIcon icon={faArrowRight} /></span>
            </div>
          </Link>
        ))}
      </div>

      <h2 className="tools-section-title">Derivative Works &amp; Playcraft</h2>
      <div className="tools-grid">
        {derivativeTools.map((tool, index) => (
          <Link key={index} to={getToolLink(tool.tab)} className="tool-card">
            <div className="tool-icon"><FontAwesomeIcon icon={tool.icon} /></div>
            <h3>{tool.title}</h3>
            <p>{tool.description}</p>
            <div className="tool-card-footer">
              <span className="tool-scope-badge">
                {activeProject ? activeProject.title : 'New Universe'}
              </span>
              <span className="tool-link-arrow"><FontAwesomeIcon icon={faArrowRight} /></span>
            </div>
          </Link>
        ))}
      </div>

      {activeProject && (
        <div className="tools-cta">
          <h2>Ready to expand {activeProject.title}?</h2>
          <p>All tool edits immediately update the universe canon graph and become visible in downstream generation jobs.</p>
          <button
            onClick={() => navigate(`/projects/${activeProject.id}`)}
            className="cta-button"
            style={{ margin: '0 auto' }}
          >
            Enter {activeProject.title} Codex
          </button>
        </div>
      )}
    </div>
  );
}
