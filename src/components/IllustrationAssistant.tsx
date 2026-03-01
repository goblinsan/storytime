import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPalette, faWandMagicSparkles, faImage } from '@fortawesome/free-solid-svg-icons';
import './IllustrationAssistant.css';

export default function IllustrationAssistant() {
  return (
    <div className="illustration-assistant">
      <div className="illustration-header">
        <h3><FontAwesomeIcon icon={faPalette} /> Illustration Assistant</h3>
        <p>Generate visual references and concept art for your story</p>
      </div>

      <div className="illustration-sections">
        <div className="prompt-section">
          <h4>Create Illustration</h4>
          <select className="illustration-type">
            <option>Character Portrait</option>
            <option>Scene/Setting</option>
            <option>Item/Object</option>
            <option>Creature/Monster</option>
            <option>Cover Art</option>
          </select>
          <textarea 
            className="illustration-prompt"
            placeholder="Describe what you want to illustrate in detail...&#10;&#10;Example: A mysterious wizard with a long silver beard, wearing deep purple robes adorned with golden stars. He holds an ancient wooden staff with a glowing crystal at the top. Background: twilight forest with ethereal mist."
          />
          <button className="generate-button"><FontAwesomeIcon icon={faWandMagicSparkles} /> Generate Illustration</button>
        </div>

        <div className="gallery-section">
          <h4>Your Illustrations</h4>
          <div className="illustration-gallery">
            <div className="illustration-placeholder">
              <div className="placeholder-icon"><FontAwesomeIcon icon={faImage} /></div>
              <p>Your generated illustrations will appear here</p>
            </div>
          </div>
        </div>

        <div className="reference-section">
          <h4>Style References</h4>
          <div className="style-options">
            <div className="style-tag">Realistic</div>
            <div className="style-tag">Fantasy Art</div>
            <div className="style-tag">Manga/Anime</div>
            <div className="style-tag">Watercolor</div>
            <div className="style-tag">Digital Art</div>
            <div className="style-tag">Sketch</div>
            <div className="style-tag">Oil Painting</div>
            <div className="style-tag">Comic Book</div>
          </div>
        </div>
      </div>
    </div>
  );
}
