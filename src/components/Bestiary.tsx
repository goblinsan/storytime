import { useState, useEffect, useRef, useCallback } from 'react';
import type { BestiaryEntry, BestiaryStatus } from '../types/story';
import { api } from '../api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDragon, faXmark, faHeart, faSkull, faCircleQuestion } from '@fortawesome/free-solid-svg-icons';
import './Bestiary.css';

interface Props {
  storyId: string | null;
  ensureStory: () => Promise<string>;
}

const statusIcons: Record<BestiaryStatus, typeof faSkull> = {
  active: faDragon,
  defeated: faSkull,
  unknown: faCircleQuestion,
};

const statusLabels: Record<BestiaryStatus, string> = {
  active: 'Active',
  defeated: 'Defeated',
  unknown: 'Unknown',
};

export default function Bestiary({ storyId, ensureStory }: Props) {
  const [entries, setEntries] = useState<BestiaryEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (storyId) {
      api.bestiary.list(storyId).then(setEntries).catch(console.error);
    }
  }, [storyId]);

  const selected = entries.find(e => e.id === selectedId);

  // Group entries by category
  const categories = Array.from(new Set(entries.map(e => e.category || 'Uncategorized')));

  const addEntry = async () => {
    try {
      const id = await ensureStory();
      const newEntry = await api.bestiary.create({
        projectId: id,
        name: 'New Creature',
      });
      setEntries(prev => [...prev, newEntry]);
      setSelectedId(newEntry.id);
    } catch (err) {
      console.error('Failed to add entry:', err);
    }
  };

  const deleteEntry = async (entryId: string) => {
    try {
      await api.bestiary.delete(entryId);
      setEntries(prev => prev.filter(e => e.id !== entryId));
      if (selectedId === entryId) setSelectedId(null);
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  };

  const updateField = useCallback((entryId: string, field: string, value: unknown) => {
    setEntries(prev => prev.map(e => {
      if (e.id !== entryId) return e;
      if (field === 'tactics' && typeof value === 'string') {
        return { ...e, tactics: value.split(',').map(s => s.trim()).filter(Boolean) };
      }
      return { ...e, [field]: value };
    }));

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        const data: Record<string, unknown> = {};
        if (field === 'tactics' && typeof value === 'string') {
          data.tactics = value.split(',').map(s => s.trim()).filter(Boolean);
        } else {
          data[field] = value;
        }
        await api.bestiary.update(entryId, data as Partial<BestiaryEntry>);
      } catch (err) {
        console.error('Auto-save failed:', err);
      }
    }, 800);
  }, []);

  return (
    <div className="bestiary">
      <div className="bestiary-sidebar">
        <div className="sidebar-header">
          <h3>Bestiary</h3>
          <button onClick={addEntry} className="add-button">+ Add</button>
        </div>
        <div className="bestiary-list">
          {categories.map(cat => (
            <div key={cat} className="bestiary-category">
              <div className="category-label">{cat}</div>
              {entries.filter(e => (e.category || 'Uncategorized') === cat).map(entry => (
                <div
                  key={entry.id}
                  className={`bestiary-item ${selectedId === entry.id ? 'active' : ''}`}
                  onClick={() => setSelectedId(entry.id)}
                >
                  <div className="bestiary-avatar">
                    <FontAwesomeIcon icon={statusIcons[entry.status]} />
                  </div>
                  <div className="bestiary-item-info">
                    <span className="bestiary-name">{entry.name}</span>
                    {entry.hearts != null && (
                      <span className="bestiary-hearts"><FontAwesomeIcon icon={faHeart} /> {entry.hearts}</span>
                    )}
                  </div>
                  <span className={`bestiary-status status-${entry.status}`}>
                    {statusLabels[entry.status]}
                  </span>
                  <button
                    className="delete-char-btn"
                    onClick={(e) => { e.stopPropagation(); deleteEntry(entry.id); }}
                    title="Remove creature"
                  ><FontAwesomeIcon icon={faXmark} /></button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="bestiary-editor">
        {selected ? (
          <>
            <input
              type="text"
              placeholder="Creature Name"
              className="character-name-input"
              value={selected.name}
              onChange={(e) => updateField(selected.id, 'name', e.target.value)}
            />

            <div className="form-row">
              <div className="form-group">
                <label>Category</label>
                <input
                  type="text"
                  placeholder="e.g., Slimes, Goblins, Undead"
                  value={selected.category}
                  onChange={(e) => updateField(selected.id, 'category', e.target.value)}
                />
              </div>
              <div className="form-group form-group-small">
                <label><FontAwesomeIcon icon={faHeart} /> Hearts</label>
                <input
                  type="number"
                  min="0"
                  value={selected.hearts ?? ''}
                  onChange={(e) => updateField(selected.id, 'hearts', e.target.value ? Number(e.target.value) : null)}
                />
              </div>
              <div className="form-group">
                <label>Status</label>
                <select
                  value={selected.status}
                  onChange={(e) => updateField(selected.id, 'status', e.target.value)}
                >
                  <option value="active">Active</option>
                  <option value="defeated">Defeated</option>
                  <option value="unknown">Unknown</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Description</label>
              <textarea
                placeholder="Appearance, behavior, lore..."
                value={selected.description}
                onChange={(e) => updateField(selected.id, 'description', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Tactics</label>
              <input
                type="text"
                placeholder="bombs, traps, swarming (comma separated)"
                value={selected.tactics.join(', ')}
                onChange={(e) => updateField(selected.id, 'tactics', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Notes</label>
              <textarea
                placeholder="Additional notes, weaknesses, special behavior..."
                value={selected.notes}
                onChange={(e) => updateField(selected.id, 'notes', e.target.value)}
              />
            </div>
          </>
        ) : (
          <div className="empty-state">
            <p>Select a creature or add a new one</p>
          </div>
        )}
      </div>
    </div>
  );
}
