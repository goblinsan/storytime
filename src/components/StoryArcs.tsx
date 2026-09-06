import { useState, useEffect, useRef, useCallback } from 'react';
import type { StoryArc } from '../types/story';
import { api } from '../api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRoute, faXmark, faPlus, faTrashCan } from '@fortawesome/free-solid-svg-icons';
import './StoryArcs.css';

interface Props {
  storyId: string | null;
  ensureStory: () => Promise<string>;
}

export default function StoryArcs({ storyId, ensureStory }: Props) {
  const [arcs, setArcs] = useState<StoryArc[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (storyId) {
      api.arcs.list(storyId).then(setArcs).catch(console.error);
    }
  }, [storyId]);

  const selected = arcs.find(a => a.id === selectedId);

  const addArc = async () => {
    try {
      const id = await ensureStory();
      const newArc = await api.arcs.create({
        projectId: id,
        title: 'New Arc',
      });
      setArcs(prev => [...prev, newArc]);
      setSelectedId(newArc.id);
    } catch (err) {
      console.error('Failed to add arc:', err);
    }
  };

  const deleteArc = async (arcId: string) => {
    try {
      await api.arcs.delete(arcId);
      setArcs(prev => prev.filter(a => a.id !== arcId));
      if (selectedId === arcId) setSelectedId(null);
    } catch (err) {
      console.error('Failed to delete arc:', err);
    }
  };

  const updateField = useCallback((arcId: string, field: string, value: unknown) => {
    setArcs(prev => prev.map(a => {
      if (a.id !== arcId) return a;
      return { ...a, [field]: value };
    }));

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        const data: Record<string, unknown> = { [field]: value };
        await api.arcs.update(arcId, data as Partial<StoryArc>);
      } catch (err) {
        console.error('Auto-save failed:', err);
      }
    }, 800);
  }, []);

  const addDetail = (arcId: string) => {
    const arc = arcs.find(a => a.id === arcId);
    if (!arc) return;
    const newDetails = [...arc.details, ''];
    updateField(arcId, 'details', newDetails);
  };

  const updateDetail = (arcId: string, index: number, value: string) => {
    const arc = arcs.find(a => a.id === arcId);
    if (!arc) return;
    const newDetails = [...arc.details];
    newDetails[index] = value;
    updateField(arcId, 'details', newDetails);
  };

  const removeDetail = (arcId: string, index: number) => {
    const arc = arcs.find(a => a.id === arcId);
    if (!arc) return;
    const newDetails = arc.details.filter((_, i) => i !== index);
    updateField(arcId, 'details', newDetails);
  };

  return (
    <div className="story-arcs">
      <div className="arcs-sidebar">
        <div className="sidebar-header">
          <h3>Story Arcs</h3>
          <button onClick={addArc} className="add-button">+ Add</button>
        </div>
        <div className="arcs-list">
          {arcs.map((arc) => (
            <div
              key={arc.id}
              className={`arc-item ${selectedId === arc.id ? 'active' : ''}`}
              onClick={() => setSelectedId(arc.id)}
            >
              <div className="arc-number">{arc.arcNumber}</div>
              <div className="arc-item-info">
                <span className="arc-title">{arc.title}</span>
                <span className="arc-detail-count">{arc.details.length} points</span>
              </div>
              <button
                className="delete-char-btn"
                onClick={(e) => { e.stopPropagation(); deleteArc(arc.id); }}
                title="Remove arc"
              ><FontAwesomeIcon icon={faXmark} /></button>
            </div>
          ))}
        </div>
      </div>

      <div className="arcs-editor">
        {selected ? (
          <>
            <div className="form-row">
              <div className="form-group form-group-small">
                <label>Arc #</label>
                <input
                  type="number"
                  min="1"
                  value={selected.arcNumber}
                  onChange={(e) => updateField(selected.id, 'arcNumber', Number(e.target.value))}
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Title</label>
                <input
                  type="text"
                  placeholder="Arc title"
                  value={selected.title}
                  onChange={(e) => updateField(selected.id, 'title', e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Description</label>
              <textarea
                placeholder="Overview of this arc..."
                value={selected.description}
                onChange={(e) => updateField(selected.id, 'description', e.target.value)}
              />
            </div>

            <div className="arc-details-section">
              <div className="details-header">
                <label>Story Beats / Details</label>
                <button className="add-detail-btn" onClick={() => addDetail(selected.id)}>
                  <FontAwesomeIcon icon={faPlus} /> Add Point
                </button>
              </div>
              <div className="details-list">
                {selected.details.map((detail, idx) => (
                  <div key={idx} className="detail-row">
                    <span className="detail-bullet">{idx + 1}.</span>
                    <input
                      type="text"
                      placeholder="Story beat..."
                      value={detail}
                      onChange={(e) => updateDetail(selected.id, idx, e.target.value)}
                    />
                    <button
                      className="remove-detail-btn"
                      onClick={() => removeDetail(selected.id, idx)}
                      title="Remove"
                    ><FontAwesomeIcon icon={faTrashCan} /></button>
                  </div>
                ))}
                {selected.details.length === 0 && (
                  <p className="no-details">No story beats yet. Click "Add Point" to start outlining this arc.</p>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <FontAwesomeIcon icon={faRoute} style={{ fontSize: '2rem', marginBottom: '1rem', color: '#ccc' }} />
            <p>Select an arc or create a new one to outline your campaign's story progression</p>
          </div>
        )}
      </div>
    </div>
  );
}
