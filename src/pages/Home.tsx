import { Link } from 'react-router-dom';
import './Home.css';

export default function Home() {
  return (
    <div className="home">
      <section className="hero">
        <h1>Welcome to StoryTime</h1>
        <p className="hero-subtitle">Your complete framework for creating and sharing stories</p>
        <Link to="/create" className="cta-button">Start Creating</Link>
      </section>

      <section className="features">
        <h2>Storytelling Tools</h2>
        <div className="feature-grid">
          <div className="feature-card">
            <div className="feature-icon">✍️</div>
            <h3>Writing Guides</h3>
            <p>Get assistance with plot structure, pacing, dialogue, and narrative techniques</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">👥</div>
            <h3>Character Development</h3>
            <p>Build rich, complex characters with backgrounds, traits, and relationships</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">🗺️</div>
            <h3>World Building</h3>
            <p>Create detailed maps, locations, and timelines for your story's universe</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">🏛️</div>
            <h3>Culture Creation</h3>
            <p>Design myths, languages, religions, and political systems for your world</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">🎨</div>
            <h3>Illustration Assistant</h3>
            <p>Get help visualizing your characters, settings, and key scenes</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">📊</div>
            <h3>Planning Guides</h3>
            <p>Manage your project with Gantt charts, tasks, timelines, and budgets</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">📚</div>
            <h3>Story Hosting</h3>
            <p>Publish and share your stories with readers around the world</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">🔗</div>
            <h3>Collaboration</h3>
            <p>Share your creative work and get feedback from the community</p>
          </div>
        </div>
      </section>

      <section className="cta-section">
        <h2>Ready to Start Your Story?</h2>
        <p>Join our community of storytellers and bring your ideas to life</p>
        <Link to="/create" className="cta-button">Create Your First Story</Link>
      </section>
    </div>
  );
}
