import { useState, useEffect } from 'react';
import { api } from '../api';
import type { DerivativeWork, DerivativeWorkType, UniverseEncyclopedia } from '../types/story';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faScroll, faShieldHalved, faBookOpen, faFilm, faGamepad,
  faImage, faPlus, faFloppyDisk, faTrashCan, faCopy, faCheck,
  faSpinner,
} from '@fortawesome/free-solid-svg-icons';
import './DerivativeWorksManager.css';

interface Props {
  projectId: string | null;
  ensureStory: () => Promise<string>;
}

export default function DerivativeWorksManager({ projectId, ensureStory }: Props) {
  const [derivatives, setDerivatives] = useState<DerivativeWork[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [showGenerator, setShowGenerator] = useState(false);

  // Generator form state
  const [genType, setGenType] = useState<DerivativeWorkType>('campaign');
  const [genTitle, setGenTitle] = useState('');
  const [genFocus, setGenFocus] = useState('');
  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);

  // Active item edit state
  const [activeWork, setActiveWork] = useState<DerivativeWork | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // Available canon entities for scoping
  const [encyclopedia, setEncyclopedia] = useState<UniverseEncyclopedia | null>(null);

  const loadDerivatives = async (pId: string) => {
    setLoading(true);
    try {
      const list = await api.derivatives.list(pId);
      setDerivatives(list);
      if (list.length > 0 && !selectedId) {
        setSelectedId(list[0].id);
        setActiveWork(list[0]);
      }
    } catch (err) {
      console.error('Failed to load derivatives:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) {
      loadDerivatives(projectId);
      api.stories.getEncyclopedia(projectId)
        .then(setEncyclopedia)
        .catch(console.error);
    }
  }, [projectId]);

  useEffect(() => {
    if (selectedId) {
      const found = derivatives.find((d) => d.id === selectedId);
      if (found) setActiveWork(found);
    }
  }, [selectedId, derivatives]);

  const handleGenerateBrief = async () => {
    setGenerating(true);
    try {
      const pId = projectId || await ensureStory();
      const brief = await api.derivatives.generateBrief({
        projectId: pId,
        type: genType,
        title: genTitle.trim() || undefined,
        focus: genFocus.trim() || undefined,
        selectedEntityIds,
      });
      setDerivatives((prev) => [brief, ...prev]);
      setSelectedId(brief.id);
      setActiveWork(brief);
      setShowGenerator(false);
      setGenTitle('');
      setGenFocus('');
      setSelectedEntityIds([]);
    } catch (err) {
      console.error('Failed to generate brief:', err);
      alert('Generation failed: ' + (err as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveActive = async () => {
    if (!activeWork) return;
    setSaving(true);
    try {
      const updated = await api.derivatives.update(activeWork.id, {
        title: activeWork.title,
        description: activeWork.description,
        status: activeWork.status,
        content: activeWork.content,
      });
      setActiveWork(updated);
      setDerivatives((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
    } catch (err) {
      console.error('Failed to save derivative work:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteActive = async (id: string) => {
    if (!confirm('Delete this derivative work?')) return;
    try {
      await api.derivatives.delete(id);
      setDerivatives((prev) => prev.filter((d) => d.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
        setActiveWork(null);
      }
    } catch (err) {
      console.error('Failed to delete derivative work:', err);
    }
  };

  const handleCopyDndExport = async (id: string) => {
    try {
      const artifact = await api.derivatives.getDndExport(id);
      await navigator.clipboard.writeText(JSON.stringify(artifact, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      alert('Failed to copy D&D export: ' + (err as Error).message);
    }
  };

  const toggleEntitySelection = (id: string) => {
    setSelectedEntityIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const filtered = derivatives.filter((d) =>
    filterType === 'all' ? true : d.type === filterType
  );

  const typeIcon = (t: string) => {
    switch (t) {
      case 'campaign': return faShieldHalved;
      case 'story': return faBookOpen;
      case 'screenplay': return faFilm;
      case 'game_concept': return faGamepad;
      case 'storyboard': return faImage;
      default: return faScroll;
    }
  };

  return (
    <div className="derivatives-manager">
      <div className="derivatives-header">
        <div>
          <h2>📜 Derivative Works &amp; Outputs</h2>
          <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
            Generate and manage campaigns, stories, screenplays, and concepts anchored in this universe canon.
          </div>
        </div>

        <div className="derivatives-controls">
          <button
            className={`type-filter-btn ${filterType === 'all' ? 'active' : ''}`}
            onClick={() => setFilterType('all')}
          >
            All ({derivatives.length})
          </button>
          <button
            className={`type-filter-btn ${filterType === 'campaign' ? 'active' : ''}`}
            onClick={() => setFilterType('campaign')}
          >
            Campaigns
          </button>
          <button
            className={`type-filter-btn ${filterType === 'story' ? 'active' : ''}`}
            onClick={() => setFilterType('story')}
          >
            Stories
          </button>
          <button
            className={`type-filter-btn ${filterType === 'screenplay' ? 'active' : ''}`}
            onClick={() => setFilterType('screenplay')}
          >
            Screenplays
          </button>
          <button
            className={`type-filter-btn ${filterType === 'game_concept' ? 'active' : ''}`}
            onClick={() => setFilterType('game_concept')}
          >
            Game Concepts
          </button>
          <button
            className={`type-filter-btn ${filterType === 'storyboard' ? 'active' : ''}`}
            onClick={() => setFilterType('storyboard')}
          >
            Storyboards
          </button>

          <button
            className="btn-generate"
            onClick={() => setShowGenerator(!showGenerator)}
          >
            <FontAwesomeIcon icon={faPlus} />
            {showGenerator ? 'Close Generator' : 'Generate Derivative Brief'}
          </button>
        </div>
      </div>

      {/* Generator Form Drawer */}
      {showGenerator && (
        <div className="generator-panel">
          <h3>✨ Generate Structured Derivative Brief from Canon</h3>
          <div className="generator-form">
            <div className="form-row">
              <label>Derivative Type</label>
              <select
                className="form-select"
                value={genType}
                onChange={(e) => setGenType(e.target.value as DerivativeWorkType)}
              >
                <option value="campaign">Tabletop Campaign Brief (D&amp;D Table Ready)</option>
                <option value="story">Prose Story Outline (3-Act Narrative)</option>
                <option value="screenplay">Screenplay Treatment (Cinematic Beats)</option>
                <option value="game_concept">Game Concept Document (Mechanics &amp; Systems)</option>
                <option value="storyboard">Storyboard Beat Sheet (Key Camera Frames)</option>
              </select>
            </div>

            <div className="form-row">
              <label>Derivative Title (optional)</label>
              <input
                className="form-input"
                placeholder="e.g. Defense of the Sunken Spire"
                value={genTitle}
                onChange={(e) => setGenTitle(e.target.value)}
              />
            </div>

            <div className="form-row">
              <label>Creative Focus &amp; Tone (optional)</label>
              <input
                className="form-input"
                placeholder="e.g. Focus on smuggling tensions and border patrols"
                value={genFocus}
                onChange={(e) => setGenFocus(e.target.value)}
              />
            </div>

            {encyclopedia && (
              <div className="form-row">
                <label>Scope Canon Facts (choose key entities to ground this derivative)</label>
                <div className="entities-selector">
                  {encyclopedia.catalog.characters.map((c) => (
                    <label key={c.id} className="entity-checkbox-label">
                      <input
                        type="checkbox"
                        checked={selectedEntityIds.includes(c.id)}
                        onChange={() => toggleEntitySelection(c.id)}
                      />
                      👤 {c.name}
                    </label>
                  ))}
                  {encyclopedia.catalog.locations.map((l) => (
                    <label key={l.id} className="entity-checkbox-label">
                      <input
                        type="checkbox"
                        checked={selectedEntityIds.includes(l.id)}
                        onChange={() => toggleEntitySelection(l.id)}
                      />
                      📍 {l.name}
                    </label>
                  ))}
                  {encyclopedia.catalog.factions.map((f) => (
                    <label key={f.id} className="entity-checkbox-label">
                      <input
                        type="checkbox"
                        checked={selectedEntityIds.includes(f.id)}
                        onChange={() => toggleEntitySelection(f.id)}
                      />
                      ⚖️ {f.name}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button
                className="btn-generate"
                onClick={handleGenerateBrief}
                disabled={generating}
              >
                <FontAwesomeIcon icon={generating ? faSpinner : faPlus} spin={generating} />
                {generating ? 'Gathering Canon & Generating...' : 'Generate Brief'}
              </button>
              <button
                className="type-filter-btn"
                onClick={() => setShowGenerator(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main layout: Sidebar list + Detail view */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
          Loading derivative works...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', background: 'var(--bg-elevated)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
          <FontAwesomeIcon icon={faScroll} size="2x" style={{ color: 'var(--text-muted)', marginBottom: '0.75rem' }} />
          <h3 style={{ color: 'var(--text-heading)', margin: '0 0 0.5rem', fontFamily: 'var(--font-heading)' }}>No derivative works yet</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '480px', margin: '0 auto 1.25rem' }}>
            A universe project is the single source of truth for lore. Generate campaigns, stories, screenplays,
            game concepts, or storyboards that cite these hardened facts.
          </p>
          <button className="btn-generate" style={{ margin: '0 auto' }} onClick={() => setShowGenerator(true)}>
            <FontAwesomeIcon icon={faPlus} /> Generate First Derivative Brief
          </button>
        </div>
      ) : (
        <div className="derivatives-layout">
          {/* Sidebar */}
          <div className="derivatives-sidebar">
            {filtered.map((d) => (
              <div
                key={d.id}
                className={`derivative-item-card ${selectedId === d.id ? 'active' : ''}`}
                onClick={() => setSelectedId(d.id)}
              >
                <div className="derivative-item-top">
                  <span className={`derivative-type-badge badge-${d.type}`}>
                    <FontAwesomeIcon icon={typeIcon(d.type)} /> {d.type}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                    {d.status}
                  </span>
                </div>
                <div style={{ fontWeight: 600, color: 'var(--text-heading)', fontSize: '0.9rem' }}>{d.title}</div>
                {d.description && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {d.description}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Active Viewer / Editor */}
          {activeWork ? (
            <div className="derivative-viewer">
              <div className="viewer-header">
                <div>
                  <span className={`derivative-type-badge badge-${activeWork.type}`} style={{ marginBottom: '0.4rem', display: 'inline-block' }}>
                    <FontAwesomeIcon icon={typeIcon(activeWork.type)} /> {activeWork.type}
                  </span>
                  <input
                    className="form-input"
                    style={{ fontSize: '1.2rem', fontWeight: 600, width: '100%', marginTop: '4px' }}
                    value={activeWork.title}
                    onChange={(e) => setActiveWork({ ...activeWork, title: e.target.value })}
                  />
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <select
                    className="form-select"
                    value={activeWork.status}
                    onChange={(e) => setActiveWork({ ...activeWork, status: e.target.value as never })}
                  >
                    <option value="draft">Draft</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="archived">Archived</option>
                  </select>

                  {activeWork.type === 'campaign' && (
                    <button
                      className="btn-generate"
                      style={{ background: '#059669' }}
                      onClick={() => handleCopyDndExport(activeWork.id)}
                      title="Copy artifact JSON for D&D Campaign Table import"
                    >
                      <FontAwesomeIcon icon={copied ? faCheck : faCopy} />
                      {copied ? 'Copied D&D JSON!' : 'Export for D&D'}
                    </button>
                  )}

                  <button
                    className="btn-generate"
                    onClick={handleSaveActive}
                    disabled={saving}
                  >
                    <FontAwesomeIcon icon={saving ? faSpinner : faFloppyDisk} spin={saving} />
                    {saving ? 'Saving...' : 'Save'}
                  </button>

                  <button
                    className="type-filter-btn"
                    style={{ color: '#ef4444' }}
                    onClick={() => handleDeleteActive(activeWork.id)}
                  >
                    <FontAwesomeIcon icon={faTrashCan} />
                  </button>
                </div>
              </div>

              {/* Cited Canon References */}
              {activeWork.sourceCanonReferences && activeWork.sourceCanonReferences.length > 0 && (
                <div className="source-references-box">
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
                    Cited Universe Canon References ({activeWork.sourceCanonReferences.length}):
                  </div>
                  <div>
                    {activeWork.sourceCanonReferences.map((ref, idx) => (
                      <span key={idx} className="reference-pill">
                        {ref.entityType === 'character' && '👤'}
                        {ref.entityType === 'location' && '📍'}
                        {ref.entityType === 'faction' && '⚖️'}
                        {ref.entityType === 'timeline_event' && '⏳'}
                        {ref.entityType === 'bestiary' && '🐉'}
                        {' '}{ref.name || ref.entityId}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Brief Content */}
              <div className="form-row">
                <label>Brief Content &amp; Outlines</label>
                <textarea
                  className="form-textarea viewer-content"
                  rows={14}
                  value={activeWork.content || ''}
                  onChange={(e) => setActiveWork({ ...activeWork, content: e.target.value })}
                />
              </div>
            </div>
          ) : (
            <div style={{ color: '#94a3b8', textAlign: 'center', padding: '3rem' }}>
              Select a derivative work from the list to view its brief and canon references.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
