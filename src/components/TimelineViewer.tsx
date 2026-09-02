import React, { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '../api';
import type { TimelineEvent } from '../types/story';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faTimeline,
  faPlus,
  faSearch,
  faShieldHalved,
  faLock,
  faUnlock,
  faPen,
  faTrash,
  faCalendarDays,
  faSpinner,
  faXmark,
  faCheck,
} from '@fortawesome/free-solid-svg-icons';
import './TimelineViewer.css';

interface Props {
  storyId: string | null;
  initialEntityId?: string | null;
  onSelectTab?: (tab: string, entityId?: string) => void;
}

export default function TimelineViewer({ storyId, initialEntityId }: Props) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedId, setHighlightedId] = useState<string | null>(initialEntityId || null);

  // Edit / Create Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Partial<TimelineEvent> | null>(null);
  const [saving, setSaving] = useState(false);

  const eventRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!storyId) {
      setEvents([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    api.timelineEvents
      .list(storyId)
      .then((data) => {
        setEvents(data);
        setError(null);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load timeline events');
      })
      .finally(() => setLoading(false));
  }, [storyId]);

  useEffect(() => {
    if (initialEntityId) {
      setHighlightedId(initialEntityId);
      const el = eventRefs.current[initialEntityId];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [initialEntityId, events]);

  const filteredEvents = useMemo(() => {
    if (!searchQuery.trim()) return events;
    const q = searchQuery.toLowerCase();
    return events.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        (e.date && e.date.toLowerCase().includes(q)) ||
        (e.description && e.description.toLowerCase().includes(q))
    );
  }, [events, searchQuery]);

  const handleToggleProtection = async (event: TimelineEvent) => {
    try {
      const nextProtected = !event.isProtected;
      const updated = await api.timelineEvents.setProtection(event.id, nextProtected);
      setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    } catch (err: any) {
      alert(`Protection error: ${err.message || err}`);
    }
  };

  const handleDelete = async (event: TimelineEvent) => {
    if (event.isProtected) {
      alert('This historical event is protected by canon policy and cannot be deleted.');
      return;
    }
    if (!window.confirm(`Are you sure you want to delete the event "${event.title}"?`)) {
      return;
    }
    try {
      await api.timelineEvents.delete(event.id);
      setEvents((prev) => prev.filter((e) => e.id !== event.id));
    } catch (err: any) {
      alert(`Delete error: ${err.message || err}`);
    }
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storyId || !editingEvent || !editingEvent.title?.trim()) return;

    setSaving(true);
    try {
      if (editingEvent.id) {
        const updated = await api.timelineEvents.update(editingEvent.id, {
          title: editingEvent.title.trim(),
          date: editingEvent.date?.trim() || '',
          description: editingEvent.description?.trim() || '',
          isProtected: editingEvent.isProtected,
        });
        setEvents((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      } else {
        const created = await api.timelineEvents.create({
          projectId: storyId,
          title: editingEvent.title.trim(),
          date: editingEvent.date?.trim() || '',
          description: editingEvent.description?.trim() || '',
          isProtected: Boolean(editingEvent.isProtected),
        });
        setEvents((prev) => [...prev, created]);
        setHighlightedId(created.id);
      }
      setIsModalOpen(false);
      setEditingEvent(null);
    } catch (err: any) {
      alert(`Save error: ${err.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  if (!storyId) {
    return (
      <div className="timeline-viewer-container">
        <div className="timeline-empty-prompt">Select a universe project to view its chronology.</div>
      </div>
    );
  }

  return (
    <div className="timeline-viewer-container">
      <header className="timeline-viewer-header">
        <div className="header-titles">
          <h2>
            <FontAwesomeIcon icon={faTimeline} className="header-icon" />
            History &amp; Chronology
          </h2>
          <p className="header-subtitle">
            Chronological turning points, historical crises, causal sequences, and canonical eras of the universe.
          </p>
        </div>
        <div className="header-actions">
          <div className="timeline-search-box">
            <FontAwesomeIcon icon={faSearch} className="search-icon" />
            <input
              type="text"
              placeholder="Search historical events..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="clear-search-btn" onClick={() => setSearchQuery('')}>
                <FontAwesomeIcon icon={faXmark} />
              </button>
            )}
          </div>
          <button
            className="btn-primary add-event-btn"
            onClick={() => {
              setEditingEvent({ title: '', date: '', description: '', isProtected: false });
              setIsModalOpen(true);
            }}
          >
            <FontAwesomeIcon icon={faPlus} /> New Historical Event
          </button>
        </div>
      </header>

      {error && <div className="timeline-error-alert">{error}</div>}

      {loading ? (
        <div className="timeline-loading-state">
          <FontAwesomeIcon icon={faSpinner} spin className="spinner-icon" />
          <p>Loading historical records...</p>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="timeline-empty-card">
          <div className="empty-ornament">⏳</div>
          <h3>{searchQuery ? 'No Matching Events Found' : 'Chronology Awaiting Composition'}</h3>
          <p>
            {searchQuery
              ? `No historical events matched "${searchQuery}". Try a different search term.`
              : 'This universe has no recorded timeline events yet. Add historical turning points or run an autonomous lore cycle to generate a macro history.'}
          </p>
          {!searchQuery && (
            <button
              className="btn-primary"
              onClick={() => {
                setEditingEvent({ title: '', date: '', description: '', isProtected: false });
                setIsModalOpen(true);
              }}
            >
              <FontAwesomeIcon icon={faPlus} /> Record First Event
            </button>
          )}
        </div>
      ) : (
        <div className="chronology-stream">
          <div className="stream-spine" />
          {filteredEvents.map((evt, idx) => {
            const isHighlighted = highlightedId === evt.id;
            return (
              <div
                key={evt.id}
                ref={(el) => {
                  eventRefs.current[evt.id] = el;
                }}
                className={`stream-event-item ${isHighlighted ? 'highlighted-event' : ''}`}
                id={`event-${evt.id}`}
              >
                <div className="event-marker">
                  <span className="marker-index">{idx + 1}</span>
                </div>
                <div className="event-card">
                  <div className="event-card-header">
                    <div className="event-title-meta">
                      <div className="event-era-pill">
                        <FontAwesomeIcon icon={faCalendarDays} className="pill-icon" />
                        <span>{evt.date || 'Era / Turn'}</span>
                      </div>
                      <h3 className="event-title">{evt.title}</h3>
                    </div>
                    <div className="event-actions">
                      <button
                        className={`protection-toggle-btn ${evt.isProtected ? 'protected' : 'unprotected'}`}
                        onClick={() => handleToggleProtection(evt)}
                        title={evt.isProtected ? 'Canon Protected (Locked from mutation)' : 'Unprotected (Click to lock into Canon)'}
                      >
                        <FontAwesomeIcon icon={evt.isProtected ? faLock : faUnlock} />
                        <span>{evt.isProtected ? 'Canon Protected' : 'Mutable'}</span>
                      </button>
                      <button
                        className="event-action-btn edit-btn"
                        onClick={() => {
                          setEditingEvent(evt);
                          setIsModalOpen(true);
                        }}
                        title="Edit Event"
                      >
                        <FontAwesomeIcon icon={faPen} />
                      </button>
                      <button
                        className="event-action-btn delete-btn"
                        onClick={() => handleDelete(evt)}
                        title={evt.isProtected ? 'Cannot delete protected event' : 'Delete Event'}
                        disabled={evt.isProtected}
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </div>
                  </div>

                  <div className="event-card-body">
                    {evt.description ? (
                      <p className="event-description">{evt.description}</p>
                    ) : (
                      <p className="event-description empty-desc">No narrative description recorded for this event.</p>
                    )}
                  </div>

                  <div className="event-card-footer">
                    <span className="event-id-tag">ID: {evt.id}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal for Create / Edit */}
      {isModalOpen && editingEvent && (
        <div className="modal-backdrop" onClick={() => !saving && setIsModalOpen(false)}>
          <div className="timeline-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingEvent.id ? 'Edit Historical Event' : 'Record New Historical Event'}</h3>
              <button
                className="modal-close-btn"
                onClick={() => setIsModalOpen(false)}
                disabled={saving}
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>
            <form onSubmit={handleSaveModal}>
              <div className="modal-body">
                <div className="form-group">
                  <label htmlFor="evt-title">Event Title *</label>
                  <input
                    id="evt-title"
                    type="text"
                    required
                    placeholder="e.g. The Glassing of Oakhaven Prime"
                    value={editingEvent.title || ''}
                    onChange={(e) => setEditingEvent({ ...editingEvent, title: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="evt-date">In-World Era / Date</label>
                  <input
                    id="evt-date"
                    type="text"
                    placeholder="e.g. Year 140 of the Corporate War / Age of Tides"
                    value={editingEvent.date || ''}
                    onChange={(e) => setEditingEvent({ ...editingEvent, date: e.target.value })}
                  />
                  <span className="form-hint">Use campaign-appropriate in-world calendar names or turning-point markers.</span>
                </div>

                <div className="form-group">
                  <label htmlFor="evt-desc">Historical Narrative &amp; Consequences</label>
                  <textarea
                    id="evt-desc"
                    rows={5}
                    placeholder="Describe what occurred, who was affected, and the lasting fallout across factions and world regions..."
                    value={editingEvent.description || ''}
                    onChange={(e) => setEditingEvent({ ...editingEvent, description: e.target.value })}
                  />
                </div>

                <div className="form-group-checkbox">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={Boolean(editingEvent.isProtected)}
                      onChange={(e) => setEditingEvent({ ...editingEvent, isProtected: e.target.checked })}
                    />
                    <span>
                      <FontAwesomeIcon icon={faShieldHalved} style={{ marginRight: 6, color: '#eab308' }} />
                      Lock as Protected Canon (prevents accidental model mutation or deletion)
                    </span>
                  </label>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsModalOpen(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? (
                    <>
                      <FontAwesomeIcon icon={faSpinner} spin /> Saving...
                    </>
                  ) : (
                    <>
                      <FontAwesomeIcon icon={faCheck} /> {editingEvent.id ? 'Update Event' : 'Save Event'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
