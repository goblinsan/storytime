import { useState, useRef, useEffect, useMemo } from 'react';
import Tree from 'react-d3-tree';
import type { FamilyTreeLineage, Character } from '../types/story';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSitemap,
  faStar,
  faArrowsRotate,
  faMagnifyingGlassPlus,
  faMagnifyingGlassMinus,
  faExpand,
} from '@fortawesome/free-solid-svg-icons';
import './FamilyTreeView.css';

interface Props {
  lineages: FamilyTreeLineage[];
  allCharacters: Character[];
  calendarLabel?: string | null;
  onSelectCharacter: (charId: string) => void;
}

export default function FamilyTreeView({
  lineages = [],
  calendarLabel = 'Year of the Iron Dirge',
  onSelectCharacter,
}: Props) {
  const [selectedLineageId, setSelectedLineageId] = useState<string>(() => {
    return lineages[0]?.id || '';
  });

  const [orientation, setOrientation] = useState<'vertical' | 'horizontal'>('vertical');
  const [pathFunc, setPathFunc] = useState<'step' | 'diagonal'>('step');
  const [translate, setTranslate] = useState<{ x: number; y: number }>({ x: 300, y: 100 });
  const [zoom, setZoom] = useState<number>(0.85);

  const containerRef = useRef<HTMLDivElement | null>(null);

  // Sync selected lineage if lineages array changes
  useEffect(() => {
    if (lineages.length > 0 && (!selectedLineageId || !lineages.some((l) => l.id === selectedLineageId))) {
      setSelectedLineageId(lineages[0].id);
    }
  }, [lineages, selectedLineageId]);

  // Center tree whenever container dimensions or lineage changes
  useEffect(() => {
    if (containerRef.current) {
      const { clientWidth, clientHeight } = containerRef.current;
      if (orientation === 'vertical') {
        setTranslate({ x: Math.max(clientWidth / 2, 220), y: 80 });
      } else {
        setTranslate({ x: 120, y: Math.max(clientHeight / 2, 160) });
      }
    }
  }, [selectedLineageId, orientation]);

  const activeLineage = useMemo(() => {
    return lineages.find((l) => l.id === selectedLineageId) || lineages[0];
  }, [lineages, selectedLineageId]);

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.15, 2.0));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.15, 0.3));
  const handleResetView = () => {
    setZoom(0.85);
    if (containerRef.current) {
      const { clientWidth, clientHeight } = containerRef.current;
      setTranslate({
        x: orientation === 'vertical' ? clientWidth / 2 : 120,
        y: orientation === 'vertical' ? 80 : clientHeight / 2,
      });
    }
  };

  const toggleOrientation = () => {
    setOrientation((prev) => (prev === 'vertical' ? 'horizontal' : 'vertical'));
  };

  const togglePathFunc = () => {
    setPathFunc((prev) => (prev === 'step' ? 'diagonal' : 'step'));
  };

  // Custom Node Renderer
  const renderCustomNode = ({ nodeDatum, toggleNode }: any) => {
    const isPrincipal = nodeDatum.attributes?.importance === 'principal';
    const isSynthetic = Boolean(nodeDatum.attributes?.isSyntheticRoot);
    const hasChildren = Boolean(nodeDatum.children && nodeDatum.children.length > 0);
    const isCollapsed = Boolean(nodeDatum.__rd3t?.collapsed);

    return (
      <g>
        <foreignObject
          width={210}
          height={82}
          x={-105}
          y={-41}
          style={{ overflow: 'visible' }}
        >
          <div
            className={`d3-node-foreign-card ${isPrincipal ? 'principal' : ''} ${
              isSynthetic ? 'synthetic' : ''
            }`}
            onClick={(e) => {
              e.stopPropagation();
              if (nodeDatum.attributes?.id && !isSynthetic) {
                onSelectCharacter(String(nodeDatum.attributes.id));
              } else if (hasChildren) {
                toggleNode();
              }
            }}
            title={
              isSynthetic
                ? 'Founding Ancestors / Clan Progenitors'
                : `Click to inspect ${nodeDatum.name} in dossier editor`
            }
          >
            <div className="node-card-header">
              <span className="node-card-title">{nodeDatum.name}</span>
              {isPrincipal && <span style={{ color: '#facc15', fontSize: '0.85rem' }}>★</span>}
              {hasChildren && (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleNode();
                  }}
                  style={{
                    fontSize: '0.72rem',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: '#334155',
                    color: '#f8fafc',
                    cursor: 'pointer',
                    fontWeight: 700,
                  }}
                  title="Expand / Collapse branch"
                >
                  {isCollapsed ? '+' : '−'}
                </span>
              )}
            </div>

            <div className="node-card-role">
              {nodeDatum.attributes?.role || (isSynthetic ? 'Clan Forebears' : 'Family Member')}
            </div>

            <div className="node-card-footer">
              <span className="node-card-timeframe">
                {nodeDatum.attributes?.timeframe ? `${nodeDatum.attributes.timeframe}` : ''}
              </span>
              {nodeDatum.attributes?.spouses && (
                <span className="node-card-spouse" title={`Spouse: ${nodeDatum.attributes.spouses}`}>
                  💍 {nodeDatum.attributes.spouses}
                </span>
              )}
            </div>
          </div>
        </foreignObject>
      </g>
    );
  };

  if (!lineages || lineages.length === 0) {
    return (
      <div className="d3-family-tree-wrapper">
        <div className="tree-empty-state">
          <FontAwesomeIcon icon={faSitemap} style={{ fontSize: '2rem', color: '#64748b' }} />
          <h4>No Family Trees Charted</h4>
          <p>Link characters using family/kin relationships to chart lineages.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="d3-family-tree-wrapper">
      {/* Top Toolbar */}
      <div className="tree-top-toolbar">
        {/* Lineage Selector Pills - Responsive Flex Wrap */}
        <div className="lineage-pills-row">
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
            Lineage:
          </span>
          {lineages.map((lineage) => {
            const hasPrincipal = lineage.members.some((m) => m.importance === 'principal');
            const isActive = lineage.id === selectedLineageId;
            return (
              <button
                key={lineage.id}
                type="button"
                className={`lineage-selector-pill ${isActive ? 'active' : ''}`}
                onClick={() => setSelectedLineageId(lineage.id)}
                title={`View ${lineage.name} genealogical tree`}
              >
                {hasPrincipal && <FontAwesomeIcon icon={faStar} style={{ color: '#facc15' }} />}
                <span>{lineage.name}</span>
                <span className="pill-count">{lineage.memberCount}</span>
              </button>
            );
          })}
        </div>

        {/* Tree Canvas Controls */}
        <div className="tree-canvas-controls">
          {calendarLabel && (
            <span style={{ fontSize: '0.72rem', color: '#94a3b8', marginRight: '0.2rem' }}>
              Era: <strong style={{ color: '#38bdf8' }}>{calendarLabel}</strong>
            </span>
          )}
          <button
            type="button"
            className="canvas-ctrl-btn"
            onClick={togglePathFunc}
            title="Toggle line style between Step (squared) and Diagonal (curved)"
          >
            Lines: {pathFunc === 'step' ? 'Step' : 'Curved'}
          </button>
          <button
            type="button"
            className="canvas-ctrl-btn"
            onClick={toggleOrientation}
            title="Toggle tree orientation (vertical / horizontal)"
          >
            <FontAwesomeIcon icon={faArrowsRotate} /> {orientation === 'vertical' ? 'Vertical' : 'Horizontal'}
          </button>
          <button
            type="button"
            className="canvas-ctrl-btn"
            onClick={handleZoomIn}
            title="Zoom in"
          >
            <FontAwesomeIcon icon={faMagnifyingGlassPlus} />
          </button>
          <button
            type="button"
            className="canvas-ctrl-btn"
            onClick={handleZoomOut}
            title="Zoom out"
          >
            <FontAwesomeIcon icon={faMagnifyingGlassMinus} />
          </button>
          <button
            type="button"
            className="canvas-ctrl-btn"
            onClick={handleResetView}
            title="Reset pan and zoom to center"
          >
            <FontAwesomeIcon icon={faExpand} /> Reset
          </button>
        </div>
      </div>

      {/* D3 Tree Viewport Canvas */}
      <div ref={containerRef} className="d3-tree-container">
        {activeLineage?.d3Tree ? (
          <Tree
            data={activeLineage.d3Tree}
            orientation={orientation}
            translate={translate}
            zoom={zoom}
            nodeSize={{ x: orientation === 'vertical' ? 240 : 280, y: orientation === 'vertical' ? 150 : 130 }}
            separation={{ siblings: 1.15, nonSiblings: 1.35 }}
            pathFunc={pathFunc}
            renderCustomNodeElement={renderCustomNode}
            enableLegacyTransitions={false}
          />
        ) : (
          <div className="tree-empty-state">
            <h4>No Tree Data Available for this Lineage</h4>
            <p>Characters in this clan do not have connected hierarchical relationships charted yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
