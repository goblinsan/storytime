import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import WritingGuides from '../components/WritingGuides';
import CharacterDevelopment from '../components/CharacterDevelopment';
import WorldBuilding from '../components/WorldBuilding';
import CultureCreation from '../components/CultureCreation';
import IllustrationAssistant from '../components/IllustrationAssistant';
import PlanningGuides from '../components/PlanningGuides';
import ImportManager from '../components/ImportManager';
import PartyManager from '../components/PartyManager';
import NpcManager from '../components/NpcManager';
import Bestiary from '../components/Bestiary';
import StoryArcs from '../components/StoryArcs';
import GeneratedDraftReview from '../components/GeneratedDraftReview';
import { api } from '../api';
import type { ProjectType } from '../types/story';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPenNib, faUsers, faMap, faLandmark, faPalette, faChartBar,
  faFloppyDisk, faSpinner, faFileImport, faShieldHalved, faComments,
  faDragon, faRoute, faScroll, faWandMagicSparkles,
} from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import './CreateStory.css';

export default function CreateProject() {
  const { storyId } = useParams<{ storyId?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('');
  const [projectTitle, setProjectTitle] = useState('');
  const [projectType, setProjectType] = useState<ProjectType>(
    (searchParams.get('type') as ProjectType) || 'story'
  );
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(storyId ?? null);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  // Load existing project if editing
  useEffect(() => {
    if (storyId) {
      api.stories.get(storyId).then((project) => {
        setProjectTitle(project.title);
        setProjectType(project.type as ProjectType || 'story');
        setCurrentProjectId(project.id);
      }).catch(console.error);
    }
  }, [storyId]);

  // Set default tab based on project type
  useEffect(() => {
    if (!activeTab) {
      setActiveTab(projectType === 'campaign' ? 'session-notes' : 'writing');
    }
  }, [projectType, activeTab]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      if (currentProjectId) {
        await api.stories.update(currentProjectId, { title: projectTitle, type: projectType } as never);
      } else {
        const project = await api.stories.create({ title: projectTitle, type: projectType });
        setCurrentProjectId(project.id);
        navigate(`/create/${project.id}`, { replace: true });
      }
      setLastSaved(new Date().toLocaleTimeString());
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setSaving(false);
    }
  }, [currentProjectId, projectTitle, projectType, navigate]);

  const ensureStory = useCallback(async (): Promise<string> => {
    if (currentProjectId) return currentProjectId;
    const project = await api.stories.create({
      title: projectTitle || (projectType === 'campaign' ? 'Untitled Campaign' : 'Untitled Story'),
      type: projectType,
    });
    setCurrentProjectId(project.id);
    navigate(`/create/${project.id}`, { replace: true });
    return project.id;
  }, [currentProjectId, projectTitle, projectType, navigate]);

  // Tab definitions per project type
  const storyTabs: { id: string; label: string; icon: IconDefinition }[] = [
    { id: 'writing', label: 'Writing', icon: faPenNib },
    { id: 'characters', label: 'Characters', icon: faUsers },
    { id: 'world', label: 'World Building', icon: faMap },
    { id: 'culture', label: 'Culture', icon: faLandmark },
    { id: 'illustration', label: 'Illustration', icon: faPalette },
    { id: 'planning', label: 'Planning', icon: faChartBar },
    { id: 'import', label: 'Import', icon: faFileImport },
    { id: 'drafts', label: 'Drafts', icon: faWandMagicSparkles },
  ];

  const campaignTabs: { id: string; label: string; icon: IconDefinition }[] = [
    { id: 'session-notes', label: 'Session Notes', icon: faScroll },
    { id: 'arcs', label: 'Story Arcs', icon: faRoute },
    { id: 'party', label: 'Party', icon: faShieldHalved },
    { id: 'npcs', label: 'NPCs', icon: faComments },
    { id: 'bestiary', label: 'Bestiary', icon: faDragon },
    { id: 'world', label: 'World / Regions', icon: faMap },
    { id: 'culture', label: 'Culture', icon: faLandmark },
    { id: 'planning', label: 'Planning', icon: faChartBar },
    { id: 'import', label: 'Import', icon: faFileImport },
    { id: 'drafts', label: 'Drafts', icon: faWandMagicSparkles },
  ];

  const tabs = projectType === 'campaign' ? campaignTabs : storyTabs;

  // When switching project type, reset to a sensible default tab
  const handleTypeChange = (newType: ProjectType) => {
    setProjectType(newType);
    setActiveTab(newType === 'campaign' ? 'session-notes' : 'writing');
  };

  return (
    <div className="create-story">
      <div className="story-header">
        <div className="project-type-toggle">
          <button
            className={`type-btn ${projectType === 'story' ? 'active' : ''}`}
            onClick={() => handleTypeChange('story')}
            disabled={!!currentProjectId}
            title={currentProjectId ? 'Cannot change type after creation' : ''}
          >
            <FontAwesomeIcon icon={faPenNib} /> Story
          </button>
          <button
            className={`type-btn ${projectType === 'campaign' ? 'active' : ''}`}
            onClick={() => handleTypeChange('campaign')}
            disabled={!!currentProjectId}
            title={currentProjectId ? 'Cannot change type after creation' : ''}
          >
            <FontAwesomeIcon icon={faDragon} /> Campaign
          </button>
        </div>
        <input
          type="text"
          placeholder={projectType === 'campaign' ? 'Enter campaign name...' : 'Enter your story title...'}
          value={projectTitle}
          onChange={(e) => setProjectTitle(e.target.value)}
          className="story-title-input"
        />
        <button className="save-button" onClick={handleSave} disabled={saving}>
          <FontAwesomeIcon icon={saving ? faSpinner : faFloppyDisk} spin={saving} /> {saving ? 'Saving...' : 'Save Draft'}
        </button>
        {lastSaved && <span className="save-status">Saved at {lastSaved}</span>}
      </div>

      <div className="tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="tab-icon"><FontAwesomeIcon icon={tab.icon} /></span>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="tab-content">
        {/* Shared tabs */}
        {(activeTab === 'writing' || activeTab === 'session-notes') && (
          <WritingGuides storyId={currentProjectId} ensureStory={ensureStory} />
        )}
        {activeTab === 'world' && <WorldBuilding storyId={currentProjectId} ensureStory={ensureStory} />}
        {activeTab === 'culture' && <CultureCreation />}
        {activeTab === 'illustration' && <IllustrationAssistant />}
        {activeTab === 'planning' && <PlanningGuides />}
        {activeTab === 'import' && <ImportManager storyId={currentProjectId} ensureStory={ensureStory} />}

        {/* Story-only tabs */}
        {activeTab === 'characters' && <CharacterDevelopment storyId={currentProjectId} ensureStory={ensureStory} />}

        {/* Campaign-only tabs */}
        {activeTab === 'party' && <PartyManager storyId={currentProjectId} ensureStory={ensureStory} />}
        {activeTab === 'npcs' && <NpcManager storyId={currentProjectId} ensureStory={ensureStory} />}
        {activeTab === 'bestiary' && <Bestiary storyId={currentProjectId} ensureStory={ensureStory} />}
        {activeTab === 'arcs' && <StoryArcs storyId={currentProjectId} ensureStory={ensureStory} />}

        {/* Generated drafts review tab */}
        {activeTab === 'drafts' && <GeneratedDraftReview storyId={currentProjectId} />}
      </div>
    </div>
  );
}
