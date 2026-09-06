import { useState, useEffect, useRef, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faLandmark,
  faPlaceOfWorship,
  faLanguage,
  faScroll,
  faPlus,
  faTrash,
  faSearch,
  faBullseye,
  faDiagramProject,
  faCircleCheck,
  faMicrochip,
  faShieldHalved,
  faCoins,
  faSitemap,
  faRocket,
  faRotateRight,
  faTowerBroadcast,
  faRadio,
  faLock,
  faUnlock,
} from '@fortawesome/free-solid-svg-icons';
import { api } from '../api';
import type { Faction, CanonRelationship } from '../types/story';
import './CultureCreation.css';

interface Props {
  storyId: string | null;
  ensureStory: () => Promise<string>;
  initialEntityId?: string | null;
  initialSubTab?: string | null;
}

export default function CultureCreation({ storyId, ensureStory, initialEntityId, initialSubTab }: Props) {
  const [activeCultureTab, setActiveCultureTab] = useState<'factions' | 'religions' | 'technologies' | 'languages' | 'myths' | 'signals'>(
    (initialSubTab as any) || 'factions'
  );

  useEffect(() => {
    if (initialSubTab) {
      setActiveCultureTab(initialSubTab as any);
    }
  }, [initialSubTab]);
  const [factions, setFactions] = useState<Faction[]>([]);
  const [selectedFactionId, setSelectedFactionId] = useState<string | null>(initialEntityId ?? null);
  const [filterQuery, setFilterQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [newGoalInput, setNewGoalInput] = useState('');
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Relationships for selected faction
  const [relationships, setRelationships] = useState<CanonRelationship[]>([]);
  const [showAddRel, setShowAddRel] = useState(false);
  const [relType, setRelType] = useState('allied_with');
  const [relTargetType, setRelTargetType] = useState('faction');
  const [relTargetId, setRelTargetId] = useState('');
  const [relNotes, setRelNotes] = useState('');

  // Additional lore dimensions from encyclopedia
  const [encyclopediaData, setEncyclopediaData] = useState<any>(null);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadFactions = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const list = await api.factions.list(id);
      setFactions(list);
      if (initialEntityId && list.some(f => f.id === initialEntityId)) {
        setSelectedFactionId(initialEntityId);
      } else if (!selectedFactionId && list.length > 0) {
        setSelectedFactionId(list[0].id);
      }
    } catch (err) {
      console.error('Failed to load factions:', err);
    } finally {
      setLoading(false);
    }
  }, [initialEntityId, selectedFactionId]);

  const loadRelationships = useCallback(async (projectId: string, factionId: string) => {
    try {
      const rels = await api.relationships.list(projectId, factionId);
      setRelationships(rels);
    } catch (err) {
      console.error('Failed to load relationships:', err);
    }
  }, []);

  const loadEncyclopedia = useCallback(async (id: string) => {
    try {
      const data = await api.stories.getEncyclopedia(id);
      setEncyclopediaData(data);
    } catch (err) {
      console.error('Failed to load encyclopedia culture:', err);
    }
  }, []);

  useEffect(() => {
    if (storyId) {
      loadFactions(storyId);
      loadEncyclopedia(storyId);
    }
  }, [storyId, loadFactions, loadEncyclopedia]);

  useEffect(() => {
    if (initialEntityId) {
      setSelectedFactionId(initialEntityId);
      setActiveCultureTab('factions');
    }
  }, [initialEntityId]);

  useEffect(() => {
    if (storyId && selectedFactionId) {
      loadRelationships(storyId, selectedFactionId);
    } else {
      setRelationships([]);
    }
  }, [storyId, selectedFactionId, loadRelationships]);

  const selectedFaction = factions.find(f => f.id === selectedFactionId);

  const handleCreateFaction = async () => {
    try {
      const id = await ensureStory();
      const newFaction = await api.factions.create({
        projectId: id,
        name: 'New Faction',
        description: 'Describe this faction’s sphere of influence, leadership, and creed.',
        goals: ['Establish safe trade routes'],
      });
      setFactions(prev => [...prev, newFaction]);
      setSelectedFactionId(newFaction.id);
    } catch (err) {
      console.error('Failed to create faction:', err);
    }
  };

  const handleDeleteFaction = async (facId: string) => {
    if (!confirm('Are you sure you want to delete this faction?')) return;
    try {
      await api.factions.delete(facId);
      setFactions(prev => prev.filter(f => f.id !== facId));
      if (selectedFactionId === facId) {
        setSelectedFactionId(null);
      }
    } catch (err) {
      console.error('Failed to delete faction:', err);
    }
  };

  const updateFactionField = (facId: string, field: 'name' | 'description', value: string) => {
    setFactions(prev => prev.map(f => f.id === facId ? { ...f, [field]: value } : f));

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await api.factions.update(facId, { [field]: value });
        setSaveStatus('Saved');
        setTimeout(() => setSaveStatus(null), 2000);
      } catch (err) {
        console.error('Failed to save faction:', err);
      }
    }, 600);
  };

  const handleAddGoal = async () => {
    if (!selectedFaction || !newGoalInput.trim()) return;
    const updatedGoals = [...selectedFaction.goals, newGoalInput.trim()];
    setFactions(prev => prev.map(f => f.id === selectedFaction.id ? { ...f, goals: updatedGoals } : f));
    setNewGoalInput('');
    try {
      await api.factions.update(selectedFaction.id, { goals: updatedGoals });
    } catch (err) {
      console.error('Failed to add goal:', err);
    }
  };

  const handleRemoveGoal = async (goalIndex: number) => {
    if (!selectedFaction) return;
    const updatedGoals = selectedFaction.goals.filter((_, i) => i !== goalIndex);
    setFactions(prev => prev.map(f => f.id === selectedFaction.id ? { ...f, goals: updatedGoals } : f));
    try {
      await api.factions.update(selectedFaction.id, { goals: updatedGoals });
    } catch (err) {
      console.error('Failed to remove goal:', err);
    }
  };

  const handleCreateRelationship = async () => {
    if (!storyId || !selectedFactionId || !relTargetId.trim()) return;
    try {
      const created = await api.relationships.create({
        projectId: storyId,
        sourceEntityId: selectedFactionId,
        sourceEntityType: 'faction',
        targetEntityId: relTargetId.trim(),
        targetEntityType: relTargetType,
        relationshipType: relType,
        notes: relNotes.trim(),
      });
      setRelationships(prev => [created, ...prev]);
      setShowAddRel(false);
      setRelTargetId('');
      setRelNotes('');
    } catch (err) {
      alert('Failed to add relationship: ' + (err as Error).message);
    }
  };

  const handleDeleteRelationship = async (relId: string) => {
    try {
      await api.relationships.delete(relId);
      setRelationships(prev => prev.filter(r => r.id !== relId));
    } catch (err) {
      console.error('Failed to delete relationship:', err);
    }
  };

  const filteredFactions = factions.filter(f =>
    f.name.toLowerCase().includes(filterQuery.toLowerCase()) ||
    f.description.toLowerCase().includes(filterQuery.toLowerCase())
  );

  return (
    <div className="culture-creation">
      {/* Sub-navigation for Culture Dimensions */}
      <div className="culture-subnav">
        <button
          className={`culture-subnav-btn ${activeCultureTab === 'factions' ? 'active' : ''}`}
          onClick={() => setActiveCultureTab('factions')}
        >
          <FontAwesomeIcon icon={faLandmark} /> Factions &amp; Blocs ({factions.length})
        </button>
        <button
          className={`culture-subnav-btn ${activeCultureTab === 'religions' ? 'active' : ''}`}
          onClick={() => setActiveCultureTab('religions')}
        >
          <FontAwesomeIcon icon={faPlaceOfWorship} /> Religions &amp; Beliefs ({encyclopediaData?.counts?.religions ?? 0})
        </button>
        <button
          className={`culture-subnav-btn ${activeCultureTab === 'technologies' ? 'active' : ''}`}
          onClick={() => setActiveCultureTab('technologies')}
        >
          <FontAwesomeIcon icon={faMicrochip} /> Technology &amp; Relics ({encyclopediaData?.counts?.technologies ?? 0})
        </button>
        <button
          className={`culture-subnav-btn ${activeCultureTab === 'languages' ? 'active' : ''}`}
          onClick={() => setActiveCultureTab('languages')}
        >
          <FontAwesomeIcon icon={faLanguage} /> Languages &amp; Naming ({encyclopediaData?.counts?.languages ?? 0})
        </button>
        <button
          className={`culture-subnav-btn ${activeCultureTab === 'signals' ? 'active' : ''}`}
          onClick={() => setActiveCultureTab('signals')}
        >
          <FontAwesomeIcon icon={faTowerBroadcast} /> Ghost Signals &amp; Anomalies ({encyclopediaData?.counts?.signals ?? 0})
        </button>
        <button
          className={`culture-subnav-btn ${activeCultureTab === 'myths' ? 'active' : ''}`}
          onClick={() => setActiveCultureTab('myths')}
        >
          <FontAwesomeIcon icon={faScroll} /> Folklore &amp; Myths
        </button>
      </div>

      {/* 1. FACTIONS TAB */}
      {activeCultureTab === 'factions' && (
        <div className="factions-layout">
          {/* Factions Sidebar */}
          <div className="factions-sidebar">
            <div className="sidebar-header">
              <h3>Factions ({factions.length})</h3>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button
                  onClick={() => {
                    if (storyId) {
                      loadFactions(storyId);
                      loadEncyclopedia(storyId);
                    }
                  }}
                  className="add-button"
                  style={{ background: '#334155' }}
                  title="Refresh factions and politics"
                  disabled={loading}
                >
                  <FontAwesomeIcon icon={faRotateRight} spin={loading} />
                </button>
                <button onClick={handleCreateFaction} className="add-button">
                  <FontAwesomeIcon icon={faPlus} /> New
                </button>
              </div>
            </div>

            <div className="faction-search-wrap">
              <FontAwesomeIcon icon={faSearch} className="search-icon" />
              <input
                type="text"
                placeholder="Filter factions..."
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                className="faction-search-input"
              />
            </div>

            <div className="factions-list">
              {loading && factions.length === 0 ? (
                <div className="empty-state-muted">Loading factions...</div>
              ) : filteredFactions.length === 0 ? (
                <div className="empty-state-muted">
                  {filterQuery ? 'No factions match your search.' : 'No factions registered yet.'}
                </div>
              ) : (
                filteredFactions.map((fac) => (
                  <div
                    key={fac.id}
                    className={`faction-list-item ${selectedFactionId === fac.id ? 'active' : ''}`}
                    onClick={() => setSelectedFactionId(fac.id)}
                  >
                    <div className="faction-item-header">
                      <span className="faction-item-name">{fac.name}</span>
                      <button
                        className="delete-item-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteFaction(fac.id);
                        }}
                        title="Delete faction"
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </div>
                    <div className="faction-item-preview">
                      {fac.description ? fac.description.slice(0, 60) + '...' : 'No description recorded'}
                    </div>
                    {fac.goals && fac.goals.length > 0 && (
                      <div className="faction-item-goals-tag">
                        <FontAwesomeIcon icon={faBullseye} /> {fac.goals.length} {fac.goals.length === 1 ? 'goal' : 'goals'}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Faction Editor */}
          <div className="faction-editor">
            {selectedFaction ? (
              <div className="faction-editor-content">
                <div className="editor-topbar">
                  <span className="editor-badge">Faction Record</span>
                  {saveStatus && (
                    <span className="save-pill">
                      <FontAwesomeIcon icon={faCircleCheck} /> {saveStatus}
                    </span>
                  )}
                </div>

                <div className="form-group">
                  <label>Faction Name</label>
                  <input
                    type="text"
                    className="faction-name-input"
                    value={selectedFaction.name}
                    onChange={(e) => updateFactionField(selectedFaction.id, 'name', e.target.value)}
                    placeholder="Faction or Political Bloc Title"
                  />
                </div>

                <div className="form-group">
                  <label>Ideology, Governance &amp; Sphere of Influence</label>
                  <textarea
                    className="faction-desc-textarea"
                    value={selectedFaction.description}
                    onChange={(e) => updateFactionField(selectedFaction.id, 'description', e.target.value)}
                    placeholder="Describe their leadership structure, headquarters, territorial claims, and political posture..."
                    rows={5}
                  />
                </div>

                {/* Strategic Goals */}
                <div className="goals-section">
                  <label className="section-label">
                    <FontAwesomeIcon icon={faBullseye} /> Strategic Goals &amp; Agenda
                  </label>
                  <div className="goals-list">
                    {selectedFaction.goals && selectedFaction.goals.length > 0 ? (
                      selectedFaction.goals.map((goal, idx) => (
                        <div key={idx} className="goal-item">
                          <span className="goal-bullet">•</span>
                          <span className="goal-text">{goal}</span>
                          <button
                            type="button"
                            className="goal-delete-btn"
                            onClick={() => handleRemoveGoal(idx)}
                            title="Remove goal"
                          >
                            <FontAwesomeIcon icon={faTrash} />
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="empty-state-muted">No strategic goals defined. Add one below.</div>
                    )}
                  </div>

                  <div className="add-goal-form">
                    <input
                      type="text"
                      placeholder="Add a new strategic goal or diplomatic priority..."
                      value={newGoalInput}
                      onChange={(e) => setNewGoalInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddGoal();
                        }
                      }}
                      className="goal-input"
                    />
                    <button type="button" onClick={handleAddGoal} className="add-goal-btn">
                      <FontAwesomeIcon icon={faPlus} /> Add Goal
                    </button>
                  </div>
                </div>

                {/* Political & Military Doctrine */}
                {selectedFaction.doctrine && (
                  <div className="form-group" style={{ marginTop: '1.25rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#93c5fd', fontWeight: 600 }}>
                      <FontAwesomeIcon icon={faShieldHalved} /> Political &amp; Military Doctrine
                    </label>
                    <div style={{ padding: '0.75rem 1rem', background: 'rgba(30, 41, 59, 0.7)', borderRadius: 6, border: '1px solid rgba(147, 197, 253, 0.2)', color: '#e2e8f0', fontSize: '0.88rem', lineHeight: 1.5 }}>
                      {selectedFaction.doctrine}
                    </div>
                  </div>
                )}

                {/* Economic Leverage & Monopolies */}
                {selectedFaction.economicLeverage && (
                  <div className="form-group" style={{ marginTop: '1rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#facc15', fontWeight: 600 }}>
                      <FontAwesomeIcon icon={faCoins} /> Economic Leverage &amp; Monopolies
                    </label>
                    <div style={{ padding: '0.75rem 1rem', background: 'rgba(30, 41, 59, 0.7)', borderRadius: 6, border: '1px solid rgba(250, 204, 21, 0.2)', color: '#e2e8f0', fontSize: '0.88rem', lineHeight: 1.5 }}>
                      {selectedFaction.economicLeverage}
                    </div>
                  </div>
                )}

                {/* Corporate Structure / Governance */}
                {selectedFaction.corporateStructure && (
                  <div className="form-group" style={{ marginTop: '1rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#c084fc', fontWeight: 600 }}>
                      <FontAwesomeIcon icon={faSitemap} /> Leadership &amp; Governance Structure
                    </label>
                    <div style={{ padding: '0.75rem 1rem', background: 'rgba(30, 41, 59, 0.7)', borderRadius: 6, border: '1px solid rgba(192, 132, 252, 0.2)', color: '#e2e8f0', fontSize: '0.88rem', lineHeight: 1.5 }}>
                      {selectedFaction.corporateStructure}
                    </div>
                  </div>
                )}

                {/* Military, Industrial & Fleet Assets */}
                {selectedFaction.assets && selectedFaction.assets.length > 0 && (
                  <div className="assets-section" style={{ marginTop: '1.25rem' }}>
                    <label className="section-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#38bdf8' }}>
                      <FontAwesomeIcon icon={faRocket} /> Military, Fleet &amp; Industrial Assets ({selectedFaction.assets.length})
                    </label>
                    <div className="faction-assets-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.75rem', marginTop: '0.5rem' }}>
                      {selectedFaction.assets.map((asset, aIdx) => (
                        <div key={aIdx} style={{ padding: '0.75rem', borderRadius: 6, background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(56, 189, 248, 0.25)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.35rem' }}>
                            <strong style={{ fontSize: '0.88rem', color: '#f1f5f9' }}>{asset.name}</strong>
                            <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem', borderRadius: 4, background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', textTransform: 'capitalize' }}>
                              {asset.type.replace('_', ' ')}
                            </span>
                          </div>
                          <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.4 }}>{asset.summary}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Canon Graph Relationships */}
                <div className="faction-relationships-section">
                  <div className="rel-header-row">
                    <label className="section-label">
                      <FontAwesomeIcon icon={faDiagramProject} /> Canon Relationships ({relationships.length})
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowAddRel(!showAddRel)}
                      className="add-rel-btn"
                    >
                      <FontAwesomeIcon icon={faPlus} /> Link Entity
                    </button>
                  </div>

                  {showAddRel && (
                    <div className="add-rel-panel">
                      <div className="rel-inputs-row">
                        <select
                          value={relType}
                          onChange={(e) => setRelType(e.target.value)}
                          className="rel-select"
                        >
                          <option value="allied_with">Allied With</option>
                          <option value="rival_of">Rival Of</option>
                          <option value="controls_territory">Controls Territory (Location)</option>
                          <option value="headquartered_at">Headquartered At</option>
                          <option value="worships">Worships (Deity / Religion)</option>
                          <option value="feud_with">Blood Feud With</option>
                        </select>

                        <select
                          value={relTargetType}
                          onChange={(e) => setRelTargetType(e.target.value)}
                          className="rel-select"
                        >
                          <option value="faction">Faction</option>
                          <option value="character">Character</option>
                          <option value="location">Location</option>
                          <option value="religion">Religion</option>
                        </select>

                        <input
                          type="text"
                          placeholder="Target entity ID or name"
                          value={relTargetId}
                          onChange={(e) => setRelTargetId(e.target.value)}
                          className="rel-input"
                        />
                      </div>

                      <input
                        type="text"
                        placeholder="Context or treaty notes for this relationship..."
                        value={relNotes}
                        onChange={(e) => setRelNotes(e.target.value)}
                        className="rel-input"
                      />

                      <div className="rel-action-row">
                        <button type="button" onClick={handleCreateRelationship} className="save-rel-btn">
                          Save Relationship
                        </button>
                        <button type="button" onClick={() => setShowAddRel(false)} className="cancel-rel-btn">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="rel-list">
                    {relationships.length === 0 ? (
                      <div className="empty-state-muted">No canon relationships connected to this faction yet.</div>
                    ) : (
                      relationships.map((r) => (
                        <div key={r.id} className="rel-item">
                          <div className="rel-info">
                            <span className="rel-type-tag">{r.relationshipType.replace(/_/g, ' ')}</span>
                            <span className="rel-arrow">→</span>
                            <span className="rel-target">
                              {r.targetEntityId === selectedFaction.id ? r.sourceEntityId : r.targetEntityId}
                            </span>
                            <span className="rel-target-type">
                              ({r.targetEntityId === selectedFaction.id ? r.sourceEntityType : r.targetEntityType})
                            </span>
                            {r.notes && <div className="rel-notes">{r.notes}</div>}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteRelationship(r.id)}
                            className="rel-delete-btn"
                            title="Remove relationship"
                          >
                            <FontAwesomeIcon icon={faTrash} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty-editor-state">
                <h3>Select a faction or create a new one</h3>
                <p>Manage alliances, territorial disputes, strategic agendas, and ideological tenets.</p>
                <button onClick={handleCreateFaction} className="add-button" style={{ marginTop: '1rem' }}>
                  <FontAwesomeIcon icon={faPlus} /> Create First Faction
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. RELIGIONS TAB */}
      {activeCultureTab === 'religions' && (
        <div className="culture-generic-panel">
          <div className="panel-header">
            <h3><FontAwesomeIcon icon={faPlaceOfWorship} /> Religions, Deities &amp; Sacred Doctrines</h3>
            <p>Deities, sacred taboos, rites of passage, and theological schisms across the realm.</p>
          </div>
          {encyclopediaData?.catalog?.religions && encyclopediaData.catalog.religions.length > 0 ? (
            <div className="lore-cards-grid">
              {encyclopediaData.catalog.religions.map((r: any) => (
                <div key={r.id} className="lore-card">
                  <h4>{r.name}</h4>
                  <div className="lore-meta">
                    <strong>Deities:</strong> {Array.isArray(r.deities) ? r.deities.join(', ') : 'None listed'}
                  </div>
                  <div className="lore-desc">
                    {Array.isArray(r.beliefs) && r.beliefs.length > 0 ? (
                      <ul>
                        {r.beliefs.map((b: string, i: number) => <li key={i}>{b}</li>)}
                      </ul>
                    ) : (
                      <em>No explicit doctrines recorded.</em>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state-card">
              <p>No religions drafted for this universe yet. Use the Generation Harness with task type <code>religion_belief_lore</code> to generate divine pantheons and sacred taboos.</p>
            </div>
          )}
        </div>
      )}

      {/* 2b. TECHNOLOGIES & RELICS TAB */}
      {activeCultureTab === 'technologies' && (
        <div className="culture-generic-panel">
          <div className="panel-header">
            <h3><FontAwesomeIcon icon={faMicrochip} /> Technology, Cybernetics &amp; Arcane Systems</h3>
            <p>Quantum principles, cybernetic augments, proprietary cartel patents, and forbidden taboos.</p>
          </div>
          {encyclopediaData?.catalog?.technologies && encyclopediaData.catalog.technologies.length > 0 ? (
            <div className="lore-cards-grid">
              {encyclopediaData.catalog.technologies.map((t: any) => (
                <div key={t.id} className="lore-card tech-card">
                  <div className="tech-card-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <h4 style={{ margin: 0 }}>{t.name}</h4>
                    <div className="tech-pills" style={{ display: 'flex', gap: '0.4rem' }}>
                      {t.classification && (
                        <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: 4, background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
                          {t.classification}
                        </span>
                      )}
                      {t.proliferation && (
                        <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: 4, background: 'rgba(234, 179, 8, 0.15)', color: '#facc15' }}>
                          {t.proliferation}
                        </span>
                      )}
                    </div>
                  </div>
                  {t.principles && (
                    <div className="tech-section" style={{ marginBottom: '0.75rem' }}>
                      <strong style={{ color: '#cbd5e1', fontSize: '0.82rem', display: 'block', marginBottom: '0.25rem' }}>
                        Core Principles &amp; Physics:
                      </strong>
                      <p className="lore-desc" style={{ margin: 0, fontSize: '0.88rem', color: '#94a3b8', lineHeight: 1.5 }}>{t.principles}</p>
                    </div>
                  )}
                  {t.limitations && (
                    <div className="tech-section" style={{ marginBottom: '0.75rem' }}>
                      <strong style={{ color: '#cbd5e1', fontSize: '0.82rem', display: 'block', marginBottom: '0.25rem' }}>
                        Operational Limitations &amp; Weaknesses:
                      </strong>
                      <p className="lore-desc" style={{ margin: 0, fontSize: '0.88rem', color: '#94a3b8', lineHeight: 1.5 }}>{t.limitations}</p>
                    </div>
                  )}
                  {t.patentsOrTaboos && (
                    <div className="tech-section taboos-section" style={{ marginTop: '0.5rem', padding: '0.6rem 0.8rem', background: 'rgba(239, 68, 68, 0.1)', borderLeft: '3px solid #ef4444', borderRadius: 4 }}>
                      <strong style={{ color: '#f87171', fontSize: '0.8rem', display: 'block', marginBottom: '0.2rem' }}>
                        Patents &amp; Forbidden Taboos:
                      </strong>
                      <p className="lore-desc" style={{ margin: 0, fontSize: '0.85rem', color: '#fca5a5', lineHeight: 1.4 }}>{t.patentsOrTaboos}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state-card">
              <p>No technology or arcane systems registered yet. Use the Generation Harness with task type <code>technology_lore_refinement</code> to generate cybernetics, power cores, and quantum lore.</p>
            </div>
          )}
        </div>
      )}

      {/* 3. LANGUAGES TAB */}
      {activeCultureTab === 'languages' && (
        <div className="culture-generic-panel">
          <div className="panel-header">
            <h3><FontAwesomeIcon icon={faLanguage} /> Languages, Dialects &amp; Naming Conventions</h3>
            <p>Regional vernaculars, linguistic naming conventions, and ancestral dialects.</p>
          </div>
          {encyclopediaData?.catalog?.languages && encyclopediaData.catalog.languages.length > 0 ? (
            <div className="lore-cards-grid">
              {encyclopediaData.catalog.languages.map((l: any) => (
                <div key={l.id} className="lore-card">
                  <h4>{l.name}</h4>
                  {l.grammar && <p className="lore-desc">{l.grammar}</p>}
                  {l.vocabulary && Object.keys(l.vocabulary).length > 0 && (
                    <div className="vocab-chips">
                      {Object.entries(l.vocabulary).map(([k, v]) => (
                        <span key={k} className="vocab-chip">
                          <strong>{k}:</strong> {String(v)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state-card">
              <p>No language conventions registered yet. Use the Generation Harness with task type <code>language_culture_conventions</code> to generate regional idioms and dialect vocabularies.</p>
            </div>
          )}
        </div>
      )}

      {/* 4. MYTHS TAB */}
      {activeCultureTab === 'myths' && (
        <div className="culture-generic-panel">
          <div className="panel-header">
            <h3><FontAwesomeIcon icon={faScroll} /> Folklore, Creation Myths &amp; Legends</h3>
            <p>Ancient epics, cosmologies, heroic legends, and cautionary folklore.</p>
          </div>
          {encyclopediaData?.catalog?.cultures && encyclopediaData.catalog.cultures.length > 0 && encyclopediaData.catalog.cultures[0]?.myths?.length > 0 ? (
            <div className="lore-cards-grid">
              {encyclopediaData.catalog.cultures[0].myths.map((m: any, i: number) => (
                <div key={i} className="lore-card">
                  <h4>{typeof m === 'string' ? m : (m.title || `Myth ${i + 1}`)}</h4>
                  {typeof m === 'object' && m.description && <p className="lore-desc">{m.description}</p>}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state-card">
              <p>No folklore entries recorded yet. Record foundational oral histories and myths to enrich derivative story prompts.</p>
            </div>
          )}
        </div>
      )}

      {/* 5. GHOST SIGNALS & ANOMALIES TAB */}
      {activeCultureTab === 'signals' && (
        <div className="culture-generic-panel">
          <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3><FontAwesomeIcon icon={faTowerBroadcast} /> Intercepted Ghost Signals &amp; Subspace Anomalies</h3>
              <p>Decoded audio logs, psychic echo transcripts, and anomalous subspace transmissions across the void.</p>
            </div>
            <button
              onClick={() => storyId && loadEncyclopedia(storyId)}
              className="add-button"
              style={{ background: '#334155' }}
              title="Refresh signals"
            >
              <FontAwesomeIcon icon={faRotateRight} />
            </button>
          </div>

          {encyclopediaData?.catalog?.signals && encyclopediaData.catalog.signals.length > 0 ? (
            <div className="lore-cards-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '1.25rem', marginTop: '1rem' }}>
              {encyclopediaData.catalog.signals.map((sig: any) => (
                <div key={sig.id} className="lore-card" style={{ background: 'rgba(15, 23, 42, 0.75)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: 8, padding: '1.25rem', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <div>
                      <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1.2rem', color: '#f8fafc' }}>
                        <FontAwesomeIcon icon={faRadio} style={{ color: '#38bdf8', marginRight: '0.5rem' }} />
                        {sig.designation}
                      </h4>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.35rem' }}>
                        <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: 4, background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', fontFamily: 'monospace' }}>
                          Freq: {sig.frequency}
                        </span>
                        {sig.originVector && (
                          <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: 4, background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc' }}>
                            Vector: {sig.originVector}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      style={{
                        padding: '0.25rem 0.6rem',
                        borderRadius: 4,
                        border: '1px solid #475569',
                        background: sig.isProtected ? 'rgba(59, 130, 246, 0.2)' : 'rgba(15, 23, 42, 0.6)',
                        color: sig.isProtected ? '#60a5fa' : '#94a3b8',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                      }}
                      onClick={async () => {
                        await api.mysterySignals.setProtection(sig.id, !sig.isProtected);
                        if (storyId) loadEncyclopedia(storyId);
                      }}
                      title={sig.isProtected ? 'Canon Protected' : 'Mutable'}
                    >
                      <FontAwesomeIcon icon={sig.isProtected ? faLock : faUnlock} style={{ marginRight: '0.3rem' }} />
                      {sig.isProtected ? 'Protected' : 'Mutable'}
                    </button>
                  </div>

                  {/* Terminal Readout for Transcript */}
                  {sig.transmissionTranscript && (
                    <div style={{
                      margin: '0.75rem 0',
                      padding: '0.85rem 1rem',
                      borderRadius: 6,
                      background: '#020617',
                      border: '1px solid rgba(34, 197, 94, 0.3)',
                      color: '#4ade80',
                      fontFamily: 'monospace',
                      fontSize: '0.88rem',
                      lineHeight: 1.5,
                      boxShadow: 'inset 0 0 10px rgba(0,0,0,0.5)',
                    }}>
                      <div style={{ fontSize: '0.7rem', color: '#16a34a', textTransform: 'uppercase', marginBottom: '0.35rem', letterSpacing: '0.05em' }}>
                        &gt; DECODED TRANSMISSION LOG
                      </div>
                      &ldquo;{sig.transmissionTranscript}&rdquo;
                    </div>
                  )}

                  {/* Anomalous Properties */}
                  {sig.anomalousProperties && sig.anomalousProperties.length > 0 && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <strong style={{ fontSize: '0.8rem', color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Anomalous Sensor Properties:
                      </strong>
                      <ul style={{ margin: '0.35rem 0 0 1.25rem', padding: 0, color: '#94a3b8', fontSize: '0.82rem', lineHeight: 1.45 }}>
                        {sig.anomalousProperties.map((prop: string, pIdx: number) => (
                          <li key={pIdx} style={{ marginBottom: '0.25rem' }}>{prop}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state-card">
              <p>No anomalous signals intercepted yet. Use the Generation Harness with task type <code>mystery_signal_refinement</code> to capture and decode subspace transmissions.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
