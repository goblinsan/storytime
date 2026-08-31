import { useState, useEffect, useCallback, useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCheck,
  faXmark,
  faClock,
  faTriangleExclamation,
  faCopy,
  faDownload,
  faArrowLeft,
  faSpinner,
  faUsers,
  faMap,
  faRoute,
  faGlobe,
  faShieldHalved,
  faFileCode,
  faRotateRight,
} from '@fortawesome/free-solid-svg-icons';
import { api, toDndArtifact } from '../api';
import type { GeneratedDraft, GeneratedDraftStatus, Story } from '../api';
import './GeneratedDraftReview.css';

interface Props {
  initialDraftId?: string | null;
  storyId?: string | null;
  onSelectDraftId?: (id: string | null) => void;
}

export default function GeneratedDraftReview({
  initialDraftId = null,
  storyId = null,
  onSelectDraftId,
}: Props) {
  const [drafts, setDrafts] = useState<GeneratedDraft[]>([]);
  const [projects, setProjects] = useState<Story[]>([]);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(initialDraftId);
  const [selectedDraft, setSelectedDraft] = useState<GeneratedDraft | null>(null);

  const [statusFilter, setStatusFilter] = useState<GeneratedDraftStatus | 'all'>('all');
  const [projectFilter, setProjectFilter] = useState<string>(storyId || 'all');

  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [showUnreviewedPreview, setShowUnreviewedPreview] = useState(false);

  // Sync initialDraftId from props
  useEffect(() => {
    if (initialDraftId !== undefined) {
      setSelectedDraftId(initialDraftId);
    }
  }, [initialDraftId]);

  // Sync storyId from props if provided
  useEffect(() => {
    if (storyId) {
      setProjectFilter(storyId);
    }
  }, [storyId]);

  // Load project options for the filter
  useEffect(() => {
    api.stories.list()
      .then(setProjects)
      .catch((err) => console.error('Failed to load projects for draft review filter:', err));
  }, []);

  // Fetch drafts list
  const loadDrafts = useCallback(async () => {
    setLoadingList(true);
    try {
      const params: { projectId?: string; status?: GeneratedDraftStatus } = {};
      if (projectFilter !== 'all') params.projectId = projectFilter;
      if (statusFilter !== 'all') params.status = statusFilter;

      const list = await api.generatedDrafts.list(params);
      setDrafts(list);
    } catch (err) {
      console.error('Failed to load drafts:', err);
    } finally {
      setLoadingList(false);
    }
  }, [projectFilter, statusFilter]);

  useEffect(() => {
    loadDrafts();
  }, [loadDrafts]);

  // Fetch draft detail when selectedDraftId changes
  useEffect(() => {
    if (!selectedDraftId) {
      setSelectedDraft(null);
      return;
    }
    setLoadingDetail(true);
    api.generatedDrafts.get(selectedDraftId)
      .then((data) => {
        setSelectedDraft(data);
      })
      .catch((err) => {
        console.error('Failed to load draft detail:', err);
      })
      .finally(() => {
        setLoadingDetail(false);
      });
  }, [selectedDraftId]);

  const handleSelectDraft = (id: string | null) => {
    setSelectedDraftId(id);
    if (onSelectDraftId) {
      onSelectDraftId(id);
    }
  };

  const handleStatusChange = async (newStatus: GeneratedDraftStatus) => {
    if (!selectedDraft) return;
    setUpdatingStatus(true);
    try {
      const updated = await api.generatedDrafts.updateStatus(selectedDraft.id, newStatus);
      setSelectedDraft(updated);
      setDrafts((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
    } catch (err) {
      console.error('Failed to update draft status:', err);
      alert('Failed to update draft status. Please try again.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const projectMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects) {
      map.set(p.id, p.title || 'Untitled Project');
    }
    return map;
  }, [projects]);

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback(`${label} copied!`);
      setTimeout(() => setCopyFeedback(null), 3000);
    } catch (err) {
      console.error('Copy to clipboard failed:', err);
      setCopyFeedback('Failed to copy');
      setTimeout(() => setCopyFeedback(null), 3000);
    }
  };

  const handleDownload = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Render detail view if a draft is selected
  if (selectedDraftId) {
    if (loadingDetail) {
      return (
        <div className="draft-review-container">
          <div className="draft-loading">
            <FontAwesomeIcon icon={faSpinner} spin size="2x" />
            <p>Loading draft details...</p>
          </div>
        </div>
      );
    }

    if (!selectedDraft) {
      return (
        <div className="draft-review-container">
          <button className="draft-back-btn" onClick={() => handleSelectDraft(null)}>
            <FontAwesomeIcon icon={faArrowLeft} /> Back to Drafts List
          </button>
          <div className="draft-empty-state">
            <p>Draft not found or could not be loaded.</p>
          </div>
        </div>
      );
    }

    const payload = selectedDraft.payload ?? {};
    const worldBrief = payload.worldBrief;
    const characters = payload.characters ?? [];
    const factions = payload.factions ?? [];
    const locations = payload.locations ?? [];
    const timelineEvents = payload.timelineEvents ?? [];
    const gateResult = selectedDraft.gateResult;
    const isAccepted = selectedDraft.status === 'accepted';
    const isGenerated = selectedDraft.status === 'generated';
    const isRejected = selectedDraft.status === 'rejected';

    const dndArtifact = toDndArtifact(selectedDraft);
    const dndArtifactJson = JSON.stringify(dndArtifact, null, 2);
    const payloadJson = JSON.stringify(payload, null, 2);

    return (
      <div className="draft-review-container">
        <div className="draft-detail-header">
          <button className="draft-back-btn" onClick={() => handleSelectDraft(null)}>
            <FontAwesomeIcon icon={faArrowLeft} /> Back to Drafts List
          </button>

          <div className="draft-actions">
            {isGenerated && (
              <>
                <button
                  className="draft-action-btn accept-btn"
                  onClick={() => handleStatusChange('accepted')}
                  disabled={updatingStatus}
                >
                  <FontAwesomeIcon icon={updatingStatus ? faSpinner : faCheck} spin={updatingStatus} /> Accept Draft
                </button>
                <button
                  className="draft-action-btn reject-btn"
                  onClick={() => handleStatusChange('rejected')}
                  disabled={updatingStatus}
                >
                  <FontAwesomeIcon icon={faXmark} /> Reject Draft
                </button>
              </>
            )}
            {isAccepted && (
              <>
                <span className="status-pill status-accepted">
                  <FontAwesomeIcon icon={faCheck} /> Accepted
                </span>
                <button
                  className="draft-action-btn neutral-btn"
                  onClick={() => handleStatusChange('generated')}
                  disabled={updatingStatus}
                  title="Mark as unreviewed draft"
                >
                  <FontAwesomeIcon icon={faRotateRight} /> Mark Unreviewed
                </button>
                <button
                  className="draft-action-btn reject-btn"
                  onClick={() => handleStatusChange('rejected')}
                  disabled={updatingStatus}
                >
                  <FontAwesomeIcon icon={faXmark} /> Reject
                </button>
              </>
            )}
            {isRejected && (
              <>
                <span className="status-pill status-rejected">
                  <FontAwesomeIcon icon={faXmark} /> Rejected
                </span>
                <button
                  className="draft-action-btn accept-btn"
                  onClick={() => handleStatusChange('accepted')}
                  disabled={updatingStatus}
                >
                  <FontAwesomeIcon icon={faCheck} /> Re-accept Draft
                </button>
                <button
                  className="draft-action-btn neutral-btn"
                  onClick={() => handleStatusChange('generated')}
                  disabled={updatingStatus}
                >
                  <FontAwesomeIcon icon={faRotateRight} /> Re-open Draft
                </button>
              </>
            )}
          </div>
        </div>

        {/* Status Callout Banner */}
        {isGenerated && (
          <div className="draft-status-banner banner-generated">
            <div className="banner-icon">
              <FontAwesomeIcon icon={faTriangleExclamation} />
            </div>
            <div className="banner-content">
              <strong>UNREVIEWED DRAFT</strong>
              <p>
                Generated by local LLM and pending operator review. D&amp;D Campaign Table rejects unaccepted
                artifacts. Review the draft below and click <em>Accept Draft</em> when ready.
              </p>
            </div>
          </div>
        )}
        {isAccepted && (
          <div className="draft-status-banner banner-accepted">
            <div className="banner-icon">
              <FontAwesomeIcon icon={faCheck} />
            </div>
            <div className="banner-content">
              <strong>ACCEPTED ARTIFACT</strong>
              <p>
                This draft has been reviewed and accepted. It is ready for D&amp;D Campaign Table import using the export shape below.
              </p>
            </div>
          </div>
        )}
        {isRejected && (
          <div className="draft-status-banner banner-rejected">
            <div className="banner-icon">
              <FontAwesomeIcon icon={faXmark} />
            </div>
            <div className="banner-content">
              <strong>REJECTED DRAFT</strong>
              <p>
                This draft was rejected during operator review or gate validation. It will not be synced to D&amp;D Campaign Table.
              </p>
            </div>
          </div>
        )}

        {/* Provenance & Consistency Gate Row */}
        <div className="draft-meta-grid">
          <div className="meta-card">
            <h3>Provenance &amp; Metadata</h3>
            <div className="meta-row">
              <span className="meta-label">Draft ID:</span>
              <code className="meta-value">{selectedDraft.id}</code>
            </div>
            <div className="meta-row">
              <span className="meta-label">Project:</span>
              <span className="meta-value">
                {projectMap.get(selectedDraft.projectId) || selectedDraft.projectId}
              </span>
            </div>
            <div className="meta-row">
              <span className="meta-label">Dashboard Task:</span>
              <span className="meta-badge-task">
                Task #{selectedDraft.dashboardTaskId || 'N/A'} (Project #{selectedDraft.dashboardProjectId || 'N/A'})
              </span>
            </div>
            <div className="meta-row">
              <span className="meta-label">Model / Provider:</span>
              <span className="meta-value">
                {selectedDraft.modelProvider || 'unknown'} / {selectedDraft.modelName || 'unknown'}
              </span>
            </div>
            <div className="meta-row">
              <span className="meta-label">Created At:</span>
              <span className="meta-value">{new Date(selectedDraft.createdAt).toLocaleString()}</span>
            </div>
            {selectedDraft.promptFingerprint && (
              <div className="meta-row">
                <span className="meta-label">Prompt Fingerprint:</span>
                <code className="meta-value" title={selectedDraft.promptFingerprint}>
                  {selectedDraft.promptFingerprint.substring(0, 16)}...
                </code>
              </div>
            )}
          </div>

          <div className="meta-card">
            <h3>Consistency Gate Result</h3>
            {gateResult ? (
              <>
                <div className="meta-row">
                  <span className="meta-label">Status:</span>
                  {gateResult.ok ? (
                    <span className="gate-pill gate-ok">
                      <FontAwesomeIcon icon={faCheck} /> Gate Passed
                    </span>
                  ) : (
                    <span className="gate-pill gate-fail">
                      <FontAwesomeIcon icon={faTriangleExclamation} /> Gate Failed
                    </span>
                  )}
                </div>
                {gateResult.violations && gateResult.violations.length > 0 ? (
                  <div className="gate-violations">
                    <p className="violations-title">Violations ({gateResult.violations.length}):</p>
                    <ul className="violations-list">
                      {gateResult.violations.map((v, i) => (
                        <li key={i} className="violation-item">
                          <code>{v.path}</code>: {v.message}
                          {v.code && <span className="violation-code">[{v.code}]</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="gate-clean-note">
                    All top-level keys, schema constraints, and entity references passed deterministic validation.
                  </p>
                )}
              </>
            ) : (
              <p className="meta-value">No gate result recorded.</p>
            )}
          </div>
        </div>

        {/* World Brief */}
        <div className="draft-section">
          <div className="section-heading">
            <FontAwesomeIcon icon={faGlobe} />
            <h2>World Brief</h2>
          </div>
          {worldBrief ? (
            <div className="world-brief-card">
              <h3 className="world-name">{worldBrief.name || 'Untitled World'}</h3>
              {worldBrief.summary && <p className="world-summary">{worldBrief.summary}</p>}
              {worldBrief.themes && worldBrief.themes.length > 0 && (
                <div className="tags-row">
                  <span className="tags-label">Themes:</span>
                  {worldBrief.themes.map((theme, i) => (
                    <span key={i} className="theme-tag">{theme}</span>
                  ))}
                </div>
              )}
              {worldBrief.openQuestions && worldBrief.openQuestions.length > 0 && (
                <div className="questions-block">
                  <span className="questions-label">Open Questions:</span>
                  <ul className="questions-list">
                    {worldBrief.openQuestions.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p className="section-empty">No world brief included in payload.</p>
          )}
        </div>

        {/* Characters */}
        <div className="draft-section">
          <div className="section-heading">
            <FontAwesomeIcon icon={faUsers} />
            <h2>Characters ({characters.length})</h2>
          </div>
          {characters.length === 0 ? (
            <p className="section-empty">No characters in draft.</p>
          ) : (
            <div className="entity-cards-grid">
              {characters.map((char, index) => (
                <div key={char.id || index} className="entity-card">
                  <div className="entity-header">
                    <h4>{char.name || `Character ${index + 1}`}</h4>
                    {char.id && <code className="entity-id">{char.id}</code>}
                  </div>
                  {char.role && <p className="entity-role"><strong>Role:</strong> {char.role}</p>}
                  {char.motivation && (
                    <p className="entity-motivation"><strong>Motivation:</strong> {char.motivation}</p>
                  )}
                  {char.summary && <p className="entity-summary">{char.summary}</p>}
                  <div className="entity-meta">
                    {char.locationId && (
                      <span className="entity-chip">📍 Location: {char.locationId}</span>
                    )}
                    {char.factionIds && char.factionIds.length > 0 && (
                      <span className="entity-chip">🛡️ Factions: {char.factionIds.join(', ')}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Factions */}
        <div className="draft-section">
          <div className="section-heading">
            <FontAwesomeIcon icon={faShieldHalved} />
            <h2>Factions ({factions.length})</h2>
          </div>
          {factions.length === 0 ? (
            <p className="section-empty">No factions in draft.</p>
          ) : (
            <div className="entity-cards-grid">
              {factions.map((faction, index) => (
                <div key={faction.id || index} className="entity-card">
                  <div className="entity-header">
                    <h4>{faction.name || `Faction ${index + 1}`}</h4>
                    {faction.id && <code className="entity-id">{faction.id}</code>}
                  </div>
                  {faction.goal && <p className="entity-goal"><strong>Goal:</strong> {faction.goal}</p>}
                  {faction.pressure && (
                    <p className="entity-pressure"><strong>Pressure:</strong> {faction.pressure}</p>
                  )}
                  {faction.summary && <p className="entity-summary">{faction.summary}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Locations */}
        <div className="draft-section">
          <div className="section-heading">
            <FontAwesomeIcon icon={faMap} />
            <h2>Locations ({locations.length})</h2>
          </div>
          {locations.length === 0 ? (
            <p className="section-empty">No locations in draft.</p>
          ) : (
            <div className="entity-cards-grid">
              {locations.map((loc, index) => (
                <div key={loc.id || index} className="entity-card">
                  <div className="entity-header">
                    <h4>{loc.name || `Location ${index + 1}`}</h4>
                    {loc.id && <code className="entity-id">{loc.id}</code>}
                  </div>
                  {loc.regionType && (
                    <span className="entity-chip">Region Type: {loc.regionType}</span>
                  )}
                  {loc.summary && <p className="entity-summary">{loc.summary}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Timeline Beats */}
        <div className="draft-section">
          <div className="section-heading">
            <FontAwesomeIcon icon={faRoute} />
            <h2>Timeline Beats ({timelineEvents.length})</h2>
          </div>
          {timelineEvents.length === 0 ? (
            <p className="section-empty">No timeline beats in draft.</p>
          ) : (
            <div className="timeline-list">
              {timelineEvents.map((evt, index) => (
                <div key={evt.id || index} className="timeline-item">
                  <div className="timeline-marker">{index + 1}</div>
                  <div className="timeline-content">
                    <div className="timeline-header">
                      <h4>{evt.title || `Event ${index + 1}`}</h4>
                      {evt.date && <span className="timeline-date">{evt.date}</span>}
                    </div>
                    {evt.id && <code className="entity-id">{evt.id}</code>}
                    {evt.summary && <p className="timeline-summary">{evt.summary}</p>}
                    <div className="timeline-meta">
                      {evt.after && evt.after.length > 0 && (
                        <span className="entity-chip">After: {evt.after.join(', ')}</span>
                      )}
                      {evt.before && evt.before.length > 0 && (
                        <span className="entity-chip">Before: {evt.before.join(', ')}</span>
                      )}
                      {evt.characterIds && evt.characterIds.length > 0 && (
                        <span className="entity-chip">Characters: {evt.characterIds.join(', ')}</span>
                      )}
                      {evt.locationIds && evt.locationIds.length > 0 && (
                        <span className="entity-chip">Locations: {evt.locationIds.join(', ')}</span>
                      )}
                      {evt.factionIds && evt.factionIds.length > 0 && (
                        <span className="entity-chip">Factions: {evt.factionIds.join(', ')}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* D&D Campaign Table Artifact Export Section */}
        <div className="draft-section export-section">
          <div className="section-heading">
            <FontAwesomeIcon icon={faFileCode} />
            <h2>D&amp;D Campaign Table Artifact Export</h2>
          </div>

          {copyFeedback && <div className="copy-feedback-toast">{copyFeedback}</div>}

          {isAccepted ? (
            <div className="export-container accepted-export">
              <div className="export-description">
                <p>
                  This artifact is <strong>accepted</strong> and conforms to the standard shape expected by D&amp;D
                  Campaign Table (<code>{'{ id, artifactType, status, payload }'}</code>).
                </p>
                <div className="export-buttons">
                  <button
                    className="export-btn primary-export-btn"
                    onClick={() => handleCopy(dndArtifactJson, 'Accepted artifact')}
                  >
                    <FontAwesomeIcon icon={faCopy} /> Copy D&amp;D Artifact JSON
                  </button>
                  <button
                    className="export-btn secondary-export-btn"
                    onClick={() => handleCopy(payloadJson, 'Campaign bundle payload')}
                  >
                    <FontAwesomeIcon icon={faCopy} /> Copy Bundle Payload Only
                  </button>
                  <button
                    className="export-btn download-export-btn"
                    onClick={() => handleDownload(dndArtifactJson, `storytime-artifact-${selectedDraft.id}.json`)}
                  >
                    <FontAwesomeIcon icon={faDownload} /> Download JSON
                  </button>
                </div>
              </div>

              <div className="export-preview">
                <div className="preview-header">
                  <span>Artifact Shape Preview</span>
                  <button
                    className="small-copy-btn"
                    onClick={() => handleCopy(dndArtifactJson, 'Artifact JSON')}
                  >
                    <FontAwesomeIcon icon={faCopy} /> Copy
                  </button>
                </div>
                <pre className="json-box">{dndArtifactJson}</pre>
              </div>
            </div>
          ) : (
            <div className="export-container locked-export">
              <div className="locked-warning">
                <FontAwesomeIcon icon={faTriangleExclamation} />
                <div>
                  <strong>Export Locked: Draft Not Accepted</strong>
                  <p>
                    D&amp;D Campaign Table rejects unaccepted StoryTime drafts. Click <em>Accept Draft</em> above
                    to accept this bundle and unlock downstream import.
                  </p>
                </div>
              </div>

              <div className="unreviewed-preview-toggle">
                <button
                  className="preview-toggle-btn"
                  onClick={() => setShowUnreviewedPreview((prev) => !prev)}
                >
                  {showUnreviewedPreview ? 'Hide' : 'Inspect'} Unreviewed JSON Preview
                </button>
              </div>

              {showUnreviewedPreview && (
                <div className="export-preview unreviewed-preview">
                  <div className="preview-header">
                    <span className="unreviewed-tag">UNREVIEWED DRAFT (NOT READY FOR D&amp;D IMPORT)</span>
                  </div>
                  <pre className="json-box unreviewed-json">{dndArtifactJson}</pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Render list view
  return (
    <div className="draft-review-container">
      <div className="draft-list-header">
        <div className="draft-list-title">
          <h2>Generated Draft Reviews</h2>
          <p>Inspect, accept, or reject LLM-generated campaign bundles before D&amp;D Campaign Table import</p>
        </div>

        {/* Filters */}
        <div className="draft-filter-controls">
          <div className="filter-group">
            <label htmlFor="draft-status-filter">Status:</label>
            <select
              id="draft-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as GeneratedDraftStatus | 'all')}
              className="filter-select"
            >
              <option value="all">All Statuses</option>
              <option value="generated">Unreviewed (generated)</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="draft-project-filter">Project:</label>
            <select
              id="draft-project-filter"
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="filter-select"
            >
              <option value="all">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title || 'Untitled Project'} ({p.type || 'story'})
                </option>
              ))}
            </select>
          </div>

          <button className="refresh-btn" onClick={loadDrafts} disabled={loadingList} title="Refresh drafts">
            <FontAwesomeIcon icon={faRotateRight} spin={loadingList} />
          </button>
        </div>
      </div>

      {/* Drafts List */}
      {loadingList ? (
        <div className="draft-loading">
          <FontAwesomeIcon icon={faSpinner} spin size="2x" />
          <p>Loading generated drafts...</p>
        </div>
      ) : drafts.length === 0 ? (
        <div className="draft-empty-state">
          <FontAwesomeIcon icon={faClock} size="3x" />
          <p>No generated drafts found matching the current filters.</p>
        </div>
      ) : (
        <div className="drafts-grid">
          {drafts.map((draft) => {
            const worldName = draft.payload?.worldBrief?.name || 'Campaign Bundle Draft';
            const worldSummary = draft.payload?.worldBrief?.summary || '';
            const charCount = draft.payload?.characters?.length || 0;
            const factionCount = draft.payload?.factions?.length || 0;
            const locationCount = draft.payload?.locations?.length || 0;
            const eventCount = draft.payload?.timelineEvents?.length || 0;
            const gatePassed = draft.gateResult?.ok;

            return (
              <div
                key={draft.id}
                className={`draft-card card-${draft.status}`}
                onClick={() => handleSelectDraft(draft.id)}
              >
                <div className="draft-card-top">
                  <span className={`status-pill status-${draft.status}`}>
                    {draft.status === 'generated' && (
                      <>
                        <FontAwesomeIcon icon={faClock} /> Unreviewed Draft
                      </>
                    )}
                    {draft.status === 'accepted' && (
                      <>
                        <FontAwesomeIcon icon={faCheck} /> Accepted
                      </>
                    )}
                    {draft.status === 'rejected' && (
                      <>
                        <FontAwesomeIcon icon={faXmark} /> Rejected
                      </>
                    )}
                  </span>

                  {draft.gateResult && (
                    <span className={`gate-mini-pill ${gatePassed ? 'gate-ok' : 'gate-fail'}`}>
                      {gatePassed ? 'Gate Passed' : 'Gate Failed'}
                    </span>
                  )}
                </div>

                <h3 className="draft-card-title">{worldName}</h3>
                {worldSummary && (
                  <p className="draft-card-summary">
                    {worldSummary.length > 120 ? `${worldSummary.substring(0, 120)}...` : worldSummary}
                  </p>
                )}

                <div className="draft-card-counts">
                  <span>{charCount} chars</span>
                  <span>{factionCount} factions</span>
                  <span>{locationCount} locs</span>
                  <span>{eventCount} beats</span>
                </div>

                <div className="draft-card-footer">
                  <div className="draft-footer-meta">
                    <span className="task-badge">Task #{draft.dashboardTaskId || 'N/A'}</span>
                    <span className="provider-label">
                      {draft.modelProvider || 'local'} / {draft.modelName || 'llm'}
                    </span>
                  </div>
                  <button className="review-btn" onClick={(e) => {
                    e.stopPropagation();
                    handleSelectDraft(draft.id);
                  }}>
                    Review &rarr;
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
