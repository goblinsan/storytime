import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import UniverseEncyclopediaHome from '../components/UniverseEncyclopediaHome';
import WritingGuides from '../components/WritingGuides';
import CharacterDevelopment from '../components/CharacterDevelopment';
import WorldBuilding from '../components/WorldBuilding';
import CultureCreation from '../components/CultureCreation';
import PlanningGuides from '../components/PlanningGuides';
import ImportManager from '../components/ImportManager';
import PartyManager from '../components/PartyManager';
import NpcManager from '../components/NpcManager';
import Bestiary from '../components/Bestiary';
import StoryArcs from '../components/StoryArcs';
import GeneratedDraftReview from '../components/GeneratedDraftReview';
import DerivativeWorksManager from '../components/DerivativeWorksManager';
import { api } from '../api';
import type { ProjectType } from '../types/story';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faGlobe, faUsers, faMap, faLandmark, faChartBar,
  faFloppyDisk, faSpinner, faFileImport, faShieldHalved, faComments,
  faDragon, faRoute, faPenNib, faWandMagicSparkles, faScroll,
} from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import './CreateStory.css';

export default function CreateProject() {
  const { storyId } = useParams<{ storyId?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('overview');
  const [projectTitle, setProjectTitle] = useState('');
  const [projectType, setProjectType] = useState<ProjectType>(
    (searchParams.get('type') as ProjectType) || 'universe'
  );
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(storyId ?? null);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  // Load existing project if editing
  useEffect(() => {
    if (storyId) {
      api.stories.get(storyId).then((project) => {
        setProjectTitle(project.title);
        setProjectType(project.type as ProjectType || 'universe');
        setCurrentProjectId(project.id);
      }).catch(console.error);
    }
  }, [storyId]);

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
      title: projectTitle || 'Untitled Universe',
      type: projectType,
    });
    setCurrentProjectId(project.id);
    navigate(`/create/${project.id}`, { replace: true });
    return project.id;
  }, [currentProjectId, projectTitle, projectType, navigate]);

  // Comprehensive Universe Encyclopedia Tabs
  const universeTabs: { id: string; label: string; icon: IconDefinition }[] = [
    { id: 'overview', label: 'Encyclopedia Home', icon: faGlobe },
    { id: 'world', label: 'World & Map', icon: faMap },
    { id: 'characters', label: 'Characters & Cast', icon: faUsers },
    { id: 'culture', label: 'Factions & Culture', icon: faLandmark },
    { id: 'bestiary', label: 'Bestiary', icon: faDragon },
    { id: 'derivatives', label: 'Derivatives', icon: faScroll },
    { id: 'arcs', label: 'Arcs & Beats', icon: faRoute },
    { id: 'drafts', label: 'Drafts', icon: faWandMagicSparkles },
    { id: 'notes', label: 'Lore Notes', icon: faPenNib },
    { id: 'import', label: 'Import / Export', icon: faFileImport },
    { id: 'planning', label: 'Planning', icon: faChartBar },
  ];

  return (
    <div className="create-story">
      <div className="story-header">
        <div className="project-type-toggle">
          <span style={{
            background: '#0284c7',
            color: '#fff',
            fontSize: '0.8rem',
            fontWeight: 600,
            padding: '0.35rem 0.75rem',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
          }}>
            <FontAwesomeIcon icon={faGlobe} /> Universe
          </span>
        </div>
        <input
          type="text"
          placeholder="Enter universe / setting title..."
          value={projectTitle}
          onChange={(e) => setProjectTitle(e.target.value)}
          className="story-title-input"
        />
        <button className="save-button" onClick={handleSave} disabled={saving}>
          <FontAwesomeIcon icon={saving ? faSpinner : faFloppyDisk} spin={saving} /> {saving ? 'Saving...' : 'Save Universe'}
        </button>
        {lastSaved && <span className="save-status">Saved at {lastSaved}</span>}
      </div>

      <div className="tabs">
        {universeTabs.map((tab) => (
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
        {/* 1. Universe Encyclopedia Home (Overview) */}
        {activeTab === 'overview' && (
          <UniverseEncyclopediaHome
            projectId={currentProjectId}
            onSelectTab={(tabId) => setActiveTab(tabId)}
          />
        )}

        {/* 2. Geography & World Map */}
        {activeTab === 'world' && (
          <WorldBuilding storyId={currentProjectId} ensureStory={ensureStory} />
        )}

        {/* 3. Characters, Cast & Party */}
        {activeTab === 'characters' && (
          <div>
            <CharacterDevelopment storyId={currentProjectId} ensureStory={ensureStory} />
            <div style={{ marginTop: '2rem', borderTop: '1px solid #334155', paddingTop: '1.5rem' }}>
              <h3 style={{ color: '#f8fafc', marginBottom: '1rem' }}>
                <FontAwesomeIcon icon={faComments} /> Non-Player Characters (NPCs)
              </h3>
              <NpcManager storyId={currentProjectId} ensureStory={ensureStory} />
            </div>
            <div style={{ marginTop: '2rem', borderTop: '1px solid #334155', paddingTop: '1.5rem' }}>
              <h3 style={{ color: '#f8fafc', marginBottom: '1rem' }}>
                <FontAwesomeIcon icon={faShieldHalved} /> Campaign Adventuring Parties
              </h3>
              <PartyManager storyId={currentProjectId} ensureStory={ensureStory} />
            </div>
          </div>
        )}

        {/* 4. Culture, Factions & Religions */}
        {activeTab === 'culture' && (
          <CultureCreation />
        )}

        {/* 5. Bestiary */}
        {activeTab === 'bestiary' && (
          <Bestiary storyId={currentProjectId} ensureStory={ensureStory} />
        )}

        {/* 6. Derivative Works */}
        {activeTab === 'derivatives' && (
          <DerivativeWorksManager projectId={currentProjectId} ensureStory={ensureStory} />
        )}

        {/* 7. Arcs & Beats */}
        {activeTab === 'arcs' && (
          <StoryArcs storyId={currentProjectId} ensureStory={ensureStory} />
        )}

        {/* 7. Generated Drafts Review */}
        {activeTab === 'drafts' && (
          <GeneratedDraftReview storyId={currentProjectId} />
        )}

        {/* 8. Lore Notes & Writing */}
        {activeTab === 'notes' && (
          <WritingGuides storyId={currentProjectId} ensureStory={ensureStory} />
        )}

        {/* 9. Import & Integration */}
        {activeTab === 'import' && (
          <ImportManager storyId={currentProjectId} ensureStory={ensureStory} />
        )}

        {/* 10. Planning */}
        {activeTab === 'planning' && (
          <PlanningGuides />
        )}
      </div>
    </div>
  );
}
