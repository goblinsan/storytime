import { useState, useEffect, useRef, useCallback } from 'react';
import type { BestiaryEntry, BestiaryStatus, SharedBestiaryEntry } from '../types/story';
import { api } from '../api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faDragon, faXmark, faHeart, faSkull, faCircleQuestion,
  faBookOpen, faChild, faDiceD20, faScroll, faGlobe, faPlus,
  faLock, faLockOpen,
} from '@fortawesome/free-solid-svg-icons';
import './Bestiary.css';

interface Props {
  storyId: string | null;
  ensureStory: () => Promise<string>;
  initialEntityId?: string | null;
}

type AdaptationTab = 'canon' | 'all_ages' | 'tabletop' | 'fiction';

const statusIcons: Record<BestiaryStatus, typeof faSkull> = {
  active: faDragon,
  defeated: faSkull,
  unknown: faCircleQuestion,
};

const statusLabels: Record<BestiaryStatus, string> = {
  active: 'Active',
  defeated: 'Defeated',
  unknown: 'Unknown',
};

export default function Bestiary({ storyId, ensureStory, initialEntityId }: Props) {
  const [entries, setEntries] = useState<BestiaryEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialEntityId ?? null);
  const [sharedCatalog, setSharedCatalog] = useState<SharedBestiaryEntry[]>([]);
  const [showAdoptModal, setShowAdoptModal] = useState(false);
  const [activeAdaptTab, setActiveAdaptTab] = useState<AdaptationTab>('canon');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (storyId) {
      api.bestiary.list(storyId).then((list) => {
        setEntries(list);
        if (initialEntityId && list.some(b => b.id === initialEntityId)) {
          setSelectedId(initialEntityId);
        } else if (!selectedId && list.length > 0) {
          setSelectedId(list[0].id);
        }
      }).catch(console.error);
    }
  }, [storyId, initialEntityId]);

  useEffect(() => {
    api.bestiary.listShared()
      .then(setSharedCatalog)
      .catch(console.error);
  }, []);

  const selected = entries.find(e => e.id === selectedId);

  // Group entries by category
  const categories = Array.from(new Set(entries.map(e => e.category || 'Uncategorized')));

  const addEntry = async () => {
    try {
      const id = await ensureStory();
      const newEntry = await api.bestiary.create({
        projectId: id,
        name: 'New Creature',
      });
      setEntries(prev => [...prev, newEntry]);
      setSelectedId(newEntry.id);
    } catch (err) {
      console.error('Failed to add entry:', err);
    }
  };

  const deleteEntry = async (entryId: string) => {
    try {
      await api.bestiary.delete(entryId);
      setEntries(prev => prev.filter(e => e.id !== entryId));
      if (selectedId === entryId) setSelectedId(null);
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  };

  const updateField = useCallback((entryId: string, field: string, value: unknown) => {
    setEntries(prev => prev.map(e => {
      if (e.id !== entryId) return e;
      if (field === 'tactics' && typeof value === 'string') {
        return { ...e, tactics: value.split(',').map(s => s.trim()).filter(Boolean) };
      }
      return { ...e, [field]: value };
    }));

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        const current = entries.find(e => e.id === entryId);
        if (!current) return;
        const payload: Record<string, unknown> = {
          name: current.name,
          category: current.category,
          hearts: current.hearts,
          tactics: current.tactics,
          status: current.status,
          description: current.description,
          notes: current.notes,
          inUniverseBackstory: current.inUniverseBackstory,
          motivation: current.motivation,
          ecologicalNiche: current.ecologicalNiche,
          demographicAdaptations: current.demographicAdaptations,
          [field]: field === 'tactics' && typeof value === 'string'
            ? value.split(',').map(s => s.trim()).filter(Boolean)
            : value,
        };
        await api.bestiary.update(entryId, payload as never);
      } catch (err) {
        console.error('Failed to auto-save bestiary entry:', err);
      }
    }, 800);
  }, [entries]);

  const updateAdaptation = (tier: 'all_ages' | 'tabletop_rpg' | 'adult_fiction', key: string, val: unknown) => {
    if (!selected) return;
    const currentAdaptations = selected.demographicAdaptations || {};
    const tierObj = (currentAdaptations as Record<string, Record<string, unknown>>)[tier] || {};
    const updatedTier = { ...tierObj, [key]: val };
    const updatedAdaptations = { ...currentAdaptations, [tier]: updatedTier };
    updateField(selected.id, 'demographicAdaptations', updatedAdaptations);
  };

  const adoptCreature = async (sharedId: string, isVariant: boolean) => {
    try {
      const pId = await ensureStory();
      const adopted = await api.bestiary.adoptShared({
        projectId: pId,
        sharedBestiaryId: sharedId,
        isVariant,
      });
      setEntries(prev => [...prev, adopted]);
      setSelectedId(adopted.id);
      setShowAdoptModal(false);
    } catch (err) {
      console.error('Failed to adopt shared creature:', err);
    }
  };

  return (
    <div className="bestiary-manager">
      <div className="bestiary-sidebar">
        <div className="bestiary-header">
          <div>
            <h3>Universe Bestiary</h3>
            <span className="bestiary-count">{entries.length} creatures</span>
          </div>
          <button className="add-char-btn" onClick={addEntry} title="Add Creature">
            <FontAwesomeIcon icon={faPlus} />
          </button>
        </div>

        {/* Adopt Shared button */}
        <div style={{ padding: '0.4rem 0.5rem', borderBottom: '1px solid var(--border-subtle)' }}>
          <button
            onClick={() => setShowAdoptModal(true)}
            className="btn-adopt-shared"
          >
            <FontAwesomeIcon icon={faGlobe} /> Adopt Shared Archetype
          </button>
        </div>

        {/* Adopt modal / drawer */}
        {showAdoptModal && (
          <div className="adopt-modal-drawer">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--accent-terracotta)' }}>Shared Universal Archetypes</span>
              <button onClick={() => setShowAdoptModal(false)} className="btn-close-modal">✕</button>
            </div>
            {sharedCatalog.length === 0 ? (
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No shared archetypes found.</div>
            ) : (
              sharedCatalog.map((c) => (
                <div key={c.id} className="shared-catalog-item">
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-heading)' }}>
                    <strong>{c.name}</strong> <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>({c.category})</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    <button
                      onClick={() => adoptCreature(c.id, false)}
                      className="btn-adopt-action"
                    >
                      Adopt
                    </button>
                    <button
                      onClick={() => adoptCreature(c.id, true)}
                      className="btn-adopt-variant"
                      title="Adopt as project variant"
                    >
                      Variant
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        <div className="bestiary-list">
          {categories.map(cat => (
            <div key={cat} className="bestiary-category">
              <div className="category-label">{cat}</div>
              {entries.filter(e => (e.category || 'Uncategorized') === cat).map(entry => (
                <div
                  key={entry.id}
                  className={`bestiary-item ${selectedId === entry.id ? 'active' : ''}`}
                  onClick={() => setSelectedId(entry.id)}
                >
                  <div className="bestiary-avatar">
                    <FontAwesomeIcon icon={statusIcons[entry.status]} />
                  </div>
                  <div className="bestiary-item-info">
                    <span className="bestiary-name">{entry.name}</span>
                    <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', marginTop: '2px' }}>
                      {entry.isSharedVariant ? (
                        <span className="pill-variant">Variant</span>
                      ) : entry.sharedBestiaryId ? (
                        <span className="pill-shared">Shared</span>
                      ) : (
                        <span className="pill-local">Local</span>
                      )}
                      {entry.hearts != null && (
                        <span className="bestiary-hearts" style={{ fontSize: '0.7rem' }}>
                          <FontAwesomeIcon icon={faHeart} /> {entry.hearts}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={`bestiary-status status-${entry.status}`}>
                    {statusLabels[entry.status]}
                  </span>
                  <button
                    className="delete-char-btn"
                    onClick={(e) => { e.stopPropagation(); deleteEntry(entry.id); }}
                    title="Remove creature"
                  >
                    <FontAwesomeIcon icon={faXmark} />
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="bestiary-editor">
        {selected ? (
          <>
            <div className="editor-top-row">
              <input
                type="text"
                placeholder="Creature Name"
                className="character-name-input"
                value={selected.name}
                onChange={(e) => updateField(selected.id, 'name', e.target.value)}
              />
              <span className="sophisticated-badge">Authoritative Master Canon</span>
              <button
                type="button"
                className={`protection-toggle-btn ${selected.isProtected ? 'protected' : ''}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '6px',
                  border: selected.isProtected ? '1px solid #10b981' : '1px solid #64748b',
                  background: selected.isProtected ? 'rgba(16, 185, 129, 0.15)' : 'rgba(100, 116, 139, 0.15)',
                  color: selected.isProtected ? '#10b981' : '#94a3b8',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  marginLeft: 'auto',
                }}
                onClick={async () => {
                  const next = !selected.isProtected;
                  await api.bestiary.setProtection(selected.id, next);
                  setEntries((prev) => prev.map((e) => e.id === selected.id ? { ...e, isProtected: next } : e));
                }}
                title={selected.isProtected ? 'Canon Protected: Immune to autonomous AI overwrites and deletion' : 'Click to protect in canon'}
              >
                <FontAwesomeIcon icon={selected.isProtected ? faLock : faLockOpen} />
                <span>{selected.isProtected ? 'Canon Protected' : 'Protect Canon'}</span>
              </button>
            </div>

            <div className="form-row">
              <div className="form-group" style={{ flex: 2 }}>
                <label>Taxonomy / Category</label>
                <input
                  type="text"
                  placeholder="e.g., Ooze / Arcane Aberration, Humanoid / Sylvan Tactician"
                  value={selected.category}
                  onChange={(e) => updateField(selected.id, 'category', e.target.value)}
                />
              </div>
              <div className="form-group form-group-small">
                <label><FontAwesomeIcon icon={faHeart} /> Hearts</label>
                <input
                  type="number"
                  min="0"
                  value={selected.hearts ?? ''}
                  onChange={(e) => updateField(selected.id, 'hearts', e.target.value ? Number(e.target.value) : null)}
                />
              </div>
              <div className="form-group">
                <label>Status</label>
                <select
                  value={selected.status}
                  onChange={(e) => updateField(selected.id, 'status', e.target.value)}
                >
                  <option value="active">Active in Universe</option>
                  <option value="defeated">Extinct / Defeated</option>
                  <option value="unknown">Unconfirmed Legend</option>
                </select>
              </div>
            </div>

            {/* Core In-Universe Grounding */}
            <div className="canon-depth-box">
              <div className="canon-depth-header">
                <h4>🏛️ Master Canon Depth &amp; In-Universe Grounding</h4>
                <p>Authored at the most sophisticated adult level. Grounded in this world's history, ecology, and faction friction.</p>
              </div>

              <div className="form-group">
                <label>In-Universe Backstory &amp; Evolutionary Origin</label>
                <textarea
                  rows={3}
                  placeholder="Why does this entity exist in this specific universe? What historical, geological, or metaphysical event caused it to emerge?"
                  value={selected.inUniverseBackstory || ''}
                  onChange={(e) => updateField(selected.id, 'inUniverseBackstory', e.target.value)}
                />
              </div>

              <div className="form-row">
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Motivation &amp; Behavioral Drives</label>
                  <textarea
                    rows={2}
                    placeholder="What does it want, protect, fear, or feed upon? Never just a random mob to be hacked."
                    value={selected.motivation || ''}
                    onChange={(e) => updateField(selected.id, 'motivation', e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Ecological Niche &amp; Habitat Impact</label>
                  <textarea
                    rows={2}
                    placeholder="Ecosystem role, territorial corridors, and impact on neighboring human/settlement factions."
                    value={selected.ecologicalNiche || ''}
                    onChange={(e) => updateField(selected.id, 'ecologicalNiche', e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Sensory Description &amp; Morphology</label>
                <textarea
                  rows={2}
                  placeholder="Biological traits, appearance, vocalizations, movement..."
                  value={selected.description}
                  onChange={(e) => updateField(selected.id, 'description', e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Authoritative Combat Tactics &amp; Natural Defenses</label>
                <input
                  type="text"
                  placeholder="e.g., Acid pulse wave, Divide on heavy impact, Dissolves organic armor (comma separated)"
                  value={selected.tactics.join(', ')}
                  onChange={(e) => updateField(selected.id, 'tactics', e.target.value)}
                />
              </div>
            </div>

            {/* Demographic Adaptations Section */}
            <div className="adaptations-container">
              <div className="adaptations-header">
                <div>
                  <h4>🎯 Demographic &amp; Derivative Medium Adaptations</h4>
                  <p>Scale complexity up or down for downstream derivatives while preserving master canon cohesion.</p>
                </div>
                <div className="adapt-tabs">
                  <button
                    type="button"
                    className={`adapt-tab-btn ${activeAdaptTab === 'canon' ? 'active' : ''}`}
                    onClick={() => setActiveAdaptTab('canon')}
                  >
                    <FontAwesomeIcon icon={faBookOpen} /> Full Canon
                  </button>
                  <button
                    type="button"
                    className={`adapt-tab-btn ${activeAdaptTab === 'all_ages' ? 'active' : ''}`}
                    onClick={() => setActiveAdaptTab('all_ages')}
                  >
                    <FontAwesomeIcon icon={faChild} /> All-Ages / Kids
                  </button>
                  <button
                    type="button"
                    className={`adapt-tab-btn ${activeAdaptTab === 'tabletop' ? 'active' : ''}`}
                    onClick={() => setActiveAdaptTab('tabletop')}
                  >
                    <FontAwesomeIcon icon={faDiceD20} /> Tabletop RPG / 5e
                  </button>
                  <button
                    type="button"
                    className={`adapt-tab-btn ${activeAdaptTab === 'fiction' ? 'active' : ''}`}
                    onClick={() => setActiveAdaptTab('fiction')}
                  >
                    <FontAwesomeIcon icon={faScroll} /> Adult Fiction
                  </button>
                </div>
              </div>

              {/* Tab 1: Full Canon Summary */}
              {activeAdaptTab === 'canon' && (
                <div className="adapt-tab-panel">
                  <div className="canon-summary-card">
                    <p>
                      <strong>Unified World Truth:</strong> This creature is logically cohesive across all derivatives.
                      Downstream works (campaigns, children's fables, adult novels) distill or highlight aspects of this master entry without introducing contradictions.
                    </p>
                  </div>
                </div>
              )}

              {/* Tab 2: All-Ages / Kids */}
              {activeAdaptTab === 'all_ages' && (
                <div className="adapt-tab-panel">
                  <div className="form-group">
                    <label>All-Ages Narrative Summary (Kid-Friendly / Fable Framing)</label>
                    <textarea
                      rows={2}
                      placeholder="Approachable, whimsical, or non-gory description suitable for children..."
                      value={selected.demographicAdaptations?.all_ages?.summary || ''}
                      onChange={(e) => updateAdaptation('all_ages', 'summary', e.target.value)}
                    />
                  </div>
                  <div className="form-row">
                    <div className="form-group" style={{ flex: 2 }}>
                      <label>Simplified Tactics &amp; Playful Actions (comma separated)</label>
                      <input
                        type="text"
                        placeholder="e.g. Big jelly bounce, Sticky bubble trap, Splits into giggling jelly-blobs"
                        value={selected.demographicAdaptations?.all_ages?.simplifiedTactics?.join(', ') || ''}
                        onChange={(e) => updateAdaptation('all_ages', 'simplifiedTactics', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                      />
                    </div>
                    <div className="form-group form-group-small">
                      <label>Hearts</label>
                      <input
                        type="number"
                        min="1"
                        value={selected.demographicAdaptations?.all_ages?.hearts ?? 3}
                        onChange={(e) => updateAdaptation('all_ages', 'hearts', Number(e.target.value))}
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Bargaining &amp; Non-Lethal Resolution Guidance</label>
                    <input
                      type="text"
                      placeholder="e.g. Can be befriended with sweet pastries or bright lanterns; never fight to injure"
                      value={selected.demographicAdaptations?.all_ages?.guidance || ''}
                      onChange={(e) => updateAdaptation('all_ages', 'guidance', e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* Tab 3: Tabletop RPG / 5e */}
              {activeAdaptTab === 'tabletop' && (
                <div className="adapt-tab-panel">
                  <div className="form-row">
                    <div className="form-group" style={{ flex: 1 }}>
                      <label>Challenge Rating (CR)</label>
                      <input
                        type="text"
                        placeholder="e.g. CR 3 (700 XP)"
                        value={selected.demographicAdaptations?.tabletop_rpg?.challengeRating || ''}
                        onChange={(e) => updateAdaptation('tabletop_rpg', 'challengeRating', e.target.value)}
                      />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label>Combat Role</label>
                      <input
                        type="text"
                        placeholder="e.g. Tactical Trapper &amp; Skirmish Commander"
                        value={selected.demographicAdaptations?.tabletop_rpg?.combatRole || ''}
                        onChange={(e) => updateAdaptation('tabletop_rpg', 'combatRole', e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Encounter Pressure &amp; Tactical Hazards</label>
                    <textarea
                      rows={2}
                      placeholder="Environmental hazards, conditions applied (Blinded, Restrained), save DCs..."
                      value={selected.demographicAdaptations?.tabletop_rpg?.encounterPressure || ''}
                      onChange={(e) => updateAdaptation('tabletop_rpg', 'encounterPressure', e.target.value)}
                    />
                  </div>
                  <div className="form-row">
                    <div className="form-group" style={{ flex: 1 }}>
                      <label>Lair Action</label>
                      <input
                        type="text"
                        placeholder="e.g. Triggers swinging log trap on initiative count 20"
                        value={selected.demographicAdaptations?.tabletop_rpg?.lairAction || ''}
                        onChange={(e) => updateAdaptation('tabletop_rpg', 'lairAction', e.target.value)}
                      />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label>Loot Hook / Harvestable Trophy</label>
                      <input
                        type="text"
                        placeholder="e.g. Crystallized Vitriol Core (180 gp alchemical reagent)"
                        value={selected.demographicAdaptations?.tabletop_rpg?.lootHook || ''}
                        onChange={(e) => updateAdaptation('tabletop_rpg', 'lootHook', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 4: Adult Fiction / Literary */}
              {activeAdaptTab === 'fiction' && (
                <div className="adapt-tab-panel">
                  <div className="form-group">
                    <label>Prose Texture &amp; Sensory Horror / Majesty</label>
                    <textarea
                      rows={2}
                      placeholder="Visceral sensory description, smell, auditory cues for literary chapters..."
                      value={selected.demographicAdaptations?.adult_fiction?.proseTexture || ''}
                      onChange={(e) => updateAdaptation('adult_fiction', 'proseTexture', e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Moral Ambiguity &amp; Human Friction</label>
                    <textarea
                      rows={2}
                      placeholder="Why killing or exploiting this creature creates complex ethical dilemmas for the characters..."
                      value={selected.demographicAdaptations?.adult_fiction?.moralAmbiguity || ''}
                      onChange={(e) => updateAdaptation('adult_fiction', 'moralAmbiguity', e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Systemic World Impact</label>
                    <input
                      type="text"
                      placeholder="e.g. Their mass migration signals deep tectonic failure threatening the coastal cities"
                      value={selected.demographicAdaptations?.adult_fiction?.systemicImpact || ''}
                      onChange={(e) => updateAdaptation('adult_fiction', 'systemicImpact', e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label>Field Notes &amp; Weaknesses</label>
              <textarea
                placeholder="Additional notes, weaknesses, special behavior..."
                value={selected.notes}
                onChange={(e) => updateField(selected.id, 'notes', e.target.value)}
              />
            </div>
          </>
        ) : (
          <div className="empty-state">
            <FontAwesomeIcon icon={faDragon} size="2x" style={{ color: 'var(--text-muted)', marginBottom: '0.75rem' }} />
            <p>Select a creature from the catalog or author a new one.</p>
          </div>
        )}
      </div>
    </div>
  );
}
