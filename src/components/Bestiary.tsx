import { useState, useEffect, useRef, useCallback } from 'react';
import type { BestiaryEntry, BestiaryStatus } from '../types/story';
import { api } from '../api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDragon, faXmark, faHeart, faSkull, faCircleQuestion } from '@fortawesome/free-solid-svg-icons';
import './Bestiary.css';

interface Props {
  storyId: string | null;
  ensureStory: () => Promise<string>;
  initialEntityId?: string | null;
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

export default function Bestiary({ storyId, ensureStory, initialEntityId }: Props) {
  const [entries, setEntries] = useState<BestiaryEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialEntityId ?? null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (storyId) {
      api.bestiary.list(storyId).then((list) => {
        setEntries(list);
        if (initialEntityId && list.some(b => b.id === initialEntityId)) {
          setSelectedId(initialEntityId);
        } else if (!selectedId && list.length > 0) {
          setSelectedId(list[0].id);
        }
      }).catch(console.error);
    }
  }, [storyId, initialEntityId]);

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

  const [sharedCatalog, setSharedCatalog] = useState<any[]>([]);
  const [showAdoptModal, setShowAdoptModal] = useState(false);

  useEffect(() => {
    api.bestiary.listShared().then(setSharedCatalog).catch(console.error);
  }, []);

  const adoptCreature = async (sharedId: string, isVariant = false) => {
    try {
      const id = await ensureStory();
      const adopted = await api.bestiary.adoptShared({
        projectId: id,
        sharedBestiaryId: sharedId,
        isVariant,
      });
      setEntries(prev => [...prev, adopted]);
      setSelectedId(adopted.id);
      setShowAdoptModal(false);
    } catch (err) {
      console.error('Failed to adopt creature:', err);
      alert('Failed to adopt creature: ' + (err as Error).message);
    }
  };

  return (
    <div className="bestiary">
      <div className="bestiary-sidebar">
        <div className="sidebar-header" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'stretch' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>Bestiary</h3>
            <button onClick={addEntry} className="add-button">+ New</button>
          </div>
          <button
            onClick={() => setShowAdoptModal(true)}
            style={{
              background: '#1e293b',
              border: '1px solid #38bdf8',
              color: '#38bdf8',
              borderRadius: '4px',
              padding: '0.25rem 0.5rem',
              fontSize: '0.75rem',
              cursor: 'pointer',
            }}
          >
            🌐 Adopt Shared Creature
          </button>
        </div>

        {/* Adopt modal / drawer */}
        {showAdoptModal && (
          <div style={{
            background: '#0f172a',
            border: '1px solid #38bdf8',
            borderRadius: '6px',
            padding: '0.75rem',
            margin: '0.5rem',
            maxHeight: '220px',
            overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#38bdf8' }}>Shared Catalog</span>
              <button onClick={() => setShowAdoptModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>✕</button>
            </div>
            {sharedCatalog.length === 0 ? (
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>No shared creatures found.</div>
            ) : (
              sharedCatalog.map((c) => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.3rem 0', borderBottom: '1px solid #1e293b' }}>
                  <div style={{ fontSize: '0.8rem', color: '#f1f5f9' }}>
                    <strong>{c.name}</strong> <span style={{ color: '#94a3b8', fontSize: '0.7rem' }}>({c.category})</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button
                      onClick={() => adoptCreature(c.id, false)}
                      style={{ background: '#0284c7', color: 'white', border: 'none', borderRadius: '3px', fontSize: '0.7rem', padding: '0.15rem 0.35rem', cursor: 'pointer' }}
                    >
                      Adopt
                    </button>
                    <button
                      onClick={() => adoptCreature(c.id, true)}
                      style={{ background: '#7c3aed', color: 'white', border: 'none', borderRadius: '3px', fontSize: '0.7rem', padding: '0.15rem 0.35rem', cursor: 'pointer' }}
                      title="Adopt as project variant"
                    >
                      Variant
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

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
                    <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', marginTop: '2px' }}>
                      {entry.isSharedVariant ? (
                        <span style={{ fontSize: '0.65rem', background: '#7c3aed', color: 'white', padding: '0 0.3rem', borderRadius: '3px' }}>Variant</span>
                      ) : entry.sharedBestiaryId ? (
                        <span style={{ fontSize: '0.65rem', background: '#0284c7', color: 'white', padding: '0 0.3rem', borderRadius: '3px' }}>Shared</span>
                      ) : (
                        <span style={{ fontSize: '0.65rem', background: '#475569', color: '#cbd5e1', padding: '0 0.3rem', borderRadius: '3px' }}>Local</span>
                      )}
                      {entry.hearts != null && (
                        <span className="bestiary-hearts" style={{ fontSize: '0.7rem' }}><FontAwesomeIcon icon={faHeart} /> {entry.hearts}</span>
                      )}
                    </div>
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
