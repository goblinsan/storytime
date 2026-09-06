import { useState, useEffect, useRef, useCallback } from 'react';
import type { Character } from '../types/story';
import { api } from '../api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faShieldHalved, faXmark, faHeart } from '@fortawesome/free-solid-svg-icons';
import './PartyManager.css';

// Maps character names → individual portrait image paths
const PORTRAIT_IMG: Record<string, string> = {
  'Rogue (Guide)':       '/rogue.jpg',
  'Dwarf':               '/dwarf.jpg',
  'Butterfly Princess':  '/princess.jpg',
  'Cyborg-Necromancer':  '/necro-cyborg.jpg',
};

interface Props {
  storyId: string | null;
  ensureStory: () => Promise<string>;
}

export default function PartyManager({ storyId, ensureStory }: Props) {
  const [members, setMembers] = useState<Character[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (storyId) {
      api.characters.list(storyId, 'party').then(setMembers).catch(console.error);
    }
  }, [storyId]);

  const selected = members.find(c => c.id === selectedId);

  const addMember = async () => {
    try {
      const id = await ensureStory();
      const newChar = await api.characters.create({
        projectId: id,
        name: 'New Party Member',
        characterType: 'party',
        hearts: 10,
      });
      setMembers(prev => [...prev, newChar]);
      setSelectedId(newChar.id);
    } catch (err) {
      console.error('Failed to add party member:', err);
    }
  };

  const deleteMember = async (charId: string) => {
    try {
      await api.characters.delete(charId);
      setMembers(prev => prev.filter(c => c.id !== charId));
      if (selectedId === charId) setSelectedId(null);
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  };

  const updateField = useCallback((charId: string, field: string, value: unknown) => {
    setMembers(prev => prev.map(c => {
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
    <div className="party-manager">
      <div className="party-sidebar">
        <div className="sidebar-header">
          <h3>Party Members</h3>
          <button onClick={addMember} className="add-button">+ Add</button>
        </div>
        <div className="party-list">
          {members.map((m) => (
            <div
              key={m.id}
              className={`party-item ${selectedId === m.id ? 'active' : ''}`}
              onClick={() => setSelectedId(m.id)}
            >
              {PORTRAIT_IMG[m.name] ? (
                <img src={PORTRAIT_IMG[m.name]} alt={m.name} className="party-avatar party-portrait" />
              ) : (
                <div className="party-avatar"><FontAwesomeIcon icon={faShieldHalved} /></div>
              )}
              <div className="party-item-info">
                <span className="party-name">{m.name}</span>
                {m.role && <span className="party-role">{m.role}</span>}
              </div>
              {m.hearts != null && (
                <span className="party-hearts"><FontAwesomeIcon icon={faHeart} /> {m.hearts}</span>
              )}
              <button
                className="delete-char-btn"
                onClick={(e) => { e.stopPropagation(); deleteMember(m.id); }}
                title="Remove member"
              ><FontAwesomeIcon icon={faXmark} /></button>
            </div>
          ))}
        </div>
      </div>

      <div className="party-editor">
        {selected ? (
          <>
            <div className="character-header">
              {PORTRAIT_IMG[selected.name] && (
                <img src={PORTRAIT_IMG[selected.name]} alt={selected.name} className="character-portrait" />
              )}
              <input
                type="text"
                placeholder="Character Name"
                className="character-name-input"
                value={selected.name}
                onChange={(e) => updateField(selected.id, 'name', e.target.value)}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Role</label>
                <input
                  type="text"
                  placeholder="e.g., Frontline melee / tank"
                  value={selected.role}
                  onChange={(e) => updateField(selected.id, 'role', e.target.value)}
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
            </div>

            <div className="form-group">
              <label>Core Skills</label>
              <input
                type="text"
                placeholder="Melee, Stone, Toughness (comma separated)"
                value={selected.coreSkills.join(', ')}
                onChange={(e) => updateField(selected.id, 'coreSkills', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Special Abilities / Gifts</label>
              <input
                type="text"
                placeholder="Slime Overcharge, Adaptive Scan (comma separated)"
                value={selected.specialAbilities.join(', ')}
                onChange={(e) => updateField(selected.id, 'specialAbilities', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Backstory</label>
              <textarea
                placeholder="Origin, history..."
                value={selected.background}
                onChange={(e) => updateField(selected.id, 'background', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Notable Moments</label>
              <textarea
                placeholder="Key events and achievements (comma separated)"
                value={selected.notableMoments.join(', ')}
                onChange={(e) => updateField(selected.id, 'notableMoments', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Tendencies & Growth</label>
              <textarea
                placeholder="Play style, personality tendencies, growth areas..."
                value={selected.tendencies}
                onChange={(e) => updateField(selected.id, 'tendencies', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Traits</label>
              <input
                type="text"
                placeholder="brave, impulsive, creative (comma separated)"
                value={selected.traits.join(', ')}
                onChange={(e) => updateField(selected.id, 'traits', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Relationships</label>
              <textarea
                placeholder="Connections with other characters (comma separated)"
                value={selected.relationships.join(', ')}
                onChange={(e) => updateField(selected.id, 'relationships', e.target.value)}
              />
            </div>
          </>
        ) : (
          <div className="empty-state">
            <p>Select a party member or add a new one</p>
          </div>
        )}
      </div>
    </div>
  );
}
