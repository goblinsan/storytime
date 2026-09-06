import { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '../api';
import type { MapNode } from '../types/story';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faMapLocationDot,
  faSun,
  faGlobe,
  faSatellite,
  faTriangleExclamation,
  faSearch,
  faRotateRight,
  faMap,
  faLock,
  faUnlock,
  faArrowLeft,
  faArrowRight,
} from '@fortawesome/free-solid-svg-icons';
import './LocationsViewer.css';

interface Props {
  storyId: string | null;
  initialEntityId?: string | null;
  onOpenMap?: (nodeId?: string) => void;
}

export default function LocationsViewer({ storyId, initialEntityId, onOpenMap }: Props) {
  const [locations, setLocations] = useState<MapNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialEntityId ?? null);
  const [filterQuery, setFilterQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLocations = useCallback(async () => {
    if (!storyId) {
      setLocations([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await api.locations.listAll(storyId);
      setLocations(data);
      setError(null);
      if (!selectedId && data.length > 0) {
        setSelectedId(initialEntityId || data[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load locations');
    } finally {
      setLoading(false);
    }
  }, [storyId, initialEntityId, selectedId]);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  useEffect(() => {
    if (initialEntityId) {
      setSelectedId(initialEntityId);
    }
  }, [initialEntityId]);

  const handleToggleProtection = async (loc: MapNode) => {
    try {
      const updated = await api.locations.setProtection(loc.id, !loc.isProtected);
      setLocations((prev) => prev.map((l) => (l.id === updated.id ? { ...l, isProtected: updated.isProtected } : l)));
    } catch (err: any) {
      alert(`Protection toggle failed: ${err.message || err}`);
    }
  };

  const filteredLocations = useMemo(() => {
    if (!filterQuery.trim()) return locations;
    const q = filterQuery.toLowerCase();
    return locations.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        (l.regionType && l.regionType.toLowerCase().includes(q)) ||
        (l.starClass && l.starClass.toLowerCase().includes(q)) ||
        (l.description && l.description.toLowerCase().includes(q))
    );
  }, [locations, filterQuery]);

  const selectedLoc = useMemo(() => {
    return locations.find((l) => l.id === selectedId) || null;
  }, [locations, selectedId]);

  // Find child bodies / stations
  const childLocations = useMemo(() => {
    if (!selectedLoc) return [];
    return locations.filter((l) => l.parentId === selectedLoc.id);
  }, [locations, selectedLoc]);

  // Find parent system
  const parentLocation = useMemo(() => {
    if (!selectedLoc || !selectedLoc.parentId) return null;
    return locations.find((l) => l.id === selectedLoc.parentId) || null;
  }, [locations, selectedLoc]);

  if (!storyId) {
    return (
      <div className="locations-viewer-container">
        <div className="empty-state-card">Select a universe project to view its star systems and places.</div>
      </div>
    );
  }

  return (
    <div className="locations-viewer-container">
      {/* Top Header */}
      <header className="locations-header">
        <div className="locations-title-meta">
          <h2>
            <FontAwesomeIcon icon={faMapLocationDot} className="header-icon" /> Places, Star Systems &amp; Worlds
          </h2>
          <p className="locations-subtitle">
            Charted star systems, orbital defense platforms, shattered planets, deep-space rift sectors, and geographic POIs.
          </p>
        </div>

        <div className="locations-actions">
          <div className="locations-search">
            <FontAwesomeIcon icon={faSearch} className="search-icon" />
            <input
              type="text"
              placeholder="Search star systems &amp; places..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
            />
          </div>

          <button
            className="action-btn"
            onClick={fetchLocations}
            title="Reload locations from database"
            disabled={loading}
          >
            <FontAwesomeIcon icon={faRotateRight} spin={loading} />
            <span>Refresh</span>
          </button>

          {onOpenMap && (
            <button
              className="action-btn map-btn"
              onClick={() => onOpenMap(selectedId ?? undefined)}
              title="Open Hex Map Canvas"
            >
              <FontAwesomeIcon icon={faMap} />
              <span>Map Canvas</span>
            </button>
          )}
        </div>
      </header>

      {error && <div className="locations-error-alert">{error}</div>}

      {/* Main Two-Pane Layout */}
      <div className="locations-layout">
        {/* Left Sidebar */}
        <div className="locations-sidebar">
          <div className="sidebar-count-bar">
            <span>Locations &amp; Systems ({filteredLocations.length})</span>
          </div>

          <div className="locations-list">
            {loading && locations.length === 0 ? (
              <div className="empty-state-muted">Loading locations...</div>
            ) : filteredLocations.length === 0 ? (
              <div className="empty-state-muted">
                {filterQuery ? 'No locations match your search.' : 'No locations registered yet.'}
              </div>
            ) : (
              filteredLocations.map((loc) => {
                const childCount = locations.filter((l) => l.parentId === loc.id).length;
                return (
                  <div
                    key={loc.id}
                    className={`location-list-item ${selectedId === loc.id ? 'active' : ''}`}
                    onClick={() => setSelectedId(loc.id)}
                  >
                    <div className="location-item-top">
                      <span className="location-item-name">{loc.name}</span>
                      {loc.starClass && (
                        <span className="location-badge star-badge">
                          <FontAwesomeIcon icon={faSun} /> {loc.starClass}
                        </span>
                      )}
                    </div>

                    <div className="location-item-type">
                      {loc.regionType || (loc.parentId ? 'Celestial Body' : 'Star System / Region')}
                      {childCount > 0 && <span className="child-count-pill">• {childCount} bodies/stations</span>}
                    </div>

                    <div className="location-item-preview">
                      {loc.description ? loc.description.slice(0, 65) + '...' : 'No narrative description recorded'}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Detail Pane */}
        <div className="location-detail-pane">
          {selectedLoc ? (
            <div className="location-detail-content">
              {/* Detail Top Header */}
              <div className="detail-header-card">
                <div className="detail-title-row">
                  <div>
                    {parentLocation && (
                      <button
                        className="parent-back-btn"
                        onClick={() => setSelectedId(parentLocation.id)}
                        title={`Return to ${parentLocation.name}`}
                      >
                        <FontAwesomeIcon icon={faArrowLeft} /> Part of {parentLocation.name}
                      </button>
                    )}
                    <h3 className="location-title">{selectedLoc.name}</h3>
                  </div>

                  <div className="detail-actions-row">
                    <button
                      className={`protection-toggle-btn ${selectedLoc.isProtected ? 'protected' : 'unprotected'}`}
                      onClick={() => handleToggleProtection(selectedLoc)}
                      title={selectedLoc.isProtected ? 'Click to unprotect location' : 'Click to protect location'}
                    >
                      <FontAwesomeIcon icon={selectedLoc.isProtected ? faLock : faUnlock} />
                      <span>{selectedLoc.isProtected ? 'Canon Protected' : 'Mutable'}</span>
                    </button>
                  </div>
                </div>

                {/* Metadata Badges Bar */}
                <div className="location-pills-bar">
                  {selectedLoc.regionType && (
                    <span className="meta-pill region-pill">
                      <FontAwesomeIcon icon={faGlobe} /> {selectedLoc.regionType.replace('_', ' ')}
                    </span>
                  )}
                  {selectedLoc.starClass && (
                    <span className="meta-pill star-pill">
                      <FontAwesomeIcon icon={faSun} /> {selectedLoc.starClass}
                    </span>
                  )}
                  {selectedLoc.hazardTier && (
                    <span className="meta-pill hazard-pill">
                      <FontAwesomeIcon icon={faTriangleExclamation} /> Hazard: {selectedLoc.hazardTier}
                    </span>
                  )}
                  {selectedLoc.celestialType && selectedLoc.celestialType !== selectedLoc.regionType && (
                    <span className="meta-pill celestial-pill">
                      <FontAwesomeIcon icon={faSatellite} /> {selectedLoc.celestialType.replace('_', ' ')}
                    </span>
                  )}
                  <span className="meta-pill id-pill">ID: {selectedLoc.id}</span>
                </div>
              </div>

              {/* Description & Narrative */}
              <div className="detail-section">
                <label className="section-label">Geographic &amp; Astrophysical Overview</label>
                <div className="location-narrative-box">
                  {selectedLoc.description || 'No detailed astrophysical narrative recorded yet for this location.'}
                </div>
              </div>

              {/* Political Notes / Controlling Factions */}
              {selectedLoc.politicalNotes && (
                <div className="detail-section">
                  <label className="section-label">Political Affiliation &amp; Concessions</label>
                  <div className="location-political-box">
                    {selectedLoc.politicalNotes}
                  </div>
                </div>
              )}

              {/* Sub-Locations & Orbiting Bodies */}
              {childLocations.length > 0 && (
                <div className="detail-section child-bodies-section">
                  <label className="section-label">
                    Orbiting Celestial Bodies &amp; Stations ({childLocations.length})
                  </label>
                  <div className="child-bodies-grid">
                    {childLocations.map((child) => (
                      <div
                        key={child.id}
                        className="child-body-card interactive"
                        onClick={() => setSelectedId(child.id)}
                      >
                        <div className="child-body-top">
                          <strong>{child.name}</strong>
                          <span className="child-type-tag">
                            {child.regionType || child.celestialType || 'Station / Body'}
                          </span>
                        </div>
                        <p className="child-body-summary">
                          {child.description ? child.description.slice(0, 100) + '...' : 'No description'}
                        </p>
                        <div className="child-body-footer">
                          <span>Inspect Body <FontAwesomeIcon icon={faArrowRight} /></span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="empty-detail-placeholder">
              Select a star system or location from the directory to inspect its astrophysical details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
