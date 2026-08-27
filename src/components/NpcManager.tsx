import { useState, useEffect, useRef, useCallback } from 'react';
import type { Character } from '../types/story';
import { api } from '../api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faComments, faXmark, faLocationDot } from '@fortawesome/free-solid-svg-icons';
import './NpcManager.css';

interface Props {
  storyId: string | null;
  ensureStory: () => Promise<string>;
}

export default function NpcManager({ storyId, ensureStory }: Props) {
  const [npcs, setNpcs] = useState<Character[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (storyId) {
      api.characters.list(storyId, 'npc').then(setNpcs).catch(console.error);
    }
  }, [storyId]);

  const selected = npcs.find(c => c.id === selectedId);

  const addNpc = async () => {
    try {
      const id = await ensureStory();
      const newNpc = await api.characters.create({
        projectId: id,
        name: 'New NPC',
        characterType: 'npc',
      });
      setNpcs(prev => [...prev, newNpc]);
      setSelectedId(newNpc.id);
    } catch (err) {
      console.error('Failed to add NPC:', err);
    }
  };

  const deleteNpc = async (charId: string) => {
    try {
      await api.characters.delete(charId);
      setNpcs(prev => prev.filter(c => c.id !== charId));
      if (selectedId === charId) setSelectedId(null);
    } catch (err) {
      console.error('Failed to delete NPC:', err);
    }
  };

  const updateField = useCallback((charId: string, field: string, value: unknown) => {
    setNpcs(prev => prev.map(c => {
      if (c.id !== charId) return c;
      const arrayFields = ['traits', 'relationships', 'coreSkills', 'specialAbilities', 'notableMoments'];
      if (arrayFields.includes(field) && typeof value === 'string') {
        return { ...c, [field]: value.split(',').map(s => s.trim()).filter(Boolean) };
      }
      return { ...c, [field]: value };
    }));

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        const data: Record<string, unknown> = {};
        const arrayFields = ['traits', 'relationships', 'coreSkills', 'specialAbilities', 'notableMoments'];
        if (arrayFields.includes(field) && typeof value === 'string') {
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

  return (
    <div className="npc-manager">
      <div className="npc-sidebar">
        <div className="sidebar-header">
          <h3>NPCs</h3>
          <button onClick={addNpc} className="add-button">+ Add</button>
        </div>
        <div className="npc-list">
          {npcs.map((npc) => (
            <div
              key={npc.id}
              className={`npc-item ${selectedId === npc.id ? 'active' : ''}`}
              onClick={() => setSelectedId(npc.id)}
            >
              <div className="npc-avatar"><FontAwesomeIcon icon={faComments} /></div>
              <div className="npc-item-info">
                <span className="npc-name">{npc.name}</span>
                {npc.role && <span className="npc-role">{npc.role}</span>}
              </div>
              {npc.location && (
                <span className="npc-location"><FontAwesomeIcon icon={faLocationDot} /></span>
              )}
              <button
                className="delete-char-btn"
                onClick={(e) => { e.stopPropagation(); deleteNpc(npc.id); }}
                title="Remove NPC"
              ><FontAwesomeIcon icon={faXmark} /></button>
            </div>
          ))}
        </div>
      </div>

      <div className="npc-editor">
        {selected ? (
          <>
            <input
              type="text"
              placeholder="NPC Name"
              className="character-name-input"
              value={selected.name}
              onChange={(e) => updateField(selected.id, 'name', e.target.value)}
            />

            <div className="form-row">
              <div className="form-group">
                <label>Role</label>
                <input
                  type="text"
                  placeholder="e.g., Quest giver, Authority figure..."
                  value={selected.role}
                  onChange={(e) => updateField(selected.id, 'role', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Location</label>
                <input
                  type="text"
                  placeholder="e.g., Copper Ladle Tavern, Tallgate Keep"
                  value={selected.location}
                  onChange={(e) => updateField(selected.id, 'location', e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Motivation</label>
              <textarea
                placeholder="What drives this NPC? Goals, desires..."
                value={selected.motivation}
                onChange={(e) => updateField(selected.id, 'motivation', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Description</label>
              <textarea
                placeholder="Appearance, personality, mannerisms..."
                value={selected.description}
                onChange={(e) => updateField(selected.id, 'description', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Background</label>
              <textarea
                placeholder="History, how they fit into the world..."
                value={selected.background}
                onChange={(e) => updateField(selected.id, 'background', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Traits</label>
              <input
                type="text"
                placeholder="friendly, suspicious, cunning (comma separated)"
                value={selected.traits.join(', ')}
                onChange={(e) => updateField(selected.id, 'traits', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Relationships</label>
              <textarea
                placeholder="Connections with PCs or other NPCs (comma separated)"
                value={selected.relationships.join(', ')}
                onChange={(e) => updateField(selected.id, 'relationships', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Notable Moments</label>
              <textarea
                placeholder="Key interactions and events (comma separated)"
                value={selected.notableMoments.join(', ')}
                onChange={(e) => updateField(selected.id, 'notableMoments', e.target.value)}
              />
            </div>
          </>
        ) : (
          <div className="empty-state">
            <p>Select an NPC or add a new one</p>
          </div>
        )}
      </div>
    </div>
  );
}
