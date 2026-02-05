import { useState } from 'react';
import WritingGuides from '../components/WritingGuides';
import CharacterDevelopment from '../components/CharacterDevelopment';
import WorldBuilding from '../components/WorldBuilding';
import CultureCreation from '../components/CultureCreation';
import IllustrationAssistant from '../components/IllustrationAssistant';
import PlanningGuides from '../components/PlanningGuides';
import './CreateStory.css';

export default function CreateStory() {
  const [activeTab, setActiveTab] = useState('writing');
  const [storyTitle, setStoryTitle] = useState('');

  const tabs = [
    { id: 'writing', label: 'Writing', icon: '✍️' },
    { id: 'characters', label: 'Characters', icon: '👥' },
    { id: 'world', label: 'World Building', icon: '🗺️' },
    { id: 'culture', label: 'Culture', icon: '🏛️' },
    { id: 'illustration', label: 'Illustration', icon: '🎨' },
    { id: 'planning', label: 'Planning', icon: '📊' },
  ];

  return (
    <div className="create-story">
      <div className="story-header">
        <input
          type="text"
          placeholder="Enter your story title..."
          value={storyTitle}
          onChange={(e) => setStoryTitle(e.target.value)}
          className="story-title-input"
        />
        <button className="save-button">💾 Save Draft</button>
        <button className="publish-button">🚀 Publish</button>
      </div>

      <div className="tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="tab-icon">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="tab-content">
        {activeTab === 'writing' && <WritingGuides />}
        {activeTab === 'characters' && <CharacterDevelopment />}
        {activeTab === 'world' && <WorldBuilding />}
        {activeTab === 'culture' && <CultureCreation />}
        {activeTab === 'illustration' && <IllustrationAssistant />}
        {activeTab === 'planning' && <PlanningGuides />}
      </div>
    </div>
  );
}
