import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPenNib, faUsers, faMap, faLandmark, faPalette, faChartBar,
  faDragon, faRoute, faShieldHalved, faComments,
} from '@fortawesome/free-solid-svg-icons';
import './Home.css';

export default function Home() {
  return (
    <div className="home">
      <section className="hero">
        <h1>Welcome to StoryTime</h1>
        <p className="hero-subtitle">Your complete framework for creating stories and building campaigns</p>
        <div className="hero-actions">
          <Link to="/create?type=story" className="cta-button">Start a Story</Link>
          <Link to="/create?type=campaign" className="cta-button cta-campaign">Start a Campaign</Link>
        </div>
      </section>

      <section className="features">
        <h2>Storytelling Tools</h2>
        <div className="feature-grid">
          <div className="feature-card">
            <div className="feature-icon"><FontAwesomeIcon icon={faPenNib} /></div>
            <h3>Writing Guides</h3>
            <p>Get assistance with plot structure, pacing, dialogue, and narrative techniques</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon"><FontAwesomeIcon icon={faUsers} /></div>
            <h3>Character Development</h3>
            <p>Build rich, complex characters with backgrounds, traits, and relationships</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon"><FontAwesomeIcon icon={faMap} /></div>
            <h3>World Building</h3>
            <p>Create detailed maps, locations, and timelines for your story's universe</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon"><FontAwesomeIcon icon={faLandmark} /></div>
            <h3>Culture Creation</h3>
            <p>Design myths, languages, religions, and political systems for your world</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon"><FontAwesomeIcon icon={faPalette} /></div>
            <h3>Illustration Assistant</h3>
            <p>Get help visualizing your characters, settings, and key scenes</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon"><FontAwesomeIcon icon={faChartBar} /></div>
            <h3>Planning Guides</h3>
            <p>Manage your project with Gantt charts, tasks, timelines, and budgets</p>
          </div>
        </div>
      </section>

      <section className="features">
        <h2>Campaign & Game Tools</h2>
        <div className="feature-grid">
          <div className="feature-card">
            <div className="feature-icon"><FontAwesomeIcon icon={faRoute} /></div>
            <h3>Story Arcs</h3>
            <p>Plan and track multi-arc campaign progressions with story beats</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon"><FontAwesomeIcon icon={faShieldHalved} /></div>
            <h3>Party Management</h3>
            <p>Track party members with hearts, skills, gifts, and backstories</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon"><FontAwesomeIcon icon={faComments} /></div>
            <h3>NPC Tracker</h3>
            <p>Manage NPCs with roles, locations, motivations, and relationships</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon"><FontAwesomeIcon icon={faDragon} /></div>
            <h3>Bestiary</h3>
            <p>Catalog creatures with hearts, tactics, status, and encounter notes</p>
          </div>
        </div>
      </section>

      <section className="cta-section">
        <h2>Ready to Begin?</h2>
        <p>Create a story or launch a campaign — all saved locally</p>
        <div className="hero-actions">
          <Link to="/create?type=story" className="cta-button">Create a Story</Link>
          <Link to="/create?type=campaign" className="cta-button cta-campaign">Launch a Campaign</Link>
        </div>
      </section>
    </div>
  );
}
