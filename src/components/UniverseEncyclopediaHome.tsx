import { useState, useEffect } from 'react';
import { api } from '../api';
import type { UniverseEncyclopedia } from '../types/story';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faUsers, faMap, faLandmark, faRoute,
  faDragon, faComments, faWandMagicSparkles, faScroll,
  faSpinner, faArrowRight, faPenNib, faStopwatch, faBookOpen,
} from '@fortawesome/free-solid-svg-icons';
import './UniverseEncyclopediaHome.css';

interface Props {
  projectId: string | null;
  onSelectTab: (tabId: string, entityId?: string) => void;
}

export default function UniverseEncyclopediaHome({ projectId, onSelectTab }: Props) {
  const [data, setData] = useState<UniverseEncyclopedia | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    api.stories.getEncyclopedia(projectId)
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [projectId]);

  if (!projectId) {
    return (
      <div className="encyclopedia-home">
        <div className="encyclopedia-hero">
          <div className="universe-badge">New Universe</div>
          <h2 className="encyclopedia-title">Drafting a New Setting Encyclopedia</h2>
          <p className="encyclopedia-desc">
            Save this universe project above to begin populating geography, factions, characters,
            timelines, and bestiaries into durable canon.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', color: '#ef4444', textAlign: 'center' }}>
        Failed to load universe encyclopedia: {error}
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
        <FontAwesomeIcon icon={faSpinner} spin size="2x" />
        <p style={{ marginTop: '1rem' }}>Loading universe encyclopedia canon...</p>
      </div>
    );
  }

  const project = data.project || { title: 'Untitled Universe', description: '' };
  const counts = data.counts || {
    characters: 0,
    locations: 0,
    factions: 0,
    timelineEvents: 0,
    bestiary: 0,
    religions: 0,
    languages: 0,
    cultures: 0,
    drafts: 0,
    derivatives: 0,
    arcs: 0,
  };
  const catalog = data.catalog || {
    characters: [],
    locations: [],
    factions: [],
    timelineEvents: [],
    bestiary: [],
  };

  return (
    <div className="encyclopedia-home">
      {/* 1. Universe Overview Header */}
      <div className="encyclopedia-hero">
        <div className="universe-badge">Universe Canon Encyclopedia</div>
        <h1 className="encyclopedia-title">{project.title || 'Untitled Universe'}</h1>
        {project.description ? (
          <p className="encyclopedia-desc">{project.description}</p>
        ) : (
          <p className="encyclopedia-desc" style={{ fontStyle: 'italic', color: '#64748b' }}>
            No overview recorded for this universe. Add setting premises, high concepts, and cosmic rules below.
          </p>
        )}
      </div>

      {/* 2. Dimension Counts & Quick Links Bar */}
      <div className="encyclopedia-stats-bar">
        <button className="stat-pill" onClick={() => onSelectTab('characters')}>
          <FontAwesomeIcon icon={faUsers} />
          <span>Cast:</span>
          <span className="stat-count">{counts.characters}</span>
        </button>
        <button className="stat-pill" onClick={() => onSelectTab('world')}>
          <FontAwesomeIcon icon={faMap} />
          <span>Places:</span>
          <span className="stat-count">{counts.locations}</span>
        </button>
        <button className="stat-pill" onClick={() => onSelectTab('culture')}>
          <FontAwesomeIcon icon={faLandmark} />
          <span>Factions:</span>
          <span className="stat-count">{counts.factions}</span>
        </button>
        <button className="stat-pill" onClick={() => onSelectTab('timeline')}>
          <FontAwesomeIcon icon={faRoute} />
          <span>Events:</span>
          <span className="stat-count">{counts.timelineEvents}</span>
        </button>
        <button className="stat-pill" onClick={() => onSelectTab('bestiary')}>
          <FontAwesomeIcon icon={faDragon} />
          <span>Bestiary:</span>
          <span className="stat-count">{counts.bestiary}</span>
        </button>
        <button className="stat-pill" onClick={() => onSelectTab('drafts')}>
          <FontAwesomeIcon icon={faWandMagicSparkles} />
          <span>Drafts:</span>
          <span className="stat-count">{counts.drafts}</span>
        </button>
        <button className="stat-pill" onClick={() => onSelectTab('derivatives')}>
          <FontAwesomeIcon icon={faScroll} />
          <span>Derivatives:</span>
          <span className="stat-count">{counts.derivatives ?? 0}</span>
        </button>
        <button className="stat-pill" style={{ borderColor: 'var(--accent-amber)', color: 'var(--accent-amber)' }} onClick={() => onSelectTab('reader')}>
          <FontAwesomeIcon icon={faBookOpen} />
          <span>Read Story:</span>
          <span className="stat-count">📖 Novella</span>
        </button>
      </div>

      {/* 3. Canon Dimensions Catalog Grid */}
      <div className="dimensions-grid">
        {/* Cast & Personas */}
        <div className="dimension-card">
          <div>
            <div className="dimension-header">
              <h3><FontAwesomeIcon icon={faUsers} /> Cast &amp; Personas</h3>
              <span className="dimension-count-badge">{counts.characters}</span>
            </div>
            <div className="dimension-desc">
              Personas, local figures, factions affiliations, and cross-project identities.
            </div>
            {catalog?.characters && catalog.characters.length > 0 ? (
              <ul className="dimension-preview-list">
                {catalog.characters.slice(0, 4).map((c) => (
                  <li
                    key={c.id}
                    className="dimension-preview-item interactive"
                    onClick={() => onSelectTab('characters', c.id)}
                    title={`Open character: ${c.name}`}
                  >
                    <div>
                      <strong>{c.name}</strong> {c.role ? `(${c.role})` : ''}
                    </div>
                    <FontAwesomeIcon icon={faArrowRight} className="preview-arrow" />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="dimension-desc" style={{ fontStyle: 'italic' }}>No characters registered.</div>
            )}
          </div>
          <button className="dimension-btn" onClick={() => onSelectTab('characters')}>
            Browse Cast <FontAwesomeIcon icon={faArrowRight} />
          </button>
        </div>

        {/* Geography & Map */}
        <div className="dimension-card">
          <div>
            <div className="dimension-header">
              <h3><FontAwesomeIcon icon={faMap} /> Geography &amp; Places</h3>
              <span className="dimension-count-badge">{counts.locations}</span>
            </div>
            <div className="dimension-desc">
              Multi-tier geography: world nodes, regions, areas, and scenes.
            </div>
            {catalog?.locations && catalog.locations.length > 0 ? (
              <ul className="dimension-preview-list">
                {catalog.locations.slice(0, 4).map((l) => (
                  <li
                    key={l.id}
                    className="dimension-preview-item interactive"
                    onClick={() => onSelectTab('world', l.id)}
                    title={`Open location: ${l.name}`}
                  >
                    <div>
                      <strong>{l.name}</strong> {l.regionType ? `• ${l.regionType}` : ''}
                    </div>
                    <FontAwesomeIcon icon={faArrowRight} className="preview-arrow" />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="dimension-desc" style={{ fontStyle: 'italic' }}>No locations charted.</div>
            )}
          </div>
          <button className="dimension-btn" onClick={() => onSelectTab('world')}>
            Explore Map &amp; Places <FontAwesomeIcon icon={faArrowRight} />
          </button>
        </div>

        {/* Factions & Politics */}
        <div className="dimension-card">
          <div>
            <div className="dimension-header">
              <h3><FontAwesomeIcon icon={faLandmark} /> Factions &amp; Blocs</h3>
              <span className="dimension-count-badge">{counts.factions}</span>
            </div>
            <div className="dimension-desc">
              Political factions, border treaties, conflicts, and strategic goals.
            </div>
            {catalog?.factions && catalog.factions.length > 0 ? (
              <ul className="dimension-preview-list">
                {catalog.factions.slice(0, 6).map((f) => (
                  <li
                    key={f.id}
                    className="dimension-preview-item interactive"
                    onClick={() => onSelectTab('culture', f.id)}
                    title={`Open faction: ${f.name}`}
                  >
                    <div>
                      <strong>{f.name}</strong>
                    </div>
                    <FontAwesomeIcon icon={faArrowRight} className="preview-arrow" />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="dimension-desc" style={{ fontStyle: 'italic' }}>No factions recorded.</div>
            )}
          </div>
          <button className="dimension-btn" onClick={() => onSelectTab('culture')}>
            Inspect Factions <FontAwesomeIcon icon={faArrowRight} />
          </button>
        </div>

        {/* Bestiary */}
        <div className="dimension-card">
          <div>
            <div className="dimension-header">
              <h3><FontAwesomeIcon icon={faDragon} /> Universe Bestiary</h3>
              <span className="dimension-count-badge">{counts.bestiary}</span>
            </div>
            <div className="dimension-desc">
              Creatures, threats, ecology, and shared universe variants.
            </div>
            {catalog?.bestiary && catalog.bestiary.length > 0 ? (
              <ul className="dimension-preview-list">
                {catalog.bestiary.slice(0, 4).map((b) => (
                  <li
                    key={b.id}
                    className="dimension-preview-item interactive"
                    onClick={() => onSelectTab('bestiary', b.id)}
                    title={`Open creature: ${b.name}`}
                  >
                    <div>
                      <strong>{b.name}</strong> ({b.category || 'Creature'})
                    </div>
                    <FontAwesomeIcon icon={faArrowRight} className="preview-arrow" />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="dimension-desc" style={{ fontStyle: 'italic' }}>No creatures cataloged.</div>
            )}
          </div>
          <button className="dimension-btn" onClick={() => onSelectTab('bestiary')}>
            Open Bestiary <FontAwesomeIcon icon={faArrowRight} />
          </button>
        </div>

        {/* History & Chronology */}
        <div className="dimension-card">
          <div>
            <div className="dimension-header">
              <h3><FontAwesomeIcon icon={faRoute} /> History &amp; Timelines</h3>
              <span className="dimension-count-badge">{counts.timelineEvents}</span>
            </div>
            <div className="dimension-desc">
              Chronological turning points, causal events, and historical eras.
            </div>
            {catalog?.timelineEvents && catalog.timelineEvents.length > 0 ? (
              <ul className="dimension-preview-list">
                {catalog.timelineEvents.slice(0, 3).map((t) => (
                  <li
                    key={t.id}
                    className="dimension-preview-item interactive"
                    onClick={() => onSelectTab('timeline', t.id)}
                    title={`Open event: ${t.title}`}
                  >
                    <div>
                      <em>{t.date || 'Era'}:</em> <strong>{t.title}</strong>
                    </div>
                    <FontAwesomeIcon icon={faArrowRight} className="preview-arrow" />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="dimension-desc" style={{ fontStyle: 'italic' }}>No historical events recorded.</div>
            )}
          </div>
          <button className="dimension-btn" onClick={() => onSelectTab('timeline')}>
            View Timeline <FontAwesomeIcon icon={faArrowRight} />
          </button>
        </div>

        {/* Culture, Language & Religion */}
        <div className="dimension-card" onClick={(e) => { if ((e.target as HTMLElement).closest('.dimension-btn')) return; onSelectTab('culture'); }}>
          <div>
            <div className="dimension-header">
              <h3><FontAwesomeIcon icon={faComments} /> Culture &amp; Belief</h3>
              <span className="dimension-count-badge">
                {(counts.religions || 0) + (counts.languages || 0) + (counts.cultures || 0)}
              </span>
            </div>
            <div className="dimension-desc">
              Societal rites, naming rules, mythologies, and religious deities.
            </div>
            <div className="dimension-desc" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              • {counts.religions || 0} Religions &amp; Pantheons<br />
              • {counts.languages || 0} Languages &amp; Vocabularies<br />
              • {counts.cultures || 0} Cultural Systems
            </div>
          </div>
          <button className="dimension-btn" onClick={() => onSelectTab('culture')}>
            Manage Culture &amp; Beliefs <FontAwesomeIcon icon={faArrowRight} />
          </button>
        </div>

        {/* Derivative Works & Play */}
        <div className="dimension-card" onClick={(e) => { if ((e.target as HTMLElement).closest('.dimension-btn') || (e.target as HTMLElement).closest('.dimension-preview-item')) return; onSelectTab('derivatives'); }}>
          <div>
            <div className="dimension-header">
              <h3><FontAwesomeIcon icon={faScroll} /> Derivative Works</h3>
              <span className="dimension-count-badge">{counts.derivatives ?? 0}</span>
            </div>
            <div className="dimension-desc">
              Campaigns, story arcs, screenplays, and session packets spun off from canon.
            </div>
            {catalog?.derivatives && catalog.derivatives.length > 0 ? (
              <ul className="dimension-preview-list">
                {catalog.derivatives.slice(0, 4).map((d) => (
                  <li
                    key={d.id}
                    className="dimension-preview-item interactive"
                    onClick={() => onSelectTab('derivatives', d.id)}
                    title={`Open derivative: ${d.title}`}
                  >
                    <div>
                      <span style={{ textTransform: 'capitalize', color: 'var(--accent-amber)', fontSize: '0.75rem', marginRight: '0.4rem', fontWeight: 600 }}>[{d.type}]</span>
                      <strong>{d.title}</strong>
                    </div>
                    <FontAwesomeIcon icon={faArrowRight} className="preview-arrow" />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="dimension-desc" style={{ fontStyle: 'italic' }}>No derivative works created yet.</div>
            )}
          </div>
          <button className="dimension-btn" onClick={() => onSelectTab('derivatives')}>
            Browse Derivatives &amp; Table Play <FontAwesomeIcon icon={faArrowRight} />
          </button>
        </div>
      </div>

      {/* 4. Composed Storycraft Elements (Plot Structure, Character Arcs & Pacing) */}
      <div className="recent-canon-card storycraft-dashboard-card">
        <div className="storycraft-dashboard-header">
          <div>
            <h2 className="recent-canon-header" style={{ marginBottom: '0.2rem' }}>
              <FontAwesomeIcon icon={faPenNib} /> Composed Storycraft Elements
            </h2>
            <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-muted)' }}>
              Core narrative elements composing the universe: plot structures, character transformation arcs, and scene pacing.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <button className="dimension-btn" style={{ borderColor: 'var(--accent-amber)', color: 'var(--accent-amber)' }} onClick={() => onSelectTab('reader')}>
              <FontAwesomeIcon icon={faBookOpen} /> Read Assembled Story
            </button>
            <button className="dimension-btn" onClick={() => onSelectTab('notes')}>
              Open Storycraft Studio <FontAwesomeIcon icon={faArrowRight} />
            </button>
          </div>
        </div>

        <div className="storycraft-elements-grid">
          {/* A. Plot Structure */}
          <div className="storycraft-item-card" onClick={() => onSelectTab('arcs')}>
            <div className="storycraft-card-top">
              <span className="storycraft-badge"><FontAwesomeIcon icon={faRoute} /> Plot Structure</span>
              <span className="storycraft-count">{(catalog?.arcs?.length || 0) + (catalog?.derivatives?.length || 0)} Arcs</span>
            </div>
            <h4 className="storycraft-card-title">Macro Arcs &amp; Act Milestones</h4>
            <p className="storycraft-card-desc">
              {catalog?.arcs && catalog.arcs.length > 0
                ? `${catalog.arcs[0].title}: ${catalog.arcs[0].description || 'Structured narrative acts'}`
                : catalog?.derivatives && catalog.derivatives.length > 0
                ? `${catalog.derivatives[0].title}: Multi-act outline`
                : 'No plot structures defined yet. Author in Arcs & Beats or generate via Story Harness.'}
            </p>
            <div className="storycraft-card-action">
              <span>View Plot Structure</span>
              <FontAwesomeIcon icon={faArrowRight} />
            </div>
          </div>

          {/* B. Character Arcs */}
          <div className="storycraft-item-card" onClick={() => onSelectTab('characters')}>
            <div className="storycraft-card-top">
              <span className="storycraft-badge"><FontAwesomeIcon icon={faUsers} /> Character Arcs</span>
              <span className="storycraft-count">{catalog?.characters?.length || 0} Personas</span>
            </div>
            <h4 className="storycraft-card-title">Motivations &amp; Dramatic Stakes</h4>
            <p className="storycraft-card-desc">
              {catalog?.characters && catalog.characters.length > 0 && catalog.characters.some(c => c.motivation)
                ? `${catalog.characters.find(c => c.motivation)?.name}: "${catalog.characters.find(c => c.motivation)?.motivation?.slice(0, 80)}..."`
                : 'Character internal arcs, tragic flaws, and dramatic needs driving the story.'}
            </p>
            <div className="storycraft-card-action">
              <span>Explore Character Arcs</span>
              <FontAwesomeIcon icon={faArrowRight} />
            </div>
          </div>

          {/* C. Pacing & Turning Points */}
          <div className="storycraft-item-card" onClick={() => onSelectTab('timeline')}>
            <div className="storycraft-card-top">
              <span className="storycraft-badge"><FontAwesomeIcon icon={faStopwatch} /> Pacing &amp; Beats</span>
              <span className="storycraft-count">{catalog?.timelineEvents?.length || 0} Beats</span>
            </div>
            <h4 className="storycraft-card-title">Scene Rhythm &amp; Turning Points</h4>
            <p className="storycraft-card-desc">
              {catalog?.timelineEvents && catalog.timelineEvents.length > 0
                ? `Pacing anchored by ${catalog.timelineEvents.length} chronological turning points from ${catalog.timelineEvents[0].date || 'the deep past'}.`
                : 'Scene beats, escalating stakes, and chronological turning points.'}
            </p>
            <div className="storycraft-card-action">
              <span>Inspect Pacing Beats</span>
              <FontAwesomeIcon icon={faArrowRight} />
            </div>
          </div>
        </div>
      </div>

      {/* 5. Recent Timeline Highlights */}
      {catalog?.timelineEvents && catalog.timelineEvents.length > 0 && (
        <div className="recent-canon-card">
          <h2 className="recent-canon-header">⏳ Historical Timeline Highlights</h2>
          <div className="timeline-snippet-list">
            {catalog.timelineEvents.slice(0, 4).map((event) => (
              <div
                key={event.id}
                className="timeline-snippet-item interactive"
                onClick={() => onSelectTab('timeline', event.id)}
                title={`Jump to timeline event: ${event.title}`}
              >
                <div className="timeline-snippet-date">{event.date || 'Undated Event'}</div>
                <div className="timeline-snippet-title">{event.title}</div>
                {event.description && <div className="timeline-snippet-desc">{event.description}</div>}
                <div className="timeline-snippet-action">
                  <span>View in Timeline</span>
                  <FontAwesomeIcon icon={faArrowRight} className="action-arrow" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
