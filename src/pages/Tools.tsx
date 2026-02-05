import { Link } from 'react-router-dom';
import './Tools.css';

export default function Tools() {
  const tools = [
    {
      title: 'Writing Guides',
      icon: '✍️',
      description: 'Learn about plot structure, pacing, dialogue, and narrative techniques',
      link: '/create',
    },
    {
      title: 'Character Development',
      icon: '👥',
      description: 'Build complex characters with detailed backgrounds and relationships',
      link: '/create',
    },
    {
      title: 'World Building',
      icon: '🗺️',
      description: 'Create immersive worlds with maps, locations, and timelines',
      link: '/create',
    },
    {
      title: 'Culture Creation',
      icon: '🏛️',
      description: 'Design myths, languages, religions, and political systems',
      link: '/create',
    },
    {
      title: 'Illustration Assistant',
      icon: '🎨',
      description: 'Visualize characters, settings, and key scenes',
      link: '/create',
    },
    {
      title: 'Planning Guides',
      icon: '📊',
      description: 'Manage projects with Gantt charts, tasks, and budgets',
      link: '/create',
    },
  ];

  return (
    <div className="tools-page">
      <div className="tools-header">
        <h1>Storytelling Tools</h1>
        <p>Everything you need to craft your perfect story</p>
      </div>

      <div className="tools-grid">
        {tools.map((tool, index) => (
          <Link key={index} to={tool.link} className="tool-card">
            <div className="tool-icon">{tool.icon}</div>
            <h3>{tool.title}</h3>
            <p>{tool.description}</p>
            <span className="tool-link-arrow">→</span>
          </Link>
        ))}
      </div>

      <div className="tools-cta">
        <h2>Ready to Start?</h2>
        <p>All these tools are available when you create a new story</p>
        <Link to="/create" className="cta-button">Create Your Story</Link>
      </div>
    </div>
  );
}
