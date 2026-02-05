import { useState } from 'react';
import type { Character } from '../types/story';
import './CharacterDevelopment.css';

export default function CharacterDevelopment() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null);

  const addCharacter = () => {
    const newCharacter: Character = {
      id: Date.now().toString(),
      name: 'New Character',
      description: '',
      background: '',
      traits: [],
      relationships: [],
    };
    setCharacters([...characters, newCharacter]);
    setSelectedCharacter(newCharacter.id);
  };

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
              <div className="character-avatar">👤</div>
              <span>{char.name}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="character-editor">
        {selectedCharacter ? (
          <>
            <input
              type="text"
              placeholder="Character Name"
              className="character-name-input"
              defaultValue={characters.find(c => c.id === selectedCharacter)?.name}
            />
            <div className="form-group">
              <label>Description</label>
              <textarea placeholder="Physical appearance, personality overview..." />
            </div>
            <div className="form-group">
              <label>Background</label>
              <textarea placeholder="Origin, history, motivations..." />
            </div>
            <div className="form-group">
              <label>Traits</label>
              <input type="text" placeholder="brave, intelligent, stubborn... (comma separated)" />
            </div>
            <div className="form-group">
              <label>Relationships</label>
              <textarea placeholder="Connections with other characters..." />
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
