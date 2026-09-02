import { useState, useMemo } from 'react';
import type { FamilyTreeLineage, Character } from '../types/story';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSitemap,
  faChevronDown,
  faChevronRight,
  faStar,
  faClock,
} from '@fortawesome/free-solid-svg-icons';
import './FamilyTreeView.css';

interface Props {
  lineages: FamilyTreeLineage[];
  allCharacters: Character[];
  calendarLabel?: string | null;
  onSelectCharacter: (charId: string) => void;
}

export default function FamilyTreeView({
  lineages,
  allCharacters,
  calendarLabel = 'Year of the Iron Dirge',
  onSelectCharacter,
}: Props) {
  // Map for character lookup by ID
  const charMap = useMemo(() => {
    const m = new Map<string, Character>();
    for (const c of allCharacters) {
      m.set(c.id, c);
    }
    return m;
  }, [allCharacters]);

  // Keep track of expanded lineages (default first 2 expanded, rest collapsed for clean performance)
  const [expandedLineages, setExpandedLineages] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const l of lineages.slice(0, 2)) {
      initial.add(l.id);
    }
    return initial;
  });

  const toggleLineage = (lineageId: string) => {
    setExpandedLineages((prev) => {
      const next = new Set(prev);
      if (next.has(lineageId)) {
        next.delete(lineageId);
      } else {
        next.add(lineageId);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedLineages(new Set(lineages.map((l) => l.id)));
  };

  const collapseAll = () => {
    setExpandedLineages(new Set());
  };

  return (
    <div className="family-tree-container">
      <div className="family-tree-controls">
        <h3>
          <FontAwesomeIcon icon={faSitemap} /> Family &amp; Lineage Trees ({lineages.length} Lineages)
        </h3>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button type="button" className="tree-action-btn" onClick={expandAll}>
            Expand All
          </button>
          <button type="button" className="tree-action-btn" onClick={collapseAll}>
            Collapse All
          </button>
        </div>
      </div>

      {lineages.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          No family relationships charted yet. Link characters with family ties or use the Lineage generator.
        </div>
      ) : (
        lineages.map((lineage) => {
          const isExpanded = expandedLineages.has(lineage.id);
          const hasPrincipal = lineage.members.some((m) => m.importance === 'principal');

          return (
            <div key={lineage.id} className={`lineage-card ${isExpanded ? 'expanded' : ''}`}>
              <div className="lineage-header" onClick={() => toggleLineage(lineage.id)}>
                <div className="lineage-title-row">
                  <FontAwesomeIcon
                    icon={isExpanded ? faChevronDown : faChevronRight}
                    className="lineage-toggle-icon"
                  />
                  <h4>{lineage.name}</h4>
                  <span className="lineage-member-badge">{lineage.memberCount} members</span>
                  {hasPrincipal && (
                    <span className="lineage-principal-badge">
                      <FontAwesomeIcon icon={faStar} /> Principal Lineage
                    </span>
                  )}
                </div>
              </div>

              {isExpanded && (
                <div className="lineage-members-grid">
                  {lineage.members.map((member) => {
                    const isPrincipal = member.importance === 'principal';
                    const parentNames = member.parents
                      .map((pid) => charMap.get(pid)?.name)
                      .filter(Boolean);
                    const spouseNames = member.spouses
                      .map((sid) => charMap.get(sid)?.name)
                      .filter(Boolean);
                    const childNames = member.children
                      .map((cid) => charMap.get(cid)?.name)
                      .filter(Boolean);

                    return (
                      <div
                        key={member.id}
                        className={`tree-member-node ${isPrincipal ? 'principal' : ''}`}
                        onClick={() => onSelectCharacter(member.id)}
                        title={`Click to inspect ${member.name} in dossier editor`}
                      >
                        <div className="node-top-bar">
                          <span className="node-name">{member.name}</span>
                          {isPrincipal && (
                            <span title="Principal Actor" style={{ color: '#facc15', fontSize: '0.8rem' }}>
                              ★
                            </span>
                          )}
                        </div>

                        {member.role && <span className="node-role">{member.role}</span>}

                        {(member.activeTimeframeStart != null || member.activeTimeframeEnd != null) && (
                          <div className="node-timeframe">
                            <FontAwesomeIcon icon={faClock} style={{ fontSize: '0.68rem' }} />
                            <span>
                              {member.activeTimeframeStart ?? '?'}&ndash;
                              {member.activeTimeframeEnd ?? 'Present'} {calendarLabel ? `(${calendarLabel})` : ''}
                            </span>
                          </div>
                        )}

                        {(parentNames.length > 0 || spouseNames.length > 0 || childNames.length > 0) && (
                          <div className="node-links">
                            {parentNames.length > 0 && (
                              <span>
                                <strong>Parents:</strong> {parentNames.join(', ')}
                              </span>
                            )}
                            {spouseNames.length > 0 && (
                              <span>
                                <strong>Spouse:</strong> {spouseNames.join(', ')}
                              </span>
                            )}
                            {childNames.length > 0 && (
                              <span>
                                <strong>Children:</strong> {childNames.join(', ')}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
