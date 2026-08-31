import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPenNib, faUsers, faMap, faLandmark, faPalette, faChartBar, faArrowRight,
  faRoute, faShieldHalved, faComments, faDragon, faWandMagicSparkles,
} from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import './Tools.css';

export default function Tools() {
  const storyTools: { title: string; icon: IconDefinition; description: string; link: string }[] = [
    {
      title: 'Writing Guides',
      icon: faPenNib,
      description: 'Learn about plot structure, pacing, dialogue, and narrative techniques',
      link: '/create?type=story',
    },
    {
      title: 'Character Development',
      icon: faUsers,
      description: 'Build complex characters with detailed backgrounds and relationships',
      link: '/create?type=story',
    },
    {
      title: 'World Building',
      icon: faMap,
      description: 'Create immersive worlds with maps, locations, and timelines',
      link: '/create',
    },
    {
      title: 'Culture Creation',
      icon: faLandmark,
      description: 'Design myths, languages, religions, and political systems',
      link: '/create',
    },
    {
      title: 'Illustration Assistant',
      icon: faPalette,
      description: 'Visualize characters, settings, and key scenes',
      link: '/create',
    },
    {
      title: 'Planning Guides',
      icon: faChartBar,
      description: 'Manage projects with Gantt charts, tasks, and budgets',
      link: '/create',
    },
  ];

  const campaignTools: { title: string; icon: IconDefinition; description: string; link: string }[] = [
    {
      title: 'Story Arcs',
      icon: faRoute,
      description: 'Plan multi-arc campaign progressions with story beats and encounters',
      link: '/create?type=campaign',
    },
    {
      title: 'Party Management',
      icon: faShieldHalved,
      description: 'Track party members with hearts, skills, gifts, and backstories',
      link: '/create?type=campaign',
    },
    {
      title: 'NPC Tracker',
      icon: faComments,
      description: 'Manage non-player characters with roles, locations, and motivations',
      link: '/create?type=campaign',
    },
    {
      title: 'Bestiary',
      icon: faDragon,
      description: 'Catalog creatures with hearts, tactics, status, and encounter notes',
      link: '/create?type=campaign',
    },
    {
      title: 'Generated Draft Reviews',
      icon: faWandMagicSparkles,
      description: 'Inspect, accept, and export LLM-generated campaign bundles for D&D import',
      link: '/drafts',
    },
  ];

  return (
    <div className="tools-page">
      <div className="tools-header">
        <h1>Creative Tools</h1>
        <p>Everything you need to craft stories and run campaigns</p>
      </div>

      <h2 className="tools-section-title">Storytelling</h2>
      <div className="tools-grid">
        {storyTools.map((tool, index) => (
          <Link key={index} to={tool.link} className="tool-card">
            <div className="tool-icon"><FontAwesomeIcon icon={tool.icon} /></div>
            <h3>{tool.title}</h3>
            <p>{tool.description}</p>
            <span className="tool-link-arrow"><FontAwesomeIcon icon={faArrowRight} /></span>
          </Link>
        ))}
      </div>

      <h2 className="tools-section-title">Campaign & Game Building</h2>
      <div className="tools-grid">
        {campaignTools.map((tool, index) => (
          <Link key={index} to={tool.link} className="tool-card tool-card-campaign">
            <div className="tool-icon"><FontAwesomeIcon icon={tool.icon} /></div>
            <h3>{tool.title}</h3>
            <p>{tool.description}</p>
            <span className="tool-link-arrow"><FontAwesomeIcon icon={faArrowRight} /></span>
          </Link>
        ))}
      </div>

      <div className="tools-cta">
        <h2>Ready to Start?</h2>
        <p>All these tools are available when you create a new project</p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <Link to="/create?type=story" className="cta-button">New Story</Link>
          <Link to="/create?type=campaign" className="cta-button">New Campaign</Link>
        </div>
      </div>
    </div>
  );
}
