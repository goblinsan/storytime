import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faUsers, faMap, faLandmark, faChartBar,
  faDragon, faRoute, faShieldHalved, faComments, faBookOpen, faScroll,
} from '@fortawesome/free-solid-svg-icons';
import './Home.css';

export default function Home() {
  return (
    <div className="home">
      <section className="hero">
        <h1>The Worldbuilder's Living Codex</h1>
        <p className="hero-subtitle">
          A durable canon catalog and editorial workspace for imaginary universes. Build geography, factions,
          timelines, and bestiaries into lasting lore, then generate derivative campaigns, prose stories, and session packets.
        </p>
        <div className="hero-actions">
          <Link to="/create" className="cta-button">+ Create a Universe</Link>
          <Link to="/projects" className="cta-button cta-campaign">Explore Archives</Link>
          <Link to="/drafts" className="cta-button cta-secondary">Review Drafts Queue</Link>
        </div>
      </section>

      <section className="features">
        <h2>Universe Canon Dimensions</h2>
        <div className="feature-grid">
          <div className="feature-card">
            <div className="feature-icon"><FontAwesomeIcon icon={faMap} /></div>
            <h3>Geography &amp; World Map</h3>
            <p>Define multi-level world nodes, regions, areas, scenes, terrain, and travel paths</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon"><FontAwesomeIcon icon={faLandmark} /></div>
            <h3>Factions &amp; Geopolitics</h3>
            <p>Document power blocs, treaties, border frictions, and political motives across regions</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon"><FontAwesomeIcon icon={faRoute} /></div>
            <h3>History &amp; Macro Timelines</h3>
            <p>Track epochal timelines, turning points, and causal event chains across eras</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon"><FontAwesomeIcon icon={faUsers} /></div>
            <h3>Cast &amp; Character Lineages</h3>
            <p>Catalog personas, leaders, motivations, and cross-project character identities</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon"><FontAwesomeIcon icon={faDragon} /></div>
            <h3>Universe Bestiary</h3>
            <p>Catalog creatures, ecological threats, habits, encounter pressure, and shared variants</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon"><FontAwesomeIcon icon={faComments} /></div>
            <h3>Culture, Language &amp; Religion</h3>
            <p>Author myths, linguistic naming conventions, deities, rites, and societal taboos</p>
          </div>
        </div>
      </section>

      <section className="features">
        <h2>Downstream Derivative Works</h2>
        <div className="feature-grid">
          <div className="feature-card">
            <div className="feature-icon"><FontAwesomeIcon icon={faShieldHalved} /></div>
            <h3>Campaigns &amp; Table Play</h3>
            <p>Generate session packets, NPC trackers, and live D&amp;D Campaign Table export bundles</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon"><FontAwesomeIcon icon={faBookOpen} /></div>
            <h3>Prose Stories &amp; Arcs</h3>
            <p>Spin off focused story arcs, chapter guides, and narrative beats anchored in universe canon</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon"><FontAwesomeIcon icon={faScroll} /></div>
            <h3>Screenplays &amp; Storyboards</h3>
            <p>Produce scene outlines, character cues, and visual beats derived from hardened lore</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon"><FontAwesomeIcon icon={faChartBar} /></div>
            <h3>Game Concepts &amp; Mechanics</h3>
            <p>Design interactive game bibles, encounter tables, and system mechanics</p>
          </div>
        </div>
      </section>

      <section className="cta-section">
        <h2>Start Building Your Universe</h2>
        <p>Your canon catalog is saved locally and acts as the single source of truth for all derivatives</p>
        <div className="hero-actions">
          <Link to="/create" className="cta-button">+ New Universe</Link>
          <Link to="/projects" className="cta-button cta-campaign">Explore Universes</Link>
        </div>
      </section>
    </div>
  );
}
