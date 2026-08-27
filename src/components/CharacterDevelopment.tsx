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

  return (
    <div className="character-development">
      <div className="character-sidebar">
        <div className="sidebar-header">
          <h3>Characters</h3>
          <button onClick={addCharacter} className="add-button">+ Add</button>
        </div>
        <div className="character-list">
          {characters.map((char) => (
            <div
              key={char.id}
              className={`character-item ${selectedCharacter === char.id ? 'active' : ''}`}
              onClick={() => setSelectedCharacter(char.id)}
            >
              <div className="character-avatar"><FontAwesomeIcon icon={faUser} /></div>
              <span>{char.name}</span>
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
                placeholder="brave, intelligent, stubborn... (comma separated)"
                value={selected.traits.join(', ')}
                onChange={(e) => updateCharacterField(selected.id, 'traits', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Relationships</label>
              <textarea
                placeholder="Connections with other characters... (comma separated)"
                value={selected.relationships.join(', ')}
                onChange={(e) => updateCharacterField(selected.id, 'relationships', e.target.value)}
              />
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
