import { useState } from 'react';
import WorldMapEditor from './WorldMapEditor';
import WorldMapViewer from './WorldMapViewer';
import './WorldBuilding.css';

interface Props {
  storyId: string | null;
  ensureStory: () => Promise<string>;
}

export default function WorldBuilding({ storyId, ensureStory }: Props) {
  const [viewMode, setViewMode] = useState(false);

  if (!storyId) {
    return (
      <div className="world-building">
        <div style={{ padding: 32, color: '#666', textAlign: 'center' }}>
          Select or create a campaign to open the map editor.
        </div>
      </div>
    );
  }

  if (viewMode) {
    return (
      <div className="world-building" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <WorldMapViewer storyId={storyId} onClose={() => setViewMode(false)} />
      </div>
    );
  }

  return (
    <div className="world-building" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <WorldMapEditor storyId={storyId} ensureStory={ensureStory} onViewMap={() => setViewMode(true)} />
    </div>
  );
}

