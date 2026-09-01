import { useState, useEffect, useRef, useCallback } from 'react';
import type { Character } from '../types/story';
import { api } from '../api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUser, faXmark } from '@fortawesome/free-solid-svg-icons';
import './CharacterDevelopment.css';

interface Props {
  storyId: string | null;
  ensureStory: () => Promise<string>;
}

export default function CharacterDevelopment({ storyId, ensureStory }: Props) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load characters when storyId changes
  useEffect(() => {
    if (storyId) {
      api.characters.list(storyId).then(setCharacters).catch(console.error);
    }
  }, [storyId]);

  const selected = characters.find(c => c.id === selectedCharacter);

  const addCharacter = async () => {
    try {
      const id = await ensureStory();
      const newChar = await api.characters.create({ projectId: id });
      setCharacters(prev => [...prev, newChar]);
      setSelectedCharacter(newChar.id);
    } catch (err) {
      console.error('Failed to add character:', err);
    }
  };

  const deleteCharacter = async (charId: string) => {
    try {
      await api.characters.delete(charId);
      setCharacters(prev => prev.filter(c => c.id !== charId));
      if (selectedCharacter === charId) setSelectedCharacter(null);
    } catch (err) {
      console.error('Failed to delete character:', err);
    }
  };

  const updateCharacterField = useCallback((charId: string, field: string, value: string) => {
    // Update local state immediately
    setCharacters(prev => prev.map(c =>
      c.id === charId ? { ...c, [field]: field === 'traits' || field === 'relationships'
        ? value.split(',').map(s => s.trim()).filter(Boolean)
        : value } : c
    ));

    // Debounced save to API
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        const data: Record<string, unknown> = {};
        if (field === 'traits' || field === 'relationships') {
          data[field] = value.split(',').map(s => s.trim()).filter(Boolean);
        } else {
          data[field] = value;
        }
        await api.characters.update(charId, data as Partial<Character>);
      } catch (err) {
        console.error('Auto-save failed:', err);
      }
    }, 800);
  }, []);

  const [sharedCharacters, setSharedCharacters] = useState<any[]>([]);
  const [showAdoptModal, setShowAdoptModal] = useState(false);
  const [relationships, setRelationships] = useState<any[]>([]);

  // New relationship form state
  const [showAddRel, setShowAddRel] = useState(false);
  const [relTargetId, setRelTargetId] = useState('');
  const [relTargetType, setRelTargetType] = useState('character');
  const [relType, setRelType] = useState('allied_with');
  const [relNotes, setRelNotes] = useState('');

  useEffect(() => {
    api.characters.listShared().then(setSharedCharacters).catch(console.error);
  }, []);

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

  const adoptCharacter = async (sharedId: string, isVariant = false) => {
    try {
      const id = await ensureStory();
      const adopted = await api.characters.adoptShared({
        projectId: id,
        sharedCharacterId: sharedId,
        isVariant,
      });
      setCharacters(prev => [...prev, adopted]);
      setSelectedCharacter(adopted.id);
      setShowAdoptModal(false);
    } catch (err) {
      console.error('Failed to adopt character:', err);
      alert('Failed to adopt character: ' + (err as Error).message);
    }
  };

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

  return (
    <div className="character-development">
      <div className="character-sidebar">
        <div className="sidebar-header" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'stretch' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>Characters</h3>
            <button onClick={addCharacter} className="add-button">+ New</button>
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
            margin: '0.5rem',
            maxHeight: '220px',
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

        <div className="character-list">
          {characters.map((char) => (
            <div
              key={char.id}
              className={`character-item ${selectedCharacter === char.id ? 'active' : ''}`}
              onClick={() => setSelectedCharacter(char.id)}
            >
              <div className="character-avatar"><FontAwesomeIcon icon={faUser} /></div>
              <div style={{ flexGrow: 1, overflow: 'hidden' }}>
                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{char.name}</div>
                <div style={{ marginTop: '2px' }}>
                  {char.isSharedVariant ? (
                    <span style={{ fontSize: '0.65rem', background: '#7c3aed', color: 'white', padding: '0 0.3rem', borderRadius: '3px' }}>Variant</span>
                  ) : char.sharedCharacterId ? (
                    <span style={{ fontSize: '0.65rem', background: '#0284c7', color: 'white', padding: '0 0.3rem', borderRadius: '3px' }}>Shared</span>
                  ) : (
                    <span style={{ fontSize: '0.65rem', background: '#475569', color: '#cbd5e1', padding: '0 0.3rem', borderRadius: '3px' }}>Local</span>
                  )}
                </div>
              </div>
              <button
                className="delete-char-btn"
                onClick={(e) => { e.stopPropagation(); deleteCharacter(char.id); }}
                title="Delete character"
              ><FontAwesomeIcon icon={faXmark} /></button>
            </div>
          ))}
        </div>
      </div>

      <div className="character-editor">
        {selected ? (
          <>
            {selected.sharedCharacterId && (
              <div style={{
                background: selected.isSharedVariant ? 'rgba(124, 58, 237, 0.15)' : 'rgba(2, 132, 199, 0.15)',
                border: `1px solid ${selected.isSharedVariant ? '#7c3aed' : '#0284c7'}`,
                borderRadius: '6px',
                padding: '0.5rem 0.75rem',
                marginBottom: '1rem',
                fontSize: '0.85rem',
                color: '#e2e8f0',
              }}>
                🌐 <strong>{selected.isSharedVariant ? 'Universe Variant' : 'Shared Canon Identity'}:</strong> Linked to global identity{' '}
                <em>"{selected.sharedCharacter?.name || selected.name}"</em>
              </div>
            )}

            <input
              type="text"
              placeholder="Character Name"
              className="character-name-input"
              value={selected.name}
              onChange={(e) => updateCharacterField(selected.id, 'name', e.target.value)}
            />
            <div className="form-group">
              <label>Description</label>
              <textarea
                placeholder="Physical appearance, personality overview..."
                value={selected.description}
                onChange={(e) => updateCharacterField(selected.id, 'description', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Background</label>
              <textarea
                placeholder="Origin, history, motivations..."
                value={selected.background}
                onChange={(e) => updateCharacterField(selected.id, 'background', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Traits</label>
              <input
                type="text"
                placeholder="e.g. Brave, Stubborn, Secretive (comma separated)"
                value={selected.traits.join(', ')}
                onChange={(e) => updateCharacterField(selected.id, 'traits', e.target.value)}
              />
            </div>

            {/* Canon Graph Relationships Section (Task 815) */}
            <div style={{ marginTop: '1.5rem', borderTop: '1px solid #334155', paddingTop: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h4 style={{ margin: 0, color: '#f8fafc', fontSize: '0.95rem' }}>
                  🕸️ Canon Graph: Typed Relationships &amp; Facts ({relationships.length})
                </h4>
                <button
                  onClick={() => setShowAddRel(!showAddRel)}
                  style={{ background: '#1e293b', border: '1px solid #38bdf8', color: '#38bdf8', borderRadius: '4px', padding: '0.2rem 0.5rem', fontSize: '0.75rem', cursor: 'pointer' }}
                >
                  + Add Relationship
                </button>
              </div>

              {showAddRel && (
                <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', padding: '0.75rem', marginBottom: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <select
                      value={relType}
                      onChange={(e) => setRelType(e.target.value)}
                      style={{ background: '#1e293b', border: '1px solid #334155', color: '#fff', borderRadius: '4px', padding: '0.3rem', fontSize: '0.8rem' }}
                    >
                      <option value="allied_with">Allied With</option>
                      <option value="rival_of">Rival Of</option>
                      <option value="member_of">Member Of (Faction)</option>
                      <option value="located_at">Located At (Location)</option>
                      <option value="kin_of">Kin / Family Of</option>
                      <option value="hunts">Hunts / Studies (Creature)</option>
                    </select>

                    <select
                      value={relTargetType}
                      onChange={(e) => setRelTargetType(e.target.value)}
                      style={{ background: '#1e293b', border: '1px solid #334155', color: '#fff', borderRadius: '4px', padding: '0.3rem', fontSize: '0.8rem' }}
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
                      style={{ flexGrow: 1, background: '#1e293b', border: '1px solid #334155', color: '#fff', borderRadius: '4px', padding: '0.3rem', fontSize: '0.8rem' }}
                    />
                  </div>

                  <input
                    placeholder="Notes or context for this relationship..."
                    value={relNotes}
                    onChange={(e) => setRelNotes(e.target.value)}
                    style={{ background: '#1e293b', border: '1px solid #334155', color: '#fff', borderRadius: '4px', padding: '0.3rem', fontSize: '0.8rem' }}
                  />

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={handleCreateRelationship}
                      style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', padding: '0.3rem 0.6rem', fontSize: '0.8rem', cursor: 'pointer' }}
                    >
                      Save Relationship
                    </button>
                    <button
                      onClick={() => setShowAddRel(false)}
                      style={{ background: '#475569', color: '#fff', border: 'none', borderRadius: '4px', padding: '0.3rem 0.6rem', fontSize: '0.8rem', cursor: 'pointer' }}
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
                  {relationships.map((r) => (
                    <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0f172a', border: '1px solid #334155', borderRadius: '4px', padding: '0.4rem 0.6rem' }}>
                      <div style={{ fontSize: '0.8rem', color: '#e2e8f0' }}>
                        <span style={{ color: '#38bdf8', fontWeight: 600 }}>{r.relationshipType}</span> →{' '}
                        <span>{r.targetEntityId === selected.id ? r.sourceEntityId : r.targetEntityId}</span>{' '}
                        <span style={{ color: '#94a3b8', fontSize: '0.7rem' }}>({r.targetEntityId === selected.id ? r.sourceEntityType : r.targetEntityType})</span>
                        {r.notes && <div style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '2px' }}>{r.notes}</div>}
                      </div>
                      <button
                        onClick={() => handleDeleteRelationship(r.id)}
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.75rem' }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
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
