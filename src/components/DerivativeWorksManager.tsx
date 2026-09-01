import { useState, useEffect, useMemo } from 'react';
import { api } from '../api';
import type { DerivativeWork, DerivativeWorkType, UniverseEncyclopedia } from '../types/story';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faScroll, faShieldHalved, faBookOpen, faFilm, faGamepad,
  faImage, faPlus, faFloppyDisk, faTrashCan, faCopy, faCheck,
  faSpinner, faDiceD20, faHeart, faSkull, faUser,
  faDownload, faChild, faWandMagicSparkles,
} from '@fortawesome/free-solid-svg-icons';
import StoryReader from './StoryReader';
import './DerivativeWorksManager.css';

interface Props {
  projectId: string | null;
  ensureStory: () => Promise<string>;
}

type CampaignSubTab = 'reader' | 'console' | 'encounters' | 'cast' | 'brief' | 'dnd_export';

const DEFAULT_RUMORS = [
  'A wounded trapper at the Copper Ladle saw goblin smoke rising past the High Anvil Shrine.',
  'Goblins aren\'t merely raiding; they are excavating an ancient vault beneath the tree line.',
  'The Merchant Skeptics are suspected of bribing frontier scouts to look the other way.',
  'Slime remnants in the lower sewers are reacting violently to goblin iron bombs.',
  'The missing traveler was carrying an encrypted dispatch intended for the garrison commander.',
  'A shadowed herald with silver eyes was spotted negotiating with the Goblin Chief at midnight.',
];

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
  const [activeSubTab, setActiveSubTab] = useState<CampaignSubTab>('console');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dndArtifact, setDndArtifact] = useState<any>(null);

  // DM interactive session state
  const [currentRumor, setCurrentRumor] = useState<string | null>(null);
  const [creatureHp, setCreatureHp] = useState<Record<string, number>>({});
  const [sessionNotes, setSessionNotes] = useState('');
  const [threatLens, setThreatLens] = useState<'tabletop' | 'all_ages' | 'canon'>('tabletop');

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
      if (found) {
        setActiveWork(found);
        setActiveSubTab(found.type === 'story' ? 'reader' : 'console');
        setSessionNotes((found.metadata as any)?.sessionNotes || '');
        if (found.type === 'campaign') {
          api.derivatives.getDndExport(found.id)
            .then(setDndArtifact)
            .catch(() => setDndArtifact(null));
        }
      }
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
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveActive = async () => {
    if (!activeWork) return;
    setSaving(true);
    try {
      const updatedMetadata = {
        ...(activeWork.metadata || {}),
        sessionNotes,
      };
      const updated = await api.derivatives.update(activeWork.id, {
        title: activeWork.title,
        status: activeWork.status,
        content: activeWork.content,
        metadata: updatedMetadata,
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
        const remaining = derivatives.filter((d) => d.id !== id);
        setSelectedId(remaining.length > 0 ? remaining[0].id : null);
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
      console.error('Failed to export D&D artifact:', err);
    }
  };

  const handleDownloadDndExport = async (id: string) => {
    try {
      const artifact = await api.derivatives.getDndExport(id);
      const blob = new Blob([JSON.stringify(artifact, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeWork?.title.replace(/\s+/g, '_') || 'campaign'}_dnd_bundle.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  const rollRumor = () => {
    const idx = Math.floor(Math.random() * DEFAULT_RUMORS.length);
    const r = DEFAULT_RUMORS[idx];
    setCurrentRumor(r);
  };

  const addRumorToNotes = () => {
    if (!currentRumor) return;
    const stamp = `[Rumor ${new Date().toLocaleTimeString()}]: ${currentRumor}\n`;
    setSessionNotes((prev) => (prev ? prev + '\n' + stamp : stamp));
  };

  const appendQuickLog = (msg: string) => {
    const stamp = `[${new Date().toLocaleTimeString()}]: ${msg}\n`;
    setSessionNotes((prev) => (prev ? prev + '\n' + stamp : stamp));
  };

  const typeIcon = (type: string) => {
    switch (type) {
      case 'campaign': return faShieldHalved;
      case 'story': return faBookOpen;
      case 'screenplay': return faFilm;
      case 'game_concept': return faGamepad;
      case 'storyboard': return faImage;
      default: return faScroll;
    }
  };

  const filtered = derivatives.filter((d) =>
    filterType === 'all' ? true : d.type === filterType
  );

  // Cross-reference cited canon with universe catalog
  const citedBestiary = useMemo(() => {
    if (!activeWork || !encyclopedia?.catalog?.bestiary) return [];
    const citedIds = activeWork.sourceCanonReferences
      ?.filter((r) => r.entityType === 'bestiary')
      .map((r) => r.entityId) || [];
    return encyclopedia.catalog.bestiary.filter((b) => citedIds.includes(b.id));
  }, [activeWork, encyclopedia]);

  const citedCharacters = useMemo(() => {
    if (!activeWork || !encyclopedia?.catalog?.characters) return [];
    const citedIds = activeWork.sourceCanonReferences
      ?.filter((r) => r.entityType === 'character')
      .map((r) => r.entityId) || [];
    return encyclopedia.catalog.characters.filter((c) => citedIds.includes(c.id));
  }, [activeWork, encyclopedia]);

  const citedLocations = useMemo(() => {
    if (!activeWork || !encyclopedia?.catalog?.locations) return [];
    const citedIds = activeWork.sourceCanonReferences
      ?.filter((r) => r.entityType === 'location')
      .map((r) => r.entityId) || [];
    return encyclopedia.catalog.locations.filter((l) => citedIds.includes(l.id));
  }, [activeWork, encyclopedia]);

  const adjustHp = (creatureId: string, delta: number, maxHp: number) => {
    setCreatureHp((prev) => {
      const current = prev[creatureId] !== undefined ? prev[creatureId] : maxHp;
      const next = Math.max(0, current + delta);
      return { ...prev, [creatureId]: next };
    });
  };

  return (
    <div className="derivatives-manager">
      {/* Header & Controls */}
      <div className="derivatives-header">
        <div>
          <h2>Derivative Works &amp; Playcraft</h2>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Campaign packets, playable sessions, prose stories, and screenplays generated from hardened universe canon.
          </p>
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
            <FontAwesomeIcon icon={faShieldHalved} /> Campaigns
          </button>
          <button
            className={`type-filter-btn ${filterType === 'story' ? 'active' : ''}`}
            onClick={() => setFilterType('story')}
          >
            <FontAwesomeIcon icon={faBookOpen} /> Stories
          </button>
          <button
            className={`type-filter-btn ${filterType === 'screenplay' ? 'active' : ''}`}
            onClick={() => setFilterType('screenplay')}
          >
            <FontAwesomeIcon icon={faFilm} /> Screenplays
          </button>
          <button
            className="btn-generate"
            onClick={() => setShowGenerator(!showGenerator)}
          >
            <FontAwesomeIcon icon={faPlus} />
            {showGenerator ? 'Close Generator' : 'Generate New Brief'}
          </button>
        </div>
      </div>

      {/* Generator Drawer */}
      {showGenerator && (
        <div className="derivative-generator-panel">
          <h3>Generate Derivative from Canon</h3>
          <p className="generator-desc">
            Select a target format and optionally scope specific characters, locations, or factions to anchor the output.
          </p>

          <div className="generator-form">
            <div className="form-group">
              <label>Target Format</label>
              <div className="type-selector-grid">
                {(['campaign', 'story', 'screenplay', 'game_concept', 'storyboard'] as DerivativeWorkType[]).map((t) => (
                  <div
                    key={t}
                    className={`type-option-card ${genType === t ? 'selected' : ''}`}
                    onClick={() => setGenType(t)}
                  >
                    <FontAwesomeIcon icon={typeIcon(t)} size="lg" />
                    <span>{t.replace('_', ' ')}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group" style={{ flex: 1 }}>
                <label>Working Title (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Incursion at the Iron Gates"
                  value={genTitle}
                  onChange={(e) => setGenTitle(e.target.value)}
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Creative Focus / Scenario Seed</label>
                <input
                  type="text"
                  placeholder="e.g. Recovering an ancient artifact before the raiders"
                  value={genFocus}
                  onChange={(e) => setGenFocus(e.target.value)}
                />
              </div>
            </div>

            {/* Entity Scoping */}
            {encyclopedia && (
              <div className="form-group">
                <label>Scope Canon Facts (Ground this work in specific universe canon)</label>
                <div className="canon-scope-grid">
                  {encyclopedia.catalog.characters?.map((c) => (
                    <span
                      key={c.id}
                      className={`canon-scope-chip ${selectedEntityIds.includes(c.id) ? 'selected' : ''}`}
                      onClick={() => setSelectedEntityIds((prev) =>
                        prev.includes(c.id) ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                      )}
                    >
                      👤 {c.name}
                    </span>
                  ))}
                  {encyclopedia.catalog.locations?.map((l) => (
                    <span
                      key={l.id}
                      className={`canon-scope-chip ${selectedEntityIds.includes(l.id) ? 'selected' : ''}`}
                      onClick={() => setSelectedEntityIds((prev) =>
                        prev.includes(l.id) ? prev.filter((id) => id !== l.id) : [...prev, l.id]
                      )}
                    >
                      📍 {l.name}
                    </span>
                  ))}
                  {encyclopedia.catalog.factions?.map((f) => (
                    <span
                      key={f.id}
                      className={`canon-scope-chip ${selectedEntityIds.includes(f.id) ? 'selected' : ''}`}
                      onClick={() => setSelectedEntityIds((prev) =>
                        prev.includes(f.id) ? prev.filter((id) => id !== f.id) : [...prev, f.id]
                      )}
                    >
                      ⚖️ {f.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button
                type="button"
                className="type-filter-btn"
                onClick={() => setShowGenerator(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-generate"
                onClick={handleGenerateBrief}
                disabled={generating}
              >
                <FontAwesomeIcon icon={generating ? faSpinner : faPlus} spin={generating} />
                {generating ? 'Composing Brief...' : 'Generate Derivative Work'}
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
        <div style={{ textAlign: 'center', padding: '3.5rem 2rem', background: 'var(--bg-elevated)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
          <FontAwesomeIcon icon={faShieldHalved} size="2x" style={{ color: 'var(--accent-terracotta)', marginBottom: '0.75rem' }} />
          <h3 style={{ color: 'var(--text-heading)', margin: '0 0 0.5rem', fontFamily: 'var(--font-heading)', fontSize: '1.3rem' }}>No derivative works yet</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '480px', margin: '0 auto 1.5rem' }}>
            A universe project acts as the durable canon foundation. Generate playable campaigns, prose stories, screenplays,
            or game concepts that cite your setting's factions, characters, and geography.
          </p>
          <button className="btn-generate" style={{ margin: '0 auto' }} onClick={() => setShowGenerator(true)}>
            <FontAwesomeIcon icon={faPlus} /> Generate First Derivative Campaign
          </button>
        </div>
      ) : (
        <div className="derivatives-layout">
          {/* Sidebar */}
          <div className="derivatives-sidebar">
            <div className="sidebar-list-title">Derivative Catalog ({filtered.length})</div>
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
                <div className="derivative-card-title">{d.title}</div>
                {d.description && (
                  <div className="derivative-card-desc">
                    {d.description}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Active Work Detail View */}
          {activeWork ? (
            <div className="derivative-viewer">
              {/* Top Header */}
              <div className="viewer-header">
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                    <span className={`derivative-type-badge badge-${activeWork.type}`}>
                      <FontAwesomeIcon icon={typeIcon(activeWork.type)} /> {activeWork.type}
                    </span>
                    <span className="status-pill">{activeWork.status}</span>
                  </div>
                  <input
                    className="viewer-title-input"
                    value={activeWork.title}
                    onChange={(e) => setActiveWork({ ...activeWork, title: e.target.value })}
                  />
                </div>

                <div className="viewer-top-actions">
                  <select
                    className="status-select"
                    value={activeWork.status}
                    onChange={(e) => setActiveWork({ ...activeWork, status: e.target.value as never })}
                  >
                    <option value="draft">Draft</option>
                    <option value="ready">Ready to Play</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="archived">Archived</option>
                  </select>

                  <button
                    className="btn-save-derivative"
                    onClick={handleSaveActive}
                    disabled={saving}
                  >
                    <FontAwesomeIcon icon={saving ? faSpinner : faFloppyDisk} spin={saving} />
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>

                  <button
                    className="btn-delete-derivative"
                    onClick={() => handleDeleteActive(activeWork.id)}
                    title="Delete derivative work"
                  >
                    <FontAwesomeIcon icon={faTrashCan} />
                  </button>
                </div>
              </div>

              {/* Story Narrative Navigation Tabs */}
              {activeWork.type === 'story' && (
                <div className="campaign-subnav">
                  <button
                    className={`campaign-nav-btn ${activeSubTab === 'reader' ? 'active' : ''}`}
                    onClick={() => setActiveSubTab('reader')}
                  >
                    <FontAwesomeIcon icon={faBookOpen} /> 📖 Read Story
                  </button>
                  <button
                    className={`campaign-nav-btn ${activeSubTab === 'brief' ? 'active' : ''}`}
                    onClick={() => setActiveSubTab('brief')}
                  >
                    <FontAwesomeIcon icon={faScroll} /> Outline &amp; Manuscript
                  </button>
                  <button
                    className="campaign-nav-btn"
                    onClick={async () => {
                      if (!activeWork) return;
                      setGenerating(true);
                      try {
                        const res = await api.composer.composeChapter({ derivativeId: activeWork.id });
                        if (res.success && res.derivative) {
                          setActiveWork(res.derivative);
                          setDerivatives((prev) =>
                            prev.map((d) => (d.id === res.derivative.id ? res.derivative : d))
                          );
                          setActiveSubTab('reader');
                        }
                      } catch (e) {
                        console.error('Failed to compose novel prose:', e);
                      } finally {
                        setGenerating(false);
                      }
                    }}
                    disabled={generating}
                    style={{ borderColor: 'var(--accent-amber)', color: 'var(--accent-amber)' }}
                    title="Compose chapter scene beats into rich, publication-grade novel prose"
                  >
                    <FontAwesomeIcon icon={generating ? faSpinner : faWandMagicSparkles} spin={generating} />{' '}
                    {generating ? 'Composing...' : '✨ Compose Novel Prose'}
                  </button>
                </div>
              )}

              {/* Campaign Interactive Navigation Tabs */}
              {activeWork.type === 'campaign' && (
                <div className="campaign-subnav">
                  <button
                    className={`campaign-nav-btn ${activeSubTab === 'console' ? 'active' : ''}`}
                    onClick={() => setActiveSubTab('console')}
                  >
                    <FontAwesomeIcon icon={faShieldHalved} /> Playable DM Console
                  </button>
                  <button
                    className={`campaign-nav-btn ${activeSubTab === 'encounters' ? 'active' : ''}`}
                    onClick={() => setActiveSubTab('encounters')}
                  >
                    <FontAwesomeIcon icon={faSkull} /> Threats &amp; HP Tracker ({citedBestiary.length})
                  </button>
                  <button
                    className={`campaign-nav-btn ${activeSubTab === 'cast' ? 'active' : ''}`}
                    onClick={() => setActiveSubTab('cast')}
                  >
                    <FontAwesomeIcon icon={faUser} /> Operatives &amp; Cast ({citedCharacters.length})
                  </button>
                  <button
                    className={`campaign-nav-btn ${activeSubTab === 'brief' ? 'active' : ''}`}
                    onClick={() => setActiveSubTab('brief')}
                  >
                    <FontAwesomeIcon icon={faScroll} /> Adventure Text
                  </button>
                  <button
                    className={`campaign-nav-btn ${activeSubTab === 'dnd_export' ? 'active' : ''}`}
                    onClick={() => setActiveSubTab('dnd_export')}
                  >
                    <FontAwesomeIcon icon={faDiceD20} /> D&amp;D 5e / VTT Bundle
                  </button>
                </div>
              )}

              {/* Sub-View 1: Playable DM Console */}
              {activeWork.type === 'campaign' && activeSubTab === 'console' && (
                <div className="console-view">
                  {/* Setting Premise Card */}
                  <div className="mission-briefing-card">
                    <div className="mission-header">
                      <h3>Mission Briefing &amp; Table Setting</h3>
                      <span className="tier-badge">Tier 1 • Levels 1-3</span>
                    </div>
                    <p className="mission-desc">
                      {activeWork.description || 'A frontline expedition launched from Tallgate Keep into Pinewhistle Woods.'}
                    </p>
                    <div className="mission-meta-chips">
                      <span>📍 Staging: Harbor Village</span>
                      <span>⚔️ Danger: Goblin Ridge Lines</span>
                      <span>🎯 Objective: Extract Missing Scouts</span>
                    </div>
                  </div>

                  {/* Interactive d6 Rumor & Hook Generator */}
                  <div className="rumor-generator-box">
                    <div className="rumor-header-row">
                      <div>
                        <h4><FontAwesomeIcon icon={faDiceD20} /> d6 Rumors &amp; Table Hooks</h4>
                        <p>Draw rumors live at the table when players talk to tavern patrons or scout ahead.</p>
                      </div>
                      <button className="btn-roll-rumor" onClick={rollRumor}>
                        🎲 Draw Table Rumor
                      </button>
                    </div>

                    {currentRumor ? (
                      <div className="rolled-rumor-display">
                        <div className="rolled-text">"{currentRumor}"</div>
                        <button className="btn-add-rumor-note" onClick={addRumorToNotes}>
                          + Add to Session Notes
                        </button>
                      </div>
                    ) : (
                      <div className="rumor-empty-hint">Click "Draw Table Rumor" to surface a table-ready hook.</div>
                    )}
                  </div>

                  {/* Quick DM Session Notes Tracker */}
                  <div className="session-notes-box">
                    <div className="session-notes-header">
                      <h4>Live Session Notes &amp; Table Scratchpad</h4>
                      <div className="quick-stamps">
                        <button onClick={() => appendQuickLog('Combat Encounter Started')}>⚔️ Combat</button>
                        <button onClick={() => appendQuickLog('Party Took Short Rest')}>⛺ Short Rest</button>
                        <button onClick={() => appendQuickLog('Scout Rescued from Pit')}>🔓 Scout Freed</button>
                        <button onClick={() => appendQuickLog('Chief Defeated')}>🏆 Victory</button>
                      </div>
                    </div>
                    <textarea
                      className="session-notes-textarea"
                      rows={5}
                      placeholder="Record player decisions, damage dealt, recovered loot, or NPC promises here..."
                      value={sessionNotes}
                      onChange={(e) => setSessionNotes(e.target.value)}
                    />
                    <div className="notes-save-hint">Notes save automatically with the campaign when clicking Save Changes above.</div>
                  </div>
                </div>
              )}

              {/* Sub-View 2: Threats & HP Tracker */}
              {activeWork.type === 'campaign' && activeSubTab === 'encounters' && (
                <div className="threats-view">
                  <div className="threats-lens-bar">
                    <div>
                      <h4 style={{ margin: '0 0 0.2rem', fontFamily: 'var(--font-heading)', color: 'var(--text-heading)' }}>
                        In-Universe Threats &amp; Ecological Opposition ({citedBestiary.length})
                      </h4>
                      <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                        Creatures are grounded in universe canon with genuine backstories and motivations, not random mobs.
                      </p>
                    </div>
                    <div className="threat-lens-toggles">
                      <span className="lens-label">Demographic Lens:</span>
                      <button
                        type="button"
                        className={`lens-btn ${threatLens === 'tabletop' ? 'active' : ''}`}
                        onClick={() => setThreatLens('tabletop')}
                      >
                        <FontAwesomeIcon icon={faDiceD20} /> Tabletop RPG / 5e
                      </button>
                      <button
                        type="button"
                        className={`lens-btn ${threatLens === 'all_ages' ? 'active' : ''}`}
                        onClick={() => setThreatLens('all_ages')}
                      >
                        <FontAwesomeIcon icon={faChild} /> All-Ages / Story
                      </button>
                      <button
                        type="button"
                        className={`lens-btn ${threatLens === 'canon' ? 'active' : ''}`}
                        onClick={() => setThreatLens('canon')}
                      >
                        <FontAwesomeIcon icon={faBookOpen} /> Adult Master Canon
                      </button>
                    </div>
                  </div>

                  {citedBestiary.length > 0 ? (
                    <div className="threat-cards-grid">
                      {citedBestiary.map((b) => {
                        const adapt = b.demographicAdaptations || {};
                        const maxHp = threatLens === 'all_ages' && adapt.all_ages?.hearts
                          ? adapt.all_ages.hearts
                          : (b.hearts || 4);
                        const curHp = creatureHp[b.id] !== undefined ? creatureHp[b.id] : maxHp;
                        const isDefeated = curHp === 0;

                        return (
                          <div key={b.id} className={`threat-card ${isDefeated ? 'defeated' : ''}`}>
                            <div className="threat-card-top">
                              <div>
                                <h4 className="threat-name">{b.name}</h4>
                                <span className="threat-cat">{b.category || 'Threat'}</span>
                              </div>
                              <span className={`threat-status-tag ${isDefeated ? 'defeated' : 'active'}`}>
                                {isDefeated ? 'DEFEATED' : 'ACTIVE'}
                              </span>
                            </div>

                            {/* In-Universe World Grounding */}
                            <div className="threat-canon-grounding">
                              <div className="grounding-row">
                                <span className="grounding-label">🌍 In-Universe Origin:</span>
                                <span className="grounding-text">{b.inUniverseBackstory || b.description || 'Native organism to the frontier wilderness.'}</span>
                              </div>
                              <div className="grounding-row">
                                <span className="grounding-label">🎯 Motivation &amp; Desires:</span>
                                <span className="grounding-text">{b.motivation || 'Defends its territorial perimeter against encroaching travelers.'}</span>
                              </div>
                            </div>

                            {/* Lens-Specific Content */}
                            {threatLens === 'tabletop' && (
                              <div className="lens-content-tabletop">
                                {adapt.tabletop_rpg && (
                                  <div className="tabletop-meta-row">
                                    {adapt.tabletop_rpg.challengeRating && (
                                      <span className="meta-chip-cr">{adapt.tabletop_rpg.challengeRating}</span>
                                    )}
                                    {adapt.tabletop_rpg.combatRole && (
                                      <span className="meta-chip-role">{adapt.tabletop_rpg.combatRole}</span>
                                    )}
                                  </div>
                                )}

                                {adapt.tabletop_rpg?.encounterPressure && (
                                  <div className="encounter-pressure-box">
                                    <strong>Encounter Pressure:</strong> {adapt.tabletop_rpg.encounterPressure}
                                  </div>
                                )}

                                {adapt.tabletop_rpg?.lairAction && (
                                  <div className="lair-action-box">
                                    <strong>Lair Action:</strong> {adapt.tabletop_rpg.lairAction}
                                  </div>
                                )}

                                {adapt.tabletop_rpg?.lootHook && (
                                  <div className="loot-hook-box">
                                    <strong>Loot / Harvest Hook:</strong> {adapt.tabletop_rpg.lootHook}
                                  </div>
                                )}
                              </div>
                            )}

                            {threatLens === 'all_ages' && (
                              <div className="lens-content-all-ages">
                                <p className="all-ages-summary">
                                  {adapt.all_ages?.summary || b.description}
                                </p>
                                {adapt.all_ages?.guidance && (
                                  <div className="all-ages-guidance">
                                    💡 <strong>Non-Lethal Resolution:</strong> {adapt.all_ages.guidance}
                                  </div>
                                )}
                              </div>
                            )}

                            {threatLens === 'canon' && (
                              <div className="lens-content-canon">
                                {adapt.adult_fiction?.proseTexture && (
                                  <p className="canon-prose-texture">
                                    <em>"{adapt.adult_fiction.proseTexture}"</em>
                                  </p>
                                )}
                                {adapt.adult_fiction?.moralAmbiguity && (
                                  <div className="canon-moral-box">
                                    ⚖️ <strong>Moral Ambiguity:</strong> {adapt.adult_fiction.moralAmbiguity}
                                  </div>
                                )}
                                {b.ecologicalNiche && (
                                  <div className="canon-niche-box">
                                    🌿 <strong>Ecological Niche:</strong> {b.ecologicalNiche}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Hearts / HP Tracker */}
                            <div className="hearts-tracker-box">
                              <span className="hearts-label">Hearts / HP:</span>
                              <div className="hearts-controls">
                                <button className="hp-step-btn" onClick={() => adjustHp(b.id, -1, maxHp)}>−</button>
                                <div className="hearts-display">
                                  {Array.from({ length: maxHp }).map((_, i) => (
                                    <FontAwesomeIcon
                                      key={i}
                                      icon={faHeart}
                                      className={`heart-icon ${i < curHp ? 'filled' : 'empty'}`}
                                    />
                                  ))}
                                  <span className="hp-numeric">({curHp} / {maxHp})</span>
                                </div>
                                <button className="hp-step-btn" onClick={() => adjustHp(b.id, 1, maxHp)}>+</button>
                              </div>
                            </div>

                            {/* Tactics */}
                            <div className="tactics-chips-wrap">
                              <span className="tactics-label">Tactics:</span>
                              {(threatLens === 'all_ages' && adapt.all_ages?.simplifiedTactics
                                ? adapt.all_ages.simplifiedTactics
                                : b.tactics
                              ).map((t, idx) => (
                                <span key={idx} className="tactic-chip">{t}</span>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="empty-panel-state">
                      No specific bestiary creatures cited in this campaign. Add threats using the canon references panel.
                    </div>
                  )}
                </div>
              )}

              {/* Sub-View 3: Operatives & Cast */}
              {activeWork.type === 'campaign' && activeSubTab === 'cast' && (
                <div className="cast-view">
                  <div className="section-instruction">
                    Key personas, authorities, and scouts active in this campaign's theater of operation.
                  </div>
                  {citedCharacters.length > 0 ? (
                    <div className="npc-roster-grid">
                      {citedCharacters.map((c) => (
                        <div key={c.id} className="npc-roster-card">
                          <div className="npc-card-header">
                            <div>
                              <h4>{c.name}</h4>
                              <span className="npc-role">{c.role || 'Operative / Key NPC'}</span>
                            </div>
                            <span className="npc-type-tag">Canon Person</span>
                          </div>
                          <div className="npc-motivation">
                            <strong>Motivation:</strong> {c.motivation || 'Protects local harbor interests and garrison peace.'}
                          </div>
                          <p className="npc-desc">{c.description || c.background || 'Garrison operative stationed at the frontier.'}</p>
                          <div className="npc-action-row">
                            <span className="location-pin">📍 {citedLocations[0]?.name || 'Tallgate Keep'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-panel-state">
                      No specific characters cited in this campaign.
                    </div>
                  )}
                </div>
              )}

              {/* Sub-View: Story Reader Mode */}
              {activeWork.type === 'story' && activeSubTab === 'reader' && (
                <div className="story-reader-embedded" style={{ marginTop: '0.5rem' }}>
                  <StoryReader
                    storyId={projectId}
                    initialDerivativeId={activeWork.id}
                  />
                </div>
              )}

              {/* Sub-View 4: Adventure Brief & Outlines */}
              {activeSubTab === 'brief' && (
                <div className="adventure-text-view">
                  {/* Cited Canon References */}
                  {activeWork.sourceCanonReferences && activeWork.sourceCanonReferences.length > 0 && (
                    <div className="source-references-box">
                      <div className="references-header">
                        Cited Universe Canon References ({activeWork.sourceCanonReferences.length}):
                      </div>
                      <div className="references-wrap">
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

                  <div className="form-group" style={{ marginTop: '1rem' }}>
                    <label style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-heading)', marginBottom: '0.5rem', display: 'block' }}>
                      Adventure Brief &amp; Manuscript Outlines
                    </label>
                    <textarea
                      className="form-textarea viewer-content"
                      rows={16}
                      value={activeWork.content || ''}
                      onChange={(e) => setActiveWork({ ...activeWork, content: e.target.value })}
                    />
                  </div>
                </div>
              )}

              {/* Sub-View 5: D&D 5e / VTT Bundle */}
              {activeWork.type === 'campaign' && activeSubTab === 'dnd_export' && (
                <div className="dnd-export-view">
                  <div className="export-top-bar">
                    <div>
                      <h4>D&amp;D Campaign Table Export Bundle</h4>
                      <p>Full structured asset packet ready for live VTT and tabletop play.</p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn-action-outline" onClick={() => handleCopyDndExport(activeWork.id)}>
                        <FontAwesomeIcon icon={copied ? faCheck : faCopy} />
                        {copied ? 'Copied Bundle JSON!' : 'Copy JSON'}
                      </button>
                      <button className="btn-generate" onClick={() => handleDownloadDndExport(activeWork.id)}>
                        <FontAwesomeIcon icon={faDownload} /> Download .json
                      </button>
                    </div>
                  </div>

                  <div className="json-preview-container">
                    <pre className="json-code-block">
                      {dndArtifact ? JSON.stringify(dndArtifact, null, 2) : 'Loading export artifact...'}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '3rem' }}>
              Select a derivative work from the catalog to open its studio.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
