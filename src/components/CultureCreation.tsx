import './CultureCreation.css';

export default function CultureCreation() {
  return (
    <div className="culture-creation">
      <div className="culture-grid">
        <div className="culture-section">
          <h3>📖 Myths & Legends</h3>
          <textarea placeholder="Creation myths, legendary heroes, folklore..." />
          <button className="add-myth-button">+ Add Myth</button>
        </div>

        <div className="culture-section">
          <h3>🗣️ Languages</h3>
          <div className="language-form">
            <input type="text" placeholder="Language name" />
            <div className="vocabulary-builder">
              <p className="section-label">Vocabulary Builder</p>
              <div className="vocab-entry">
                <input type="text" placeholder="Word in your language" />
                <span>→</span>
                <input type="text" placeholder="English translation" />
              </div>
              <button className="add-vocab-button">+ Add Word</button>
            </div>
            <textarea placeholder="Grammar rules and notes..." />
          </div>
        </div>

        <div className="culture-section">
          <h3>⛪ Religions & Beliefs</h3>
          <input type="text" placeholder="Religion name" />
          <textarea placeholder="Core beliefs and practices..." />
          <input type="text" placeholder="Deities (comma separated)" />
          <button className="add-religion-button">+ Add Religion</button>
        </div>

        <div className="culture-section">
          <h3>🏛️ Political Systems</h3>
          <select className="political-type">
            <option>Select political system type</option>
            <option>Monarchy</option>
            <option>Democracy</option>
            <option>Theocracy</option>
            <option>Oligarchy</option>
            <option>Anarchy</option>
            <option>Other</option>
          </select>
          <textarea placeholder="Describe the political structure and governance..." />
          
          <div className="factions-section">
            <p className="section-label">Political Factions</p>
            <input type="text" placeholder="Faction name" />
            <textarea placeholder="Goals and ideology..." />
            <button className="add-faction-button">+ Add Faction</button>
          </div>
        </div>
      </div>
    </div>
  );
}
