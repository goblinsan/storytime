import { useEffect, useLayoutEffect, useRef, useState, useReducer } from 'react';
import { api } from '../api';
import type { MapNode, MapPath } from '../types/story';
import './WorldMapViewer.css';

// ─── Constants (shared with editor) ─────────────────────────────────────────

const CANVAS_W = 960;
const CANVAS_H = 600;
const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 50;

type TerrainKey = ' ' | 'O' | 'W' | 'P' | 'H' | 'F' | 'M' | 'D' | 'S' | 'T';

const TERRAIN: Record<TerrainKey, { label: string; color: string }> = {
  ' ': { label: 'Clear',     color: '#1a6b9a' },
  O:   { label: 'Ocean',     color: '#1a6b9a' },
  W:   { label: 'Water',     color: '#4a90d9' },
  P:   { label: 'Plains',    color: '#9ec26b' },
  H:   { label: 'Hills',     color: '#8fa882' },
  F:   { label: 'Forest',    color: '#2d6a4f' },
  M:   { label: 'Mountains', color: '#7a7a6e' },
  D:   { label: 'Desert',    color: '#d4a843' },
  S:   { label: 'Swamp',     color: '#4a6741' },
  T:   { label: 'Tundra',    color: '#c8dde8' },
};

type DrawStyle = { label: string; color: string; dash: number[]; width: number };

const RIVER_STYLES: Record<string, DrawStyle> = {
  river:  { label: 'River',  color: '#4a90d9', dash: [],      width: 3 },
  stream: { label: 'Stream', color: '#6aadea', dash: [],      width: 1.5 },
  canal:  { label: 'Canal',  color: '#3a7abf', dash: [8, 4],  width: 2 },
};

const PATH_STYLES: Record<string, DrawStyle> = {
  paved:       { label: 'Paved Road',   color: '#a08050', dash: [],       width: 2.5 },
  rail:        { label: 'Rail',         color: '#888',    dash: [4, 4],   width: 2 },
  footpath:    { label: 'Footpath',     color: '#bba87a', dash: [3, 5],   width: 1.5 },
  cart:        { label: 'Cart / Wagon', color: '#8b6914', dash: [6, 3],   width: 2 },
  tunnel:      { label: 'Tunnel',       color: '#666',    dash: [2, 6],   width: 2.5 },
  climb:       { label: 'Climb / Hike', color: '#a35a3a', dash: [2, 3],   width: 1.5 },
  trade_route: { label: 'Trade Route',  color: '#c9a94e', dash: [10, 4],  width: 2 },
};

const ALL_DRAW_STYLES: Record<string, DrawStyle> = { ...RIVER_STYLES, ...PATH_STYLES };

const LOC_FILL_COLORS = [
  'rgba(255,100,100,0.25)',
  'rgba(100,200,255,0.25)',
  'rgba(100,255,150,0.25)',
  'rgba(255,200,80,0.25)',
  'rgba(200,100,255,0.25)',
  'rgba(255,150,50,0.25)',
];
const LOC_OUTLINE_COLORS = [
  'rgba(255,100,100,0.8)',
  'rgba(100,200,255,0.8)',
  'rgba(100,255,150,0.8)',
  'rgba(255,200,80,0.8)',
  'rgba(200,100,255,0.8)',
  'rgba(255,150,50,0.8)',
];

interface Pt { x: number; y: number }

// ─── Layers ─────────────────────────────────────────────────────────────────

interface Layers {
  terrain: boolean;
  regions: boolean;
  towns: boolean;
  paths: boolean;
  rivers: boolean;
  labels: boolean;
  grid: boolean;
}

const DEFAULT_LAYERS: Layers = {
  terrain: true,
  regions: true,
  towns: true,
  paths: true,
  rivers: true,
  labels: true,
  grid: false,
};

const LAYER_META: { key: keyof Layers; icon: string; label: string }[] = [
  { key: 'terrain', icon: '🏔', label: 'Terrain' },
  { key: 'regions', icon: '🗺', label: 'Regions' },
  { key: 'towns',   icon: '🏘', label: 'Towns' },
  { key: 'paths',   icon: '🛤', label: 'Paths' },
  { key: 'rivers',  icon: '🌊', label: 'Rivers' },
  { key: 'labels',  icon: '🏷', label: 'Labels' },
  { key: 'grid',    icon: '⊞',  label: 'Grid' },
];

// ─── Component ──────────────────────────────────────────────────────────────

interface Props {
  storyId: string;
  onClose: () => void;
}

export default function WorldMapViewer({ storyId, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef<() => void>(() => {});

  const cols = DEFAULT_COLS;
  const rows = DEFAULT_ROWS;
  const cellW = CANVAS_W / cols;
  const cellH = CANVAS_H / rows;

  const [terrain, setTerrain] = useState('');
  const [locations, setLocations] = useState<MapNode[]>([]);
  const [paths, setPaths] = useState<MapPath[]>([]);
  const [layers, setLayers] = useState<Layers>(DEFAULT_LAYERS);
  const [hoveredLoc, setHoveredLoc] = useState<MapNode | null>(null);
  const hoverCellRef = useRef<Pt | null>(null);
  const [, forceUpdate] = useReducer(x => x + 1, 0);

  // ── Load data ───────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [terrainData, locs, pathsData] = await Promise.all([
          api.terrain.get(storyId, ''),
          api.locations.listRoot(storyId),
          api.paths.list(storyId, ''),
        ]);
        if (cancelled) return;
        if (terrainData) setTerrain(terrainData.terrainData);
        setLocations(locs);
        setPaths(pathsData);
      } catch (e) {
        console.error('WorldMapViewer: load error', e);
      }
    })();
    return () => { cancelled = true; };
  }, [storyId]);

  // ── Draw ────────────────────────────────────────────────────────────────

  useLayoutEffect(() => {
    drawRef.current = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

      const t = terrain || ' '.repeat(cols * rows);

      // 1. Terrain fill
      if (layers.terrain) {
        for (let cy = 0; cy < rows; cy++) {
          for (let cx = 0; cx < cols; cx++) {
            const ch = (t[cy * cols + cx] || ' ') as TerrainKey;
            const info = TERRAIN[ch] ?? TERRAIN[' '];
            ctx.fillStyle = info.color;
            ctx.fillRect(cx * cellW, cy * cellH, cellW, cellH);
          }
        }
      } else {
        ctx.fillStyle = '#1a2638';
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      }

      // 2. Grid overlay
      if (layers.grid) {
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        for (let cx = 0; cx <= cols; cx++) {
          ctx.moveTo(cx * cellW, 0);
          ctx.lineTo(cx * cellW, CANVAS_H);
        }
        for (let cy = 0; cy <= rows; cy++) {
          ctx.moveTo(0, cy * cellH);
          ctx.lineTo(CANVAS_W, cy * cellH);
        }
        ctx.stroke();
      }

      // 3. Region overlays
      if (layers.regions) {
        locations.forEach((loc, i) => {
          const cells = loc.cells ?? [];
          if (cells.length === 0) return;
          // Fill
          ctx.fillStyle = LOC_FILL_COLORS[i % LOC_FILL_COLORS.length];
          cells.forEach(({ x, y }) => {
            ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
          });
          // Outline
          const cellSet = new Set(cells.map(c => `${c.x},${c.y}`));
          ctx.save();
          ctx.strokeStyle = LOC_OUTLINE_COLORS[i % LOC_OUTLINE_COLORS.length];
          ctx.lineWidth = 1.5;
          ctx.setLineDash([]);
          ctx.beginPath();
          cells.forEach(({ x, y }) => {
            const px = x * cellW;
            const py = y * cellH;
            if (!cellSet.has(`${x},${y - 1}`)) { ctx.moveTo(px, py); ctx.lineTo(px + cellW, py); }
            if (!cellSet.has(`${x},${y + 1}`)) { ctx.moveTo(px, py + cellH); ctx.lineTo(px + cellW, py + cellH); }
            if (!cellSet.has(`${x - 1},${y}`)) { ctx.moveTo(px, py); ctx.lineTo(px, py + cellH); }
            if (!cellSet.has(`${x + 1},${y}`)) { ctx.moveTo(px + cellW, py); ctx.lineTo(px + cellW, py + cellH); }
          });
          ctx.stroke();
          ctx.restore();
        });
      }

      // 4. Town markers — draw a small icon at each location's centroid
      if (layers.towns) {
        locations.forEach((loc) => {
          const cells = loc.cells ?? [];
          if (cells.length === 0) return;
          // Compute centroid
          let sx = 0, sy = 0;
          cells.forEach(c => { sx += c.x; sy += c.y; });
          const cx = (sx / cells.length + 0.5) * cellW;
          const cy = (sy / cells.length + 0.5) * cellH;
          // Marker dot
          ctx.save();
          ctx.beginPath();
          ctx.arc(cx, cy, 4, 0, Math.PI * 2);
          ctx.fillStyle = '#fff';
          ctx.shadowColor = 'rgba(0,0,0,0.6)';
          ctx.shadowBlur = 4;
          ctx.fill();
          ctx.strokeStyle = '#333';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.restore();
        });
      }

      // 5. Paths
      if (layers.paths) {
        paths.filter(p => !(p.pathType in RIVER_STYLES)).forEach(p => {
          const style = ALL_DRAW_STYLES[p.pathType] ?? PATH_STYLES.paved;
          const wps = p.waypoints ?? [];
          if (wps.length < 2) return;
          ctx.save();
          ctx.strokeStyle = style.color;
          ctx.lineWidth = style.width * (p.widthMultiplier ?? 1);
          ctx.setLineDash(style.dash);
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          wps.forEach((wp, idx) => {
            const px = (wp.x + 0.5) * cellW;
            const py = (wp.y + 0.5) * cellH;
            if (idx === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          });
          ctx.stroke();
          ctx.restore();
        });
      }

      // 6. Rivers
      if (layers.rivers) {
        paths.filter(p => p.pathType in RIVER_STYLES).forEach(p => {
          const style = ALL_DRAW_STYLES[p.pathType] ?? RIVER_STYLES.river;
          const wps = p.waypoints ?? [];
          if (wps.length < 2) return;
          ctx.save();
          ctx.strokeStyle = style.color;
          ctx.lineWidth = style.width * (p.widthMultiplier ?? 1);
          ctx.setLineDash(style.dash);
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          wps.forEach((wp, idx) => {
            const px = (wp.x + 0.5) * cellW;
            const py = (wp.y + 0.5) * cellH;
            if (idx === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          });
          ctx.stroke();
          ctx.restore();
        });
      }

      // 7. Labels
      if (layers.labels) {
        locations.forEach((loc) => {
          const cells = loc.cells ?? [];
          if (cells.length === 0) return;
          // Compute centroid for label placement
          let sx = 0, sy = 0;
          cells.forEach(c => { sx += c.x; sy += c.y; });
          const cx = (sx / cells.length + 0.5) * cellW;
          const cy = (sy / cells.length + 0.5) * cellH;

          ctx.save();
          ctx.font = `bold ${Math.max(10, Math.min(13, cellH * 0.9))}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          // Shadow for legibility
          ctx.shadowColor = 'rgba(0,0,0,0.85)';
          ctx.shadowBlur = 4;
          ctx.fillStyle = '#fff';
          ctx.fillText(loc.name, cx, cy + 8);
          ctx.restore();
        });

        // Path labels at midpoint
        const drawPaths = layers.paths ? paths.filter(p => !(p.pathType in RIVER_STYLES)) : [];
        const drawRivers = layers.rivers ? paths.filter(p => p.pathType in RIVER_STYLES) : [];
        [...drawPaths, ...drawRivers].forEach(p => {
          const wps = p.waypoints ?? [];
          if (wps.length < 2) return;
          const mid = wps[Math.floor(wps.length / 2)];
          const px = (mid.x + 0.5) * cellW;
          const py = (mid.y + 0.5) * cellH;
          ctx.save();
          ctx.font = `italic ${Math.max(8, Math.min(10, cellH * 0.7))}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillStyle = ALL_DRAW_STYLES[p.pathType]?.color ?? '#aaa';
          ctx.shadowColor = 'rgba(0,0,0,0.8)';
          ctx.shadowBlur = 3;
          ctx.fillText(p.name, px, py - 6);
          ctx.restore();
        });
      }

      // 8. Hover highlight
      const hov = hoverCellRef.current;
      if (hov && hoveredLoc) {
        // Highlight entire hovered location
        const cells = hoveredLoc.cells ?? [];
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,80,0.9)';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        const cellSet = new Set(cells.map(c => `${c.x},${c.y}`));
        ctx.beginPath();
        cells.forEach(({ x, y }) => {
          const px = x * cellW;
          const py = y * cellH;
          if (!cellSet.has(`${x},${y - 1}`)) { ctx.moveTo(px, py); ctx.lineTo(px + cellW, py); }
          if (!cellSet.has(`${x},${y + 1}`)) { ctx.moveTo(px, py + cellH); ctx.lineTo(px + cellW, py + cellH); }
          if (!cellSet.has(`${x - 1},${y}`)) { ctx.moveTo(px, py); ctx.lineTo(px, py + cellH); }
          if (!cellSet.has(`${x + 1},${y}`)) { ctx.moveTo(px + cellW, py); ctx.lineTo(px + cellW, py + cellH); }
        });
        ctx.stroke();
        ctx.restore();
      }
    };

    drawRef.current();
  }); // runs after every render

  // Redraw when terrain loads
  useEffect(() => { drawRef.current(); }, [terrain]);

  // ── Mouse hover ─────────────────────────────────────────────────────────

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const gx = Math.floor(mx / cellW);
    const gy = Math.floor(my / cellH);
    hoverCellRef.current = { x: gx, y: gy };

    // Find location under cursor
    const key = `${gx},${gy}`;
    const loc = locations.find(l => (l.cells ?? []).some(c => `${c.x},${c.y}` === key)) ?? null;
    setHoveredLoc(loc);
    forceUpdate();
  }

  function handleMouseLeave() {
    hoverCellRef.current = null;
    setHoveredLoc(null);
    forceUpdate();
  }

  function toggleLayer(key: keyof Layers) {
    setLayers(prev => ({ ...prev, [key]: !prev[key] }));
  }

  // ── Legend ──────────────────────────────────────────────────────────────

  const terrainEntries = (Object.entries(TERRAIN) as [TerrainKey, { label: string; color: string }][])
    .filter(([k]) => k !== ' ');

  return (
    <div className="wmv-root">
      {/* Top bar */}
      <div className="wmv-topbar">
        <button className="wmv-back-btn" onClick={onClose}>← Back to Editor</button>
        <span className="wmv-title">World Map</span>
        <div className="wmv-layer-toggles">
          {LAYER_META.map(({ key, icon, label }) => (
            <button
              key={key}
              className={`wmv-layer-btn${layers[key] ? ' active' : ''}`}
              onClick={() => toggleLayer(key)}
              title={label}
            >
              {icon} {label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="wmv-body">
        {/* Canvas */}
        <div className="wmv-canvas-wrap">
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            className="wmv-canvas"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          />
          {/* Tooltip */}
          {hoveredLoc && (
            <div className="wmv-tooltip">
              <strong>{hoveredLoc.name}</strong>
              {hoveredLoc.description && <p>{hoveredLoc.description}</p>}
              {hoveredLoc.regionType && <span className="wmv-tooltip-tag">{hoveredLoc.regionType}</span>}
              {hoveredLoc.races.length > 0 && (
                <span className="wmv-tooltip-tag">{hoveredLoc.races.join(', ')}</span>
              )}
            </div>
          )}
        </div>

        {/* Legend sidebar */}
        <div className="wmv-legend">
          {layers.terrain && (
            <div className="wmv-legend-section">
              <div className="wmv-legend-heading">Terrain</div>
              {terrainEntries.map(([, info]) => (
                <div key={info.label} className="wmv-legend-item">
                  <span className="wmv-legend-swatch" style={{ background: info.color }} />
                  {info.label}
                </div>
              ))}
            </div>
          )}

          {layers.regions && locations.length > 0 && (
            <div className="wmv-legend-section">
              <div className="wmv-legend-heading">Regions</div>
              {locations.filter(l => (l.cells ?? []).length > 0).map((loc, i) => (
                <div key={loc.id} className="wmv-legend-item">
                  <span className="wmv-legend-swatch" style={{ background: LOC_OUTLINE_COLORS[i % LOC_OUTLINE_COLORS.length] }} />
                  {loc.name}
                </div>
              ))}
            </div>
          )}

          {layers.paths && paths.filter(p => !(p.pathType in RIVER_STYLES)).length > 0 && (
            <div className="wmv-legend-section">
              <div className="wmv-legend-heading">Paths</div>
              {paths.filter(p => !(p.pathType in RIVER_STYLES)).map(p => (
                <div key={p.id} className="wmv-legend-item">
                  <span className="wmv-legend-line" style={{ background: ALL_DRAW_STYLES[p.pathType]?.color }} />
                  {p.name}
                  <span className="wmv-legend-type">{ALL_DRAW_STYLES[p.pathType]?.label}</span>
                </div>
              ))}
            </div>
          )}

          {layers.rivers && paths.filter(p => p.pathType in RIVER_STYLES).length > 0 && (
            <div className="wmv-legend-section">
              <div className="wmv-legend-heading">Rivers</div>
              {paths.filter(p => p.pathType in RIVER_STYLES).map(p => (
                <div key={p.id} className="wmv-legend-item">
                  <span className="wmv-legend-line" style={{ background: ALL_DRAW_STYLES[p.pathType]?.color }} />
                  {p.name}
                  <span className="wmv-legend-type">{ALL_DRAW_STYLES[p.pathType]?.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
