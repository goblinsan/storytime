import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { Character, TimelineEvent, FamilyTreeResponse, CharacterImportance } from '../types/story';
import { api } from '../api';
import FamilyTreeView from './FamilyTreeView';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faUser,
  faXmark,
  faStar,
  faArrowLeft,
  faClock,
  faCalendarAlt,
  faSitemap,
  faList,
} from '@fortawesome/free-solid-svg-icons';
import './CharacterDevelopment.css';

interface Props {
  storyId: string | null;
  ensureStory: () => Promise<string>;
  initialEntityId?: string | null;
}

export default function CharacterDevelopment({ storyId, ensureStory, initialEntityId }: Props) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(initialEntityId ?? null);
  const [historyStack, setHistoryStack] = useState<string[]>([]);

  // Triage & Filtering State
  const [viewMode, setViewMode] = useState<'list' | 'tree'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [importanceFilter, setImportanceFilter] = useState<'all' | CharacterImportance>('all');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [timeframeStartFilter, setTimeframeStartFilter] = useState<number | null>(null);
  const [timeframeEndFilter, setTimeframeEndFilter] = useState<number | null>(null);

  // Aux state
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [calendarLabel, setCalendarLabel] = useState<string>('Year of the Iron Dirge');
  const [familyTreeData, setFamilyTreeData] = useState<FamilyTreeResponse | null>(null);
  const [relationships, setRelationships] = useState<any[]>([]);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load project characters, timeline events, and family tree
  useEffect(() => {
    if (!storyId) return;

    api.characters.list(storyId).then((list) => {
      setCharacters(list);
      if (initialEntityId && list.some((c) => c.id === initialEntityId)) {
        setSelectedCharacter(initialEntityId);
      } else if (!selectedCharacter && list.length > 0) {
        // Default to first principal character if available, else first character
        const firstPrincipal = list.find((c) => c.importance === 'principal');
        setSelectedCharacter(firstPrincipal ? firstPrincipal.id : list[0].id);
      }
    }).catch(console.error);

    api.timelineEvents.list(storyId).then(setTimelineEvents).catch(console.error);

    api.stories.get(storyId).then((s) => {
      if (s.calendarLabel) setCalendarLabel(s.calendarLabel);
    }).catch(console.error);

    api.characters.getFamilyTree(storyId).then(setFamilyTreeData).catch(console.error);
  }, [storyId, initialEntityId]);

  // Fast map lookup for characters
  const charMap = useMemo(() => {
    const m = new Map<string, Character>();
    for (const c of characters) {
      m.set(c.id, c);
    }
    return m;
  }, [characters]);

  const selected = charMap.get(selectedCharacter || '');

  // Calculate project timeframe min/max bounds for slider
  const timeframeBounds = useMemo(() => {
    let min = 200;
    let max = 360;
    for (const c of characters) {
      if (c.activeTimeframeStart != null && c.activeTimeframeStart < min) min = c.activeTimeframeStart;
      if (c.activeTimeframeEnd != null && c.activeTimeframeEnd > max) max = c.activeTimeframeEnd;
    }
    return { min, max };
  }, [characters]);

  // Memoized filtered character list
  const filteredCharacters = useMemo(() => {
    let list = characters;

    if (importanceFilter !== 'all') {
      list = list.filter((c) => (c.importance || 'supporting') === importanceFilter);
    }

    if (selectedEventId) {
      const ev = timelineEvents.find((e) => e.id === selectedEventId);
      const charIds = new Set(ev?.characters || []);
      list = list.filter((c) => charIds.has(c.id));
    }

    if (timeframeStartFilter != null || timeframeEndFilter != null) {
      list = list.filter((c) => {
        const start = c.activeTimeframeStart;
        const end = c.activeTimeframeEnd;
        if (start == null && end == null) return true;
        // Filter out ancestors whose lifetime ended before the begin date
        if (timeframeStartFilter != null && end != null && end < timeframeStartFilter) return false;
        // Filter out future generations whose lifetime began after the end date
        if (timeframeEndFilter != null && start != null && start > timeframeEndFilter) return false;
        return true;
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.role && c.role.toLowerCase().includes(q)) ||
          (c.traits && c.traits.some((t) => t.toLowerCase().includes(q)))
      );
    }

    return list;
  }, [characters, importanceFilter, selectedEventId, timeframeStartFilter, timeframeEndFilter, searchQuery, timelineEvents]);

  // Counts for triage chips
  const counts = useMemo(() => {
    let principal = 0;
    let supporting = 0;
    let background = 0;
    for (const c of characters) {
      const imp = c.importance || 'supporting';
      if (imp === 'principal') principal++;
      else if (imp === 'supporting') supporting++;
      else if (imp === 'background') background++;
    }
    return { all: characters.length, principal, supporting, background };
  }, [characters]);

  // Timeline events for selected character
  const involvedEvents = useMemo(() => {
    if (!selected) return [];
    return timelineEvents.filter((e) => (e.characters || []).includes(selected.id));
  }, [selected, timelineEvents]);

  // Jump to character from relationship or family tree (pushes to history stack)
  const jumpToCharacter = (targetId: string) => {
    if (selectedCharacter && selectedCharacter !== targetId) {
      setHistoryStack((prev) => [...prev, selectedCharacter]);
    }
    setSelectedCharacter(targetId);
    if (viewMode === 'tree') setViewMode('list');
  };

  // Navigate back in history stack
  const goBack = () => {
    if (historyStack.length === 0) return;
    const prevId = historyStack[historyStack.length - 1];
    setHistoryStack((prev) => prev.slice(0, -1));
    setSelectedCharacter(prevId);
  };

  const loadRelationships = useCallback((charId: string) => {
    if (!storyId) return;
    api.relationships.list(storyId, charId).then(setRelationships).catch(console.error);
  }, [storyId]);

  useEffect(() => {
    if (selectedCharacter) {
      loadRelationships(selectedCharacter);
    } else {
      setRelationships([]);
    }
  }, [selectedCharacter, loadRelationships]);

  const addCharacter = async () => {
    try {
      const id = await ensureStory();
      const newChar = await api.characters.create({ projectId: id, importance: 'supporting' });
      setCharacters((prev) => [...prev, newChar]);
      setSelectedCharacter(newChar.id);
      api.characters.getFamilyTree(id).then(setFamilyTreeData).catch(console.error);
    } catch (err) {
      console.error('Failed to add character:', err);
    }
  };

  const deleteCharacter = async (charId: string) => {
    try {
      await api.characters.delete(charId);
      setCharacters((prev) => prev.filter((c) => c.id !== charId));
      if (selectedCharacter === charId) setSelectedCharacter(null);
      if (storyId) api.characters.getFamilyTree(storyId).then(setFamilyTreeData).catch(console.error);
    } catch (err) {
      console.error('Failed to delete character:', err);
    }
  };

  const updateCharacterField = useCallback(
    (charId: string, field: string, value: any) => {
      setCharacters((prev) =>
        prev.map((c) =>
          c.id === charId
            ? {
                ...c,
                [field]:
                  field === 'traits' || field === 'relationships'
                    ? typeof value === 'string'
                      ? value.split(',').map((s) => s.trim()).filter(Boolean)
                      : value
                    : value,
              }
            : c
        )
      );

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        try {
          const data: Record<string, unknown> = {};
          if (field === 'traits' || field === 'relationships') {
            data[field] = typeof value === 'string'
              ? value.split(',').map((s) => s.trim()).filter(Boolean)
              : value;
          } else {
            data[field] = value;
          }
          await api.characters.update(charId, data as Partial<Character>);
          if (storyId && (field === 'name' || field === 'role' || field === 'importance' || field.includes('Timeframe'))) {
            api.characters.getFamilyTree(storyId).then(setFamilyTreeData).catch(console.error);
          }
        } catch (err) {
          console.error('Auto-save failed:', err);
        }
      }, 700);
    },
    [storyId]
  );

  // Adopt shared character
  const [sharedCharacters, setSharedCharacters] = useState<any[]>([]);
  const [showAdoptModal, setShowAdoptModal] = useState(false);

  useEffect(() => {
    api.characters.listShared().then(setSharedCharacters).catch(console.error);
  }, []);

  const adoptCharacter = async (sharedId: string, isVariant = false) => {
    try {
      const id = await ensureStory();
      const adopted = await api.characters.adoptShared({
        projectId: id,
        sharedCharacterId: sharedId,
        isVariant,
      });
      setCharacters((prev) => [...prev, adopted]);
      setSelectedCharacter(adopted.id);
      setShowAdoptModal(false);
      api.characters.getFamilyTree(id).then(setFamilyTreeData).catch(console.error);
    } catch (err) {
      console.error('Failed to adopt character:', err);
      alert('Failed to adopt character: ' + (err as Error).message);
    }
  };

  // Relationship form state
  const [showAddRel, setShowAddRel] = useState(false);
  const [relTargetId, setRelTargetId] = useState('');
  const [relTargetType, setRelTargetType] = useState('character');
  const [relType, setRelType] = useState('allied_with');
  const [relNotes, setRelNotes] = useState('');

  const handleCreateRelationship = async () => {
    if (!storyId || !selectedCharacter || !relTargetId) return;
    try {
      const created = await api.relationships.create({
        projectId: storyId,
        sourceEntityId: selectedCharacter,
        sourceEntityType: 'character',
        targetEntityId: relTargetId,
        targetEntityType: relTargetType,
        relationshipType: relType,
        notes: relNotes,
      });
      setRelationships((prev) => [created, ...prev]);
      setShowAddRel(false);
      setRelTargetId('');
      setRelNotes('');
      api.characters.getFamilyTree(storyId).then(setFamilyTreeData).catch(console.error);
    } catch (err) {
      alert('Failed to add relationship: ' + (err as Error).message);
    }
  };

  const handleDeleteRelationship = async (relId: string) => {
    try {
      await api.relationships.delete(relId);
      setRelationships((prev) => prev.filter((r) => r.id !== relId));
      if (storyId) api.characters.getFamilyTree(storyId).then(setFamilyTreeData).catch(console.error);
    } catch (err) {
      console.error('Failed to delete relationship:', err);
    }
  };

  const previousChar = historyStack.length > 0 ? charMap.get(historyStack[historyStack.length - 1]) : null;

  return (
    <div className="character-development">
      <div className="character-sidebar">
        {/* Top Header & Actions */}
        <div className="sidebar-header" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'stretch' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              Cast &amp; Personas
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({characters.length})</span>
            </h3>
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              <button
                type="button"
                className="tree-action-btn"
                onClick={() => setViewMode(viewMode === 'list' ? 'tree' : 'list')}
                title={viewMode === 'list' ? 'Switch to Family Lineage Tree View' : 'Switch to List View'}
              >
                <FontAwesomeIcon icon={viewMode === 'list' ? faSitemap : faList} /> {viewMode === 'list' ? 'Trees' : 'List'}
              </button>
              <button onClick={addCharacter} className="add-button">+ New</button>
            </div>
          </div>

          <button
            onClick={() => setShowAdoptModal(true)}
            style={{
              background: '#1e293b',
              border: '1px solid #38bdf8',
              color: '#38bdf8',
              borderRadius: '4px',
              padding: '0.25rem 0.5rem',
              fontSize: '0.75rem',
              cursor: 'pointer',
            }}
          >
            🌐 Adopt Shared Character
          </button>
        </div>

        {/* Adopt shared character modal */}
        {showAdoptModal && (
          <div style={{
            background: '#0f172a',
            border: '1px solid #38bdf8',
            borderRadius: '6px',
            padding: '0.75rem',
            margin: '0.5rem 0',
            maxHeight: '200px',
            overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#38bdf8' }}>Shared Identities</span>
              <button onClick={() => setShowAdoptModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>✕</button>
            </div>
            {sharedCharacters.length === 0 ? (
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>No shared characters found.</div>
            ) : (
              sharedCharacters.map((c) => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.3rem 0', borderBottom: '1px solid #1e293b' }}>
                  <div style={{ fontSize: '0.8rem', color: '#f1f5f9' }}>
                    <strong>{c.name}</strong> <span style={{ color: '#94a3b8', fontSize: '0.7rem' }}>({c.archetype})</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button
                      onClick={() => adoptCharacter(c.id, false)}
                      style={{ background: '#0284c7', color: 'white', border: 'none', borderRadius: '3px', fontSize: '0.7rem', padding: '0.15rem 0.35rem', cursor: 'pointer' }}
                    >
                      Adopt
                    </button>
                    <button
                      onClick={() => adoptCharacter(c.id, true)}
                      style={{ background: '#7c3aed', color: 'white', border: 'none', borderRadius: '3px', fontSize: '0.7rem', padding: '0.15rem 0.35rem', cursor: 'pointer' }}
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

        {/* Triage & Filter Controls */}
        <div className="character-triage-panel">
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="Search name, role, traits..."
              className="character-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: '8px', top: '7px', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Importance Filter Chips */}
          <div className="character-filter-chips">
            <button
              type="button"
              className={`filter-chip ${importanceFilter === 'all' ? 'active' : ''}`}
              onClick={() => setImportanceFilter('all')}
            >
              All ({counts.all})
            </button>
            <button
              type="button"
              className={`filter-chip ${importanceFilter === 'principal' ? 'principal-active' : ''}`}
              onClick={() => setImportanceFilter(importanceFilter === 'principal' ? 'all' : 'principal')}
            >
              <FontAwesomeIcon icon={faStar} /> Principal ({counts.principal})
            </button>
            <button
              type="button"
              className={`filter-chip ${importanceFilter === 'supporting' ? 'active' : ''}`}
              onClick={() => setImportanceFilter(importanceFilter === 'supporting' ? 'all' : 'supporting')}
            >
              Supporting ({counts.supporting})
            </button>
            <button
              type="button"
              className={`filter-chip ${importanceFilter === 'background' ? 'active' : ''}`}
              onClick={() => setImportanceFilter(importanceFilter === 'background' ? 'all' : 'background')}
            >
              Lineage ({counts.background})
            </button>
          </div>

          {/* Timeline Event Participation Filter */}
          <div className="character-subfilter-row">
            <select
              value={selectedEventId || ''}
              onChange={(e) => setSelectedEventId(e.target.value || null)}
              title="Filter characters active in a specific timeline crisis"
            >
              <option value="">Filter by Event Participation (All Events)</option>
              {timelineEvents.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title} ({(ev.characters || []).length} cast)
                </option>
              ))}
            </select>
          </div>

          {/* In-Universe Timeframe Range Filter */}
          <div className="timeframe-range-box">
            <div className="timeframe-range-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <FontAwesomeIcon icon={faClock} style={{ color: '#38bdf8', fontSize: '0.72rem' }} />
                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-heading)' }}>
                  Active Era Span
                </span>
              </div>
              {(timeframeStartFilter != null || timeframeEndFilter != null) && (
                <button
                  type="button"
                  className="timeframe-reset-btn"
                  onClick={() => {
                    setTimeframeStartFilter(null);
                    setTimeframeEndFilter(null);
                  }}
                  title="Reset era span to All Eras"
                >
                  ✕ Reset
                </button>
              )}
            </div>

            <div className="timeframe-inputs-row">
              <div className="timeframe-input-group">
                <label>From Yr</label>
                <input
                  type="number"
                  placeholder={String(timeframeBounds.min)}
                  value={timeframeStartFilter ?? ''}
                  onChange={(e) => {
                    const v = e.target.value === '' ? null : parseInt(e.target.value, 10);
                    setTimeframeStartFilter(isNaN(v as any) ? null : v);
                  }}
                  title="Show characters active on or after this year (filters out ancestors who died earlier)"
                />
              </div>

              <span className="timeframe-range-separator">&ndash;</span>

              <div className="timeframe-input-group">
                <label>To Yr</label>
                <input
                  type="number"
                  placeholder={String(timeframeBounds.max)}
                  value={timeframeEndFilter ?? ''}
                  onChange={(e) => {
                    const v = e.target.value === '' ? null : parseInt(e.target.value, 10);
                    setTimeframeEndFilter(isNaN(v as any) ? null : v);
                  }}
                  title="Show characters active on or before this year (filters out future generations)"
                />
              </div>
            </div>

            {/* Quick Era Presets */}
            <div className="timeframe-presets-row">
              <button
                type="button"
                className={`timeframe-preset-pill ${timeframeStartFilter === 280 && timeframeEndFilter == null ? 'active' : ''}`}
                onClick={() => {
                  setTimeframeStartFilter(280);
                  setTimeframeEndFilter(null);
                }}
                title="Filter out ancestors: show Year 280 to Present"
              >
                Modern (280+)
              </button>
              <button
                type="button"
                className={`timeframe-preset-pill ${timeframeStartFilter === 290 && timeframeEndFilter === 305 ? 'active' : ''}`}
                onClick={() => {
                  setTimeframeStartFilter(290);
                  setTimeframeEndFilter(305);
                }}
                title="Filter to Fall of Oakhaven (Yr 290 - 305)"
              >
                Oakhaven Era
              </button>
              <button
                type="button"
                className={`timeframe-preset-pill ${timeframeStartFilter == null && timeframeEndFilter == null ? 'active' : ''}`}
                onClick={() => {
                  setTimeframeStartFilter(null);
                  setTimeframeEndFilter(null);
                }}
                title="Clear all era filters"
              >
                All
              </button>
            </div>
          </div>
        </div>

        {/* Character List */}
        <div className="character-list">
          {filteredCharacters.length === 0 ? (
            <div style={{ padding: '1rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>
              No characters match the current filters.
            </div>
          ) : (
            filteredCharacters.map((char) => {
              const isPrincipal = char.importance === 'principal';
              return (
                <div
                  key={char.id}
                  className={`character-item ${selectedCharacter === char.id ? 'active' : ''}`}
                  onClick={() => {
                    if (selectedCharacter && selectedCharacter !== char.id) {
                      setHistoryStack((prev) => [...prev, selectedCharacter]);
                    }
                    setSelectedCharacter(char.id);
                  }}
                >
                  <div className="character-avatar" style={{ color: isPrincipal ? '#facc15' : 'inherit' }}>
                    <FontAwesomeIcon icon={faUser} />
                  </div>
                  <div style={{ flexGrow: 1, overflow: 'hidden' }}>
                    <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center' }}>
                      <span>{char.name}</span>
                      {isPrincipal && (
                        <FontAwesomeIcon icon={faStar} className="char-principal-star" title="Principal Actor" />
                      )}
                    </div>
                    <div style={{ marginTop: '2px', display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                      {char.role ? (
                        <span style={{ fontSize: '0.68rem', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '120px' }}>
                          {char.role}
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.65rem', background: '#475569', color: '#cbd5e1', padding: '0 0.3rem', borderRadius: '3px' }}>
                          {char.importance || 'supporting'}
                        </span>
                      )}
                      {(char.activeTimeframeStart != null || char.activeTimeframeEnd != null) && (
                        <span className="char-timeframe-tag">
                          {char.activeTimeframeStart ?? '?'}&ndash;{char.activeTimeframeEnd ?? 'now'}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    className="delete-char-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteCharacter(char.id);
                    }}
                    title="Delete character"
                  >
                    <FontAwesomeIcon icon={faXmark} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Editor / Lineage Tree Pane */}
      <div className="character-editor">
        {viewMode === 'tree' ? (
          <FamilyTreeView
            lineages={familyTreeData?.lineages || []}
            allCharacters={characters}
            calendarLabel={calendarLabel}
            onSelectCharacter={jumpToCharacter}
          />
        ) : selected ? (
          <>
            {/* Editor Navigation Bar with Breadcrumb / Back Button */}
            <div className="editor-nav-bar">
              {previousChar ? (
                <button type="button" className="back-nav-btn" onClick={goBack}>
                  <FontAwesomeIcon icon={faArrowLeft} /> Back to <strong>{previousChar.name}</strong>
                </button>
              ) : (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Viewing Character Dossier
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Importance:</span>
                <select
                  value={selected.importance || 'supporting'}
                  onChange={(e) => updateCharacterField(selected.id, 'importance', e.target.value)}
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                    color: selected.importance === 'principal' ? '#facc15' : 'var(--text-heading)',
                    fontWeight: selected.importance === 'principal' ? 700 : 400,
                    borderRadius: '4px',
                    padding: '0.2rem 0.45rem',
                    fontSize: '0.75rem',
                  }}
                >
                  <option value="principal">★ Principal Actor</option>
                  <option value="supporting">Supporting Cast</option>
                  <option value="background">Background / Lineage</option>
                </select>
              </div>
            </div>

            {selected.sharedCharacterId && (
              <div
                style={{
                  background: selected.isSharedVariant ? 'rgba(124, 58, 237, 0.15)' : 'rgba(2, 132, 199, 0.15)',
                  border: `1px solid ${selected.isSharedVariant ? '#7c3aed' : '#0284c7'}`,
                  borderRadius: '6px',
                  padding: '0.5rem 0.75rem',
                  marginBottom: '1rem',
                  fontSize: '0.85rem',
                  color: '#e2e8f0',
                }}
              >
                🌐 <strong>{selected.isSharedVariant ? 'Universe Variant' : 'Shared Canon Identity'}:</strong> Linked to global identity{' '}
                <em>"{selected.sharedCharacter?.name || selected.name}"</em>
              </div>
            )}

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '0.5rem' }}>
              <input
                type="text"
                placeholder="Character Name"
                className="character-name-input"
                value={selected.name}
                onChange={(e) => updateCharacterField(selected.id, 'name', e.target.value)}
                style={{ flex: 1 }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Role / Title</label>
                <input
                  type="text"
                  placeholder="e.g. Lord of Ash, Former Pilot, Cyber-Lich"
                  value={selected.role || ''}
                  onChange={(e) => updateCharacterField(selected.id, 'role', e.target.value)}
                />
              </div>

              {/* Active In-Universe Timeframe */}
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <FontAwesomeIcon icon={faClock} style={{ color: '#38bdf8', fontSize: '0.75rem' }} />
                  Active Era Lifespan ({calendarLabel || 'Years'})
                </label>
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <input
                    type="number"
                    placeholder="Birth / Start"
                    value={selected.activeTimeframeStart ?? ''}
                    onChange={(e) =>
                      updateCharacterField(
                        selected.id,
                        'activeTimeframeStart',
                        e.target.value ? parseInt(e.target.value, 10) : null
                      )
                    }
                    style={{ flex: 1 }}
                  />
                  <span style={{ color: '#94a3b8' }}>&ndash;</span>
                  <input
                    type="number"
                    placeholder="Death / Present"
                    value={selected.activeTimeframeEnd ?? ''}
                    onChange={(e) =>
                      updateCharacterField(
                        selected.id,
                        'activeTimeframeEnd',
                        e.target.value ? parseInt(e.target.value, 10) : null
                      )
                    }
                    style={{ flex: 1 }}
                  />
                </div>
              </div>
            </div>

            <div className="form-group">
              <label>Description</label>
              <textarea
                placeholder="Physical appearance, cybernetic alterations, presence..."
                value={selected.description}
                onChange={(e) => updateCharacterField(selected.id, 'description', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Background</label>
              <textarea
                placeholder="Origin, history, motivations, traumas..."
                value={selected.background}
                onChange={(e) => updateCharacterField(selected.id, 'background', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Traits</label>
              <input
                type="text"
                placeholder="e.g. Relentless, Star-Iron Infused, Haunted (comma separated)"
                value={selected.traits.join(', ')}
                onChange={(e) => updateCharacterField(selected.id, 'traits', e.target.value)}
              />
            </div>

            {/* Canon Graph: Clickable Relationships Navigation (Findings 6, 7, 10) */}
            <div style={{ marginTop: '1.5rem', borderTop: '1px solid #334155', paddingTop: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h4 style={{ margin: 0, color: '#f8fafc', fontSize: '0.95rem' }}>
                  🕸️ Canon Relationships &amp; Kinship ({relationships.length})
                </h4>
                <button
                  onClick={() => setShowAddRel(!showAddRel)}
                  style={{
                    background: '#1e293b',
                    border: '1px solid #38bdf8',
                    color: '#38bdf8',
                    borderRadius: '4px',
                    padding: '0.2rem 0.5rem',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                  }}
                >
                  + Add Relationship
                </button>
              </div>

              {showAddRel && (
                <div
                  style={{
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    padding: '0.75rem',
                    marginBottom: '0.75rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                  }}
                >
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <select
                      value={relType}
                      onChange={(e) => setRelType(e.target.value)}
                      style={{
                        background: '#1e293b',
                        border: '1px solid #334155',
                        color: '#fff',
                        borderRadius: '4px',
                        padding: '0.3rem',
                        fontSize: '0.8rem',
                      }}
                    >
                      <optgroup label="Kinship & Family">
                        <option value="parent_of">Parent Of</option>
                        <option value="child_of">Child Of</option>
                        <option value="married_to">Spouse / Partner Of</option>
                        <option value="sibling_of">Sibling Of</option>
                        <option value="ancestor_of">Ancestor Of</option>
                        <option value="descendant_of">Descendant Of</option>
                      </optgroup>
                      <optgroup label="Alliances & Rivalries">
                        <option value="allied_with">Allied With</option>
                        <option value="rival_of">Rival Of</option>
                        <option value="protective_bond">Protective Bond</option>
                        <option value="member_of">Member Of (Faction)</option>
                        <option value="located_at">Located At (Location)</option>
                      </optgroup>
                    </select>

                    <select
                      value={relTargetType}
                      onChange={(e) => setRelTargetType(e.target.value)}
                      style={{
                        background: '#1e293b',
                        border: '1px solid #334155',
                        color: '#fff',
                        borderRadius: '4px',
                        padding: '0.3rem',
                        fontSize: '0.8rem',
                      }}
                    >
                      <option value="character">Character</option>
                      <option value="faction">Faction</option>
                      <option value="location">Location</option>
                      <option value="bestiary">Bestiary</option>
                    </select>

                    <input
                      placeholder="Target entity ID / name"
                      value={relTargetId}
                      onChange={(e) => setRelTargetId(e.target.value)}
                      style={{
                        flexGrow: 1,
                        background: '#1e293b',
                        border: '1px solid #334155',
                        color: '#fff',
                        borderRadius: '4px',
                        padding: '0.3rem',
                        fontSize: '0.8rem',
                      }}
                    />
                  </div>

                  <input
                    placeholder="Notes or context for this relationship..."
                    value={relNotes}
                    onChange={(e) => setRelNotes(e.target.value)}
                    style={{
                      background: '#1e293b',
                      border: '1px solid #334155',
                      color: '#fff',
                      borderRadius: '4px',
                      padding: '0.3rem',
                      fontSize: '0.8rem',
                    }}
                  />

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={handleCreateRelationship}
                      style={{
                        background: '#2563eb',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '0.3rem 0.6rem',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                      }}
                    >
                      Save Relationship
                    </button>
                    <button
                      onClick={() => setShowAddRel(false)}
                      style={{
                        background: '#475569',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '0.3rem 0.6rem',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {relationships.length === 0 ? (
                <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic' }}>
                  No relationships charted for this character yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {relationships.map((r) => {
                    const otherId = r.targetEntityId === selected.id ? r.sourceEntityId : r.targetEntityId;
                    const otherType = r.targetEntityId === selected.id ? r.sourceEntityType : r.targetEntityType;
                    const targetChar = otherType === 'character' ? charMap.get(otherId) : null;

                    return (
                      <div
                        key={r.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          background: '#0f172a',
                          border: '1px solid #334155',
                          borderRadius: '4px',
                          padding: '0.4rem 0.6rem',
                        }}
                      >
                        <div style={{ fontSize: '0.8rem', color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                          <span style={{ color: '#38bdf8', fontWeight: 600 }}>{r.relationshipType}</span> →
                          {targetChar ? (
                            <button
                              type="button"
                              className="relationship-jump-btn"
                              onClick={() => jumpToCharacter(targetChar.id)}
                              title={`Jump to ${targetChar.name}`}
                            >
                              {targetChar.name} {targetChar.importance === 'principal' ? '★' : ''}
                            </button>
                          ) : (
                            <span style={{ color: '#f1f5f9' }}>{otherId}</span>
                          )}
                          <span style={{ color: '#94a3b8', fontSize: '0.7rem' }}>({otherType})</span>
                          {r.notes && (
                            <span style={{ color: '#94a3b8', fontSize: '0.75rem', marginLeft: '0.3rem' }}>
                              &mdash; {r.notes}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => handleDeleteRelationship(r.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#ef4444',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Involved Timeline Events Section */}
            {involvedEvents.length > 0 && (
              <div className="involved-events-box">
                <h4 style={{ margin: '0 0 0.5rem 0', color: '#f8fafc', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <FontAwesomeIcon icon={faCalendarAlt} style={{ color: '#facc15' }} />
                  Historical Participation ({involvedEvents.length} Events)
                </h4>
                <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                  {involvedEvents.map((ev) => (
                    <div key={ev.id} className="involved-event-chip" title={ev.description}>
                      <strong>{ev.title}</strong>
                      <span style={{ color: '#94a3b8', fontSize: '0.7rem' }}>({ev.date})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="empty-state">
            <p>Select a character or create a new one</p>
          </div>
        )}
      </div>
    </div>
  );
}
