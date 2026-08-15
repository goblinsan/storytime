import React, { useState, useEffect, useCallback } from 'react';
import type { MapNode, MapConnections, Character } from '../types/story';
import { MAP_LEVEL_NAMES } from '../types/story';
import { api } from '../api';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faChevronUp, faChevronDown, faExpand, faXmark, faLocationDot,
} from '@fortawesome/free-solid-svg-icons';
import './WorldMapGrid.css';

// ── Portrait map (same as PartyManager) ────────────────────────────────
const PORTRAIT_IMG: Record<string, string> = {
  'Rogue (Guide)':       '/rogue.jpg',
  'Dwarf':               '/dwarf.jpg',
  'Butterfly Princess':  '/princess.jpg',
  'Cyborg-Necromancer':  '/necro-cyborg.jpg',
};

// ── Types ───────────────────────────────────────────────────────────────
interface BreadcrumbEntry {
  id: string | null;
  name: string;
  cols: number;
  rows: number;
  mapImage: string;
}

const DIRS: Array<{ key: keyof MapConnections; label: string }> = [
  { key: 'n',    label: 'North ↑' },
  { key: 's',    label: 'South ↓' },
  { key: 'e',    label: 'East →'  },
  { key: 'w',    label: 'West ←'  },
  { key: 'up',   label: 'Up ⬆'   },
  { key: 'down', label: 'Down ⬇' },
];

interface Props {
  storyId: string | null;
  ensureStory: () => Promise<string>;
}

// ── Component ───────────────────────────────────────────────────────────
export default function WorldMapGrid({ storyId, ensureStory }: Props) {
  const [nodes, setNodes] = useState<MapNode[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbEntry[]>([
    { id: null, name: 'World', cols: 6, rows: 4, mapImage: '/world-map.png' },
  ]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<MapNode> | null>(null);
  const [newPos, setNewPos] = useState<{ x: number; y: number } | null>(null);
  const [movingCharId, setMovingCharId] = useState<string | null>(null);

  const crumb = breadcrumb[breadcrumb.length - 1];

  // ── Data loading ──────────────────────────────────────────────────────
  const loadNodes = useCallback(() => {
    if (!storyId) return;
    const p = crumb.id === null
      ? api.locations.listRoot(storyId)
      : api.locations.listChildren(storyId, crumb.id);
    p.then(setNodes).catch(console.error);
  }, [storyId, crumb.id]);

  useEffect(() => { loadNodes(); }, [loadNodes]);

  useEffect(() => {
    if (storyId) api.characters.list(storyId).then(setCharacters).catch(console.error);
  }, [storyId]);

  // ── Helpers ───────────────────────────────────────────────────────────
  const nodeAt = (x: number, y: number) => nodes.find(n => n.gridX === x && n.gridY === y);
  const charsAt = (nodeId: string) => characters.filter(c => c.currentLocationId === nodeId);
  const selectedNode = nodes.find(n => n.id === selectedId) ?? null;

  // ── Navigation ────────────────────────────────────────────────────────
  const zoomIn = (node: MapNode) => {
    setBreadcrumb(prev => [...prev, {
      id: node.id,
      name: node.name,
      cols: node.cols || 6,
      rows: node.rows || 4,
      mapImage: node.mapImage || '',
    }]);
    setSelectedId(null);
    setDraft(null);
    setNewPos(null);
  };

  const zoomOut = (idx: number) => {
    if (idx >= breadcrumb.length - 1) return;
    setBreadcrumb(prev => prev.slice(0, idx + 1));
    setSelectedId(null);
    setDraft(null);
    setNewPos(null);
  };

  // ── Cell interaction ──────────────────────────────────────────────────
  const handleCellClick = async (x: number, y: number) => {
    const node = nodeAt(x, y);

    if (movingCharId) {
      if (node) {
        await api.characters.update(movingCharId, { currentLocationId: node.id } as Partial<Character>);
        setCharacters(prev =>
          prev.map(c => c.id === movingCharId ? { ...c, currentLocationId: node.id } : c)
        );
      }
      setMovingCharId(null);
      return;
    }

    if (node) {
      setSelectedId(node.id);
      setDraft({ ...node });
      setNewPos(null);
    } else {
      const id = storyId ?? await ensureStory();
      setSelectedId(null);
      setNewPos({ x, y });
      setDraft({
        storyId: id,
        parentId: crumb.id,
        name: '',
        description: '',
        level: (breadcrumb.length - 1) as MapNode['level'],
        gridX: x,
        gridY: y,
        cols: 6,
        rows: 4,
        mapImage: '',
        regionType: '',
        races: [],
        politicalNotes: '',
        connections: {},
      });
    }
  };

  // ── Save / Delete ─────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!draft || !storyId) return;
    try {
      if (selectedId) {
        const updated = await api.locations.update(selectedId, draft);
        setNodes(prev => prev.map(n => n.id === selectedId ? updated : n));
        // Update breadcrumb name if we renamed the current zoom target
        setBreadcrumb(prev => prev.map((b, i) =>
          i === breadcrumb.length - 1 && b.id === selectedId
            ? { ...b, name: updated.name, cols: updated.cols, rows: updated.rows, mapImage: updated.mapImage }
            : b
        ));
      } else {
        const created = await api.locations.create({ storyId, ...draft } as MapNode & { storyId: string });
        setNodes(prev => [...prev, created]);
        setSelectedId(created.id);
        setDraft({ ...created });
        setNewPos(null);
      }
    } catch (err) {
      console.error('Save failed:', err);
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    await api.locations.delete(selectedId);
    setNodes(prev => prev.filter(n => n.id !== selectedId));
    setSelectedId(null);
    setDraft(null);
  };

  const closePanel = () => {
    setSelectedId(null);
    setDraft(null);
    setNewPos(null);
  };

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="wmg-root">

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="wmg-header">
        <nav className="wmg-breadcrumb" aria-label="Map navigation">
          {breadcrumb.map((b, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span className="wmg-bc-sep" aria-hidden>›</span>}
              <button
                className={`wmg-bc-btn${i === breadcrumb.length - 1 ? ' active' : ''}`}
                onClick={() => zoomOut(i)}
                disabled={i === breadcrumb.length - 1}
              >
                {b.name || 'World'}
              </button>
            </React.Fragment>
          ))}
        </nav>
        <span className="wmg-level-badge">
          {MAP_LEVEL_NAMES[breadcrumb.length - 1] ?? `Level ${breadcrumb.length - 1}`}
        </span>
        {movingCharId && (
          <div className="wmg-move-banner">
            <FontAwesomeIcon icon={faLocationDot} />
            Moving <strong>{characters.find(c => c.id === movingCharId)?.name}</strong>
            — click a destination cell
            <button onClick={() => setMovingCharId(null)}>Cancel</button>
          </div>
        )}
      </div>

      {/* ── Body ──────────────────────────────────────────────────────── */}
      <div className="wmg-body">

        {/* Grid */}
        <div
          className="wmg-grid"
          style={{
            '--cols': crumb.cols,
            '--rows': crumb.rows,
            backgroundImage: crumb.mapImage ? `url(${crumb.mapImage})` : undefined,
          } as React.CSSProperties}
        >
          {Array.from({ length: crumb.rows }, (_, y) =>
            Array.from({ length: crumb.cols }, (_, x) => {
              const node = nodeAt(x, y);
              const chars = node ? charsAt(node.id) : [];
              const isSelected = node?.id === selectedId;
              const isNewHere = newPos?.x === x && newPos?.y === y;

              return (
                <div
                  key={`${x}-${y}`}
                  className={[
                    'wmg-cell',
                    node      ? 'wmg-cell-filled' : 'wmg-cell-empty',
                    isSelected  ? 'wmg-cell-selected'  : '',
                    isNewHere   ? 'wmg-cell-new'        : '',
                    movingCharId ? 'wmg-cell-move-mode' : '',
                  ].filter(Boolean).join(' ')}
                  style={{ gridColumn: x + 1, gridRow: y + 1 }}
                  onClick={() => handleCellClick(x, y)}
                  title={node ? node.name : `Add location at (${x}, ${y})`}
                >
                  {node ? (
                    <>
                      <div className="wmg-cell-name">{node.name}</div>
                      {node.regionType && (
                        <div className="wmg-cell-type">{node.regionType}</div>
                      )}

                      <div className="wmg-cell-footer">
                        {/* Character tokens */}
                        {chars.length > 0 && (
                          <div className="wmg-chars">
                            {chars.map(c => (
                              PORTRAIT_IMG[c.name]
                                ? <img
                                    key={c.id}
                                    src={PORTRAIT_IMG[c.name]}
                                    alt={c.name}
                                    title={c.name}
                                    className={`wmg-char-token${movingCharId === c.id ? ' moving' : ''}`}
                                    onClick={e => { e.stopPropagation(); setMovingCharId(c.id); }}
                                  />
                                : <span
                                    key={c.id}
                                    title={c.name}
                                    className={`wmg-char-initial${movingCharId === c.id ? ' moving' : ''}`}
                                    onClick={e => { e.stopPropagation(); setMovingCharId(c.id); }}
                                  >
                                    {c.name[0]}
                                  </span>
                            ))}
                          </div>
                        )}

                        {/* Icons */}
                        <div className="wmg-cell-icons">
                          {node.connections.up   && <FontAwesomeIcon icon={faChevronUp}   title="Up exit"   className="wmg-vert-icon" />}
                          {node.connections.down && <FontAwesomeIcon icon={faChevronDown} title="Down exit" className="wmg-vert-icon" />}
                          <button
                            className="wmg-zoom-btn"
                            title={`Zoom into ${node.name}`}
                            onClick={e => { e.stopPropagation(); zoomIn(node); }}
                          >
                            <FontAwesomeIcon icon={faExpand} />
                          </button>
                        </div>
                      </div>

                      {/* Edge connection indicators for non-adjacent explicit links */}
                      {node.connections.n && <span className="wmg-edge wmg-edge-n" />}
                      {node.connections.s && <span className="wmg-edge wmg-edge-s" />}
                      {node.connections.e && <span className="wmg-edge wmg-edge-e" />}
                      {node.connections.w && <span className="wmg-edge wmg-edge-w" />}
                    </>
                  ) : (
                    <div className="wmg-cell-add">+</div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* ── Side Panel ──────────────────────────────────────────────── */}
        {draft && (
          <div className="wmg-panel">
            <div className="wmg-panel-header">
              <h4>{selectedId ? 'Edit Location' : 'New Location'}</h4>
              <button className="wmg-panel-close" onClick={closePanel} title="Close">
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>

            <div className="form-group">
              <label>Name</label>
              <input
                type="text"
                placeholder="Location name"
                value={draft.name ?? ''}
                autoFocus
                onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
              />
            </div>

            <div className="form-group">
              <label>Description</label>
              <textarea
                placeholder="What's here? What makes it memorable?"
                value={draft.description ?? ''}
                onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Type</label>
                <input
                  type="text"
                  placeholder="forest, town, dungeon…"
                  value={draft.regionType ?? ''}
                  onChange={e => setDraft(d => ({ ...d, regionType: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Races / Factions</label>
                <input
                  type="text"
                  placeholder="Goblins, Dwarves…"
                  value={(draft.races ?? []).join(', ')}
                  onChange={e => setDraft(d => ({
                    ...d,
                    races: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                  }))}
                />
              </div>
            </div>

            <fieldset className="wmg-fieldset">
              <legend>Sub-grid (when zoomed in)</legend>
              <div className="form-row">
                <div className="form-group form-group-small">
                  <label>Cols</label>
                  <input
                    type="number" min="1" max="20"
                    value={draft.cols ?? 6}
                    onChange={e => setDraft(d => ({ ...d, cols: Number(e.target.value) }))}
                  />
                </div>
                <div className="form-group form-group-small">
                  <label>Rows</label>
                  <input
                    type="number" min="1" max="20"
                    value={draft.rows ?? 4}
                    onChange={e => setDraft(d => ({ ...d, rows: Number(e.target.value) }))}
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Background image path</label>
                <input
                  type="text"
                  placeholder="/region-map.png (leave blank for default)"
                  value={draft.mapImage ?? ''}
                  onChange={e => setDraft(d => ({ ...d, mapImage: e.target.value }))}
                />
              </div>
            </fieldset>

            <fieldset className="wmg-fieldset">
              <legend>Exits</legend>
              <div className="wmg-connections">
                {DIRS.map(({ key, label }) => (
                  <div key={key} className="wmg-conn-row">
                    <span className="wmg-conn-label">{label}</span>
                    <select
                      value={(draft.connections as MapConnections)?.[key] ?? ''}
                      onChange={e => setDraft(d => ({
                        ...d,
                        connections: {
                          ...d?.connections,
                          [key]: e.target.value || undefined,
                        },
                      }))}
                    >
                      <option value="">— none —</option>
                      {nodes
                        .filter(n => n.id !== selectedId)
                        .map(n => <option key={n.id} value={n.id}>{n.name}</option>)
                      }
                    </select>
                  </div>
                ))}
              </div>
            </fieldset>

            {/* Characters at this location */}
            {selectedNode && charsAt(selectedNode.id).length > 0 && (
              <fieldset className="wmg-fieldset">
                <legend>Characters here</legend>
                <div className="wmg-chars-list">
                  {charsAt(selectedNode.id).map(c => (
                    <div key={c.id} className="wmg-char-row">
                      {PORTRAIT_IMG[c.name]
                        ? <img src={PORTRAIT_IMG[c.name]} alt={c.name} className="wmg-panel-token" />
                        : <span className="wmg-panel-initial">{c.name[0]}</span>
                      }
                      <span className="wmg-char-name">{c.name}</span>
                      <button
                        className="wmg-move-char-btn"
                        onClick={() => { setMovingCharId(c.id); closePanel(); }}
                        title="Move this character"
                      >Move</button>
                    </div>
                  ))}
                </div>
              </fieldset>
            )}

            <div className="wmg-panel-actions">
              <button className="wmg-save-btn" onClick={handleSave}>
                {selectedId ? 'Save Changes' : 'Create Location'}
              </button>
              {selectedId && (
                <button className="wmg-delete-btn" onClick={handleDelete}>Delete</button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
