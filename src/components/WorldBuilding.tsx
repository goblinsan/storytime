import { useState, useEffect } from 'react';
import LocationsViewer from './LocationsViewer';
import WorldMapEditor from './WorldMapEditor';
import WorldMapViewer from './WorldMapViewer';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faList, faMap } from '@fortawesome/free-solid-svg-icons';
import './WorldBuilding.css';

interface Props {
  storyId: string | null;
  ensureStory: () => Promise<string>;
  initialEntityId?: string | null;
}

export default function WorldBuilding({ storyId, ensureStory, initialEntityId }: Props) {
  const [activeSubTab, setActiveSubTab] = useState<'directory' | 'map'>('directory');
  const [viewMode, setViewMode] = useState(false);

  useEffect(() => {
    if (initialEntityId) {
      setActiveSubTab('directory');
    }
  }, [initialEntityId]);

  if (!storyId) {
    return (
      <div className="world-building">
        <div style={{ padding: 32, color: '#666', textAlign: 'center' }}>
          Select or create a universe project to inspect its star systems and charted places.
        </div>
      </div>
    );
  }

  return (
    <div className="world-building" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Subnav bar between Locations Directory and Map Canvas */}
      <div className="world-subnav" style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem 1.5rem 0', background: 'var(--bg-main, #0f172a)' }}>
        <button
          className={`world-subnav-btn ${activeSubTab === 'directory' ? 'active' : ''}`}
          style={{
            padding: '0.45rem 1rem',
            borderRadius: '6px 6px 0 0',
            border: '1px solid var(--border-color, #334155)',
            borderBottom: activeSubTab === 'directory' ? '2px solid #38bdf8' : 'none',
            background: activeSubTab === 'directory' ? 'var(--bg-secondary, #1e293b)' : 'transparent',
            color: activeSubTab === 'directory' ? '#38bdf8' : 'var(--text-muted, #94a3b8)',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
          }}
          onClick={() => setActiveSubTab('directory')}
        >
          <FontAwesomeIcon icon={faList} /> Locations &amp; Systems Directory
        </button>
        <button
          className={`world-subnav-btn ${activeSubTab === 'map' ? 'active' : ''}`}
          style={{
            padding: '0.45rem 1rem',
            borderRadius: '6px 6px 0 0',
            border: '1px solid var(--border-color, #334155)',
            borderBottom: activeSubTab === 'map' ? '2px solid #38bdf8' : 'none',
            background: activeSubTab === 'map' ? 'var(--bg-secondary, #1e293b)' : 'transparent',
            color: activeSubTab === 'map' ? '#38bdf8' : 'var(--text-muted, #94a3b8)',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
          }}
          onClick={() => setActiveSubTab('map')}
        >
          <FontAwesomeIcon icon={faMap} /> 2D Map Canvas
        </button>
      </div>

      {activeSubTab === 'directory' ? (
        <div style={{ flex: 1, minHeight: 0 }}>
          <LocationsViewer
            storyId={storyId}
            initialEntityId={initialEntityId}
            onOpenMap={() => setActiveSubTab('map')}
          />
        </div>
      ) : viewMode ? (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <WorldMapViewer storyId={storyId} onClose={() => setViewMode(false)} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <WorldMapEditor storyId={storyId} ensureStory={ensureStory} onViewMap={() => setViewMode(true)} />
        </div>
      )}
    </div>
  );
}

