import { useEffect, useLayoutEffect, useRef, useState, useReducer, useCallback } from 'react';
import { api } from '../api';
import type { MapNode, MapPath, MapPathType } from '../types/story';
import './WorldMapEditor.css';

// ─── Constants ────────────────────────────────────────────────────────────────

const CANVAS_W = 960;
const CANVAS_H = 600;
const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 50;
const SAVE_DEBOUNCE_MS = 1500;

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
  'rgba(255,100,100,0.22)',
  'rgba(100,200,255,0.22)',
  'rgba(100,255,150,0.22)',
  'rgba(255,200,80,0.22)',
  'rgba(200,100,255,0.22)',
  'rgba(255,150,50,0.22)',
];
const LOC_OUTLINE_COLORS = [
  'rgba(255,100,100,0.7)',
  'rgba(100,200,255,0.7)',
  'rgba(100,255,150,0.7)',
  'rgba(255,200,80,0.7)',
  'rgba(200,100,255,0.7)',
  'rgba(255,150,50,0.7)',
];
const SELECTED_OUTLINE_COLOR = 'rgba(255,255,80,1)';

type Tool = 'terrain_paint' | 'region_select' | 'river_draw' | 'path_draw' | 'select';
type RiverType = 'river' | 'stream' | 'canal';

interface BreadcrumbEntry {
  contextId: string;  // '' for world root
  name: string;
  cols: number;
  rows: number;
}

interface Pt { x: number; y: number }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptyTerrain(cols: number, rows: number): string {
  return ' '.repeat(cols * rows);
}

function getIdx(x: number, y: number, cols: number): number {
  return y * cols + x;
}

function ensureLength(terrain: string, cols: number, rows: number): string {
  const needed = cols * rows;
  return terrain.length >= needed ? terrain : terrain.padEnd(needed, ' ');
}

function paintCell(terrain: string, x: number, y: number, cols: number, rows: number, key: TerrainKey): string {
  if (x < 0 || y < 0 || x >= cols || y >= rows) return terrain;
  const t = ensureLength(terrain, cols, rows);
  const idx = getIdx(x, y, cols);
  return t.slice(0, idx) + key + t.slice(idx + 1);
}

function paintRect(terrain: string, x1: number, y1: number, x2: number, y2: number, cols: number, rows: number, key: TerrainKey): string {
  let t = ensureLength(terrain, cols, rows);
  const minX = Math.max(0, Math.min(x1, x2));
  const maxX = Math.min(cols - 1, Math.max(x1, x2));
  const minY = Math.max(0, Math.min(y1, y2));
  const maxY = Math.min(rows - 1, Math.max(y1, y2));
  for (let cy = minY; cy <= maxY; cy++) {
    for (let cx = minX; cx <= maxX; cx++) {
      t = paintCell(t, cx, cy, cols, rows, key);
    }
  }
  return t;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  storyId: string;
  ensureStory: () => Promise<string>;
  onViewMap?: () => void;
}

export default function WorldMapEditor({ storyId, ensureStory, onViewMap }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef<() => void>(() => {});
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const [, setBgLoaded] = useState(false);
  const [bgOpacity, setBgOpacity] = useState(0.4);
  const [showBg, setShowBg] = useState(true);

  // Breadcrumb / zoom state
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbEntry[]>([
    { contextId: '', name: 'World', cols: DEFAULT_COLS, rows: DEFAULT_ROWS },
  ]);
  const crumb = breadcrumb[breadcrumb.length - 1];
  const { cols, rows, contextId } = crumb;
  const cellW = CANVAS_W / cols;
  const cellH = CANVAS_H / rows;

  // Tool state
  const [tool, setTool] = useState<Tool>('terrain_paint');
  const [activeTerrain, setActiveTerrain] = useState<TerrainKey>('P');
  const [activePathType, setActivePathType] = useState<MapPathType>('paved');
  const [activeRiverType, setActiveRiverType] = useState<RiverType>('river');
  const [brushSize, setBrushSize] = useState<1 | 2 | 3>(1);

  // Map data
  const [terrain, setTerrain] = useState('');
  const terrainRef = useRef('');
  const [locations, setLocations] = useState<MapNode[]>([]);
  const [paths, setPaths] = useState<MapPath[]>([]);

  // Interaction state
  const isPainting = useRef(false);
  const isSelecting = useRef(false);
  const isDrawingPath = useRef(false);
  // forceUpdate triggers re-renders so useLayoutEffect redraws the canvas
  const [, forceUpdate] = useReducer(x => x + 1, 0);
  const hoverCellRef = useRef<Pt | null>(null);
  const regionCellsRef = useRef<Set<string>>(new Set());
  const pathWaypointsRef = useRef<Pt[]>([]);

  // Right-panel state
  type Panel = 'none' | 'new_loc' | 'edit_loc' | 'new_path' | 'edit_path';
  const [panel, setPanel] = useState<Panel>('none');
  const [selectedLocId, setSelectedLocId] = useState<string | null>(null);
  const [selectedPathId, setSelectedPathId] = useState<string | null>(null);
  const [pendingCells, setPendingCells] = useState<Pt[]>([]);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formSubCols, setFormSubCols] = useState(20);
  const [formSubRows, setFormSubRows] = useState(15);
  const [formPathName, setFormPathName] = useState('');
  const [formPathType, setFormPathType] = useState<MapPathType>('paved');
  const [formPathWidth, setFormPathWidth] = useState(1);
  const [drawWidthMultiplier, setDrawWidthMultiplier] = useState(1);

  // Edge-grace timer: delay finalization when cursor leaves canvas during path drawing
  const edgeGraceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Save debounce
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load background reference image ────────────────────────────────────────

  useEffect(() => {
    const img = new Image();
    img.onload = () => { bgImageRef.current = img; setBgLoaded(true); };
    img.src = '/world-map.png';
  }, []);

  // ── Escape key to cancel in-progress drawing ──────────────────────────────

  // Helper: finalize in-progress path drawing → show name panel
  const finalizePath = useCallback(() => {
    if (!isDrawingPath.current) return;
    isDrawingPath.current = false;
    const wps = [...pathWaypointsRef.current];
    pathWaypointsRef.current = [];
    if (wps.length >= 2) {
      setFormPathName('');
      setFormPathWidth(drawWidthMultiplier);
      (window as any).__pendingPathWaypoints = wps;
      (window as any).__pendingPathDrawType =
        (tool === 'river_draw') ? activeRiverType : activePathType;
      setPanel('new_path');
    }
    forceUpdate();
  }, [tool, activeRiverType, activePathType, drawWidthMultiplier]);

  // Keyboard: Escape to cancel, Enter to finish path
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (isDrawingPath.current) {
          isDrawingPath.current = false;
          pathWaypointsRef.current = [];
          forceUpdate();
        }
        if (isSelecting.current) {
          isSelecting.current = false;
          regionCellsRef.current.clear();
          forceUpdate();
        }
        if (panel === 'new_path' || panel === 'new_loc') {
          setPanel('none');
        }
      }
      if (e.key === 'Enter' && isDrawingPath.current) {
        finalizePath();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panel, finalizePath]);

  // When tool changes, finalize any in-progress path
  useEffect(() => {
    // This runs after tool state updates; if drawing was in progress, finish it
    if (!isDrawingPath.current) return;
    if (tool !== 'path_draw' && tool !== 'river_draw') {
      finalizePath();
    }
  }, [tool, finalizePath]);

  // ── Load terrain + locations + paths when context changes ──────────────────

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const sid = await ensureStory();
        const ctxId = contextId || null;
        const [terrainData, locs, pathData] = await Promise.all([
          api.terrain.get(sid, ctxId),
          api.locations.listRoot(sid),   // for root; could filter by parent
          api.paths.list(sid, ctxId),
        ]);

        if (cancelled) return;

        if (terrainData) {
          const t = terrainData.terrainData;
          terrainRef.current = t;
          setTerrain(t);
        } else {
          const empty = emptyTerrain(cols, rows);
          terrainRef.current = empty;
          setTerrain(empty);
        }

        // Filter locations to include only those whose contextId matches
        setLocations(locs.filter(l => {
          const locCtx = l.parentId ?? '';
          return locCtx === (contextId || '');
        }));
        setPaths(pathData);
      } catch (e) {
        console.error('WorldMapEditor: load error', e);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [contextId, storyId, ensureStory]);

  // ── Draw ──────────────────────────────────────────────────────────────────

  useLayoutEffect(() => {
    drawRef.current = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

      // 0. Background reference image
      if (showBg && bgImageRef.current) {
        ctx.save();
        ctx.globalAlpha = bgOpacity;
        ctx.drawImage(bgImageRef.current, 0, 0, CANVAS_W, CANVAS_H);
        ctx.restore();
      }

      const t = terrainRef.current || emptyTerrain(cols, rows);
      const terrainAlpha = (showBg && bgImageRef.current) ? 0.55 : 1;

      // 1. Terrain fill
      ctx.save();
      ctx.globalAlpha = terrainAlpha;
      for (let cy = 0; cy < rows; cy++) {
        for (let cx = 0; cx < cols; cx++) {
          const key = (t[getIdx(cx, cy, cols)] ?? ' ') as TerrainKey;
          if (key === ' ') continue;  // skip clear — let background show through
          ctx.fillStyle = TERRAIN[key]?.color ?? TERRAIN[' '].color;
          ctx.fillRect(cx * cellW, cy * cellH, cellW, cellH);
        }
      }
      ctx.restore();

      // 2. Grid lines
      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      ctx.lineWidth = 0.5;
      if (cellW >= 12) {
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
      } else {
        // Major lines only (every 10 cells)
        ctx.beginPath();
        for (let cx = 0; cx <= cols; cx += 10) {
          ctx.moveTo(cx * cellW, 0);
          ctx.lineTo(cx * cellW, CANVAS_H);
        }
        for (let cy = 0; cy <= rows; cy += 10) {
          ctx.moveTo(0, cy * cellH);
          ctx.lineTo(CANVAS_W, cy * cellH);
        }
        ctx.stroke();
      }

      // 3. Location overlays
      locations.forEach((loc, i) => {
        const color = LOC_FILL_COLORS[i % LOC_FILL_COLORS.length];
        ctx.fillStyle = color;
        const cells = loc.cells ?? [];
        if (cells.length > 0) {
          cells.forEach(({ x, y }) => {
            ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
          });

          // Draw region outline: stroke edges where a cell borders a non-member cell or grid boundary
          const cellSet = new Set(cells.map(c => `${c.x},${c.y}`));
          const isSelected = loc.id === selectedLocId;
          ctx.save();
          ctx.strokeStyle = isSelected
            ? SELECTED_OUTLINE_COLOR
            : LOC_OUTLINE_COLORS[i % LOC_OUTLINE_COLORS.length];
          ctx.lineWidth = isSelected ? 2.5 : 1.5;
          ctx.setLineDash([]);
          ctx.beginPath();
          cells.forEach(({ x, y }) => {
            const px = x * cellW;
            const py = y * cellH;
            // top edge
            if (!cellSet.has(`${x},${y - 1}`)) { ctx.moveTo(px, py); ctx.lineTo(px + cellW, py); }
            // bottom edge
            if (!cellSet.has(`${x},${y + 1}`)) { ctx.moveTo(px, py + cellH); ctx.lineTo(px + cellW, py + cellH); }
            // left edge
            if (!cellSet.has(`${x - 1},${y}`)) { ctx.moveTo(px, py); ctx.lineTo(px, py + cellH); }
            // right edge
            if (!cellSet.has(`${x + 1},${y}`)) { ctx.moveTo(px + cellW, py); ctx.lineTo(px + cellW, py + cellH); }
          });
          ctx.stroke();
          ctx.restore();
        }
        // Label on the first cell
        if (cells.length > 0) {
          const fc = cells[0];
          ctx.save();
          ctx.font = `bold ${Math.max(8, Math.min(11, cellH * 0.7))}px sans-serif`;
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.shadowColor = 'rgba(0,0,0,0.7)';
          ctx.shadowBlur = 3;
          ctx.fillText(loc.name, fc.x * cellW + 2, fc.y * cellH + cellH * 0.75);
          ctx.restore();
        }
      });

      // 4. Paths & Rivers
      paths.forEach(p => {
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

      // 5. In-progress path/river
      const liveWps = pathWaypointsRef.current;
      if (liveWps.length > 0) {
        const currentDrawType = tool === 'river_draw' ? activeRiverType : activePathType;
        const style = ALL_DRAW_STYLES[currentDrawType] ?? PATH_STYLES.paved;
        ctx.save();
        ctx.strokeStyle = style.color;
        ctx.lineWidth = style.width * drawWidthMultiplier;
        ctx.setLineDash([4, 4]);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        liveWps.forEach((wp, idx) => {
          const px = (wp.x + 0.5) * cellW;
          const py = (wp.y + 0.5) * cellH;
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        const hov = hoverCellRef.current;
        if (hov) ctx.lineTo((hov.x + 0.5) * cellW, (hov.y + 0.5) * cellH);
        ctx.stroke();
        ctx.restore();
      }

      // 6. Region paint highlight
      const regionCells = regionCellsRef.current;
      if (regionCells.size > 0) {
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,100,0.2)';
        ctx.strokeStyle = 'rgba(255,255,100,0.7)';
        ctx.lineWidth = 1;
        regionCells.forEach(key => {
          const [cx, cy] = key.split(',').map(Number);
          ctx.fillRect(cx * cellW, cy * cellH, cellW, cellH);
          ctx.strokeRect(cx * cellW, cy * cellH, cellW, cellH);
        });
        ctx.restore();
      }

      // 7. Hover highlight
      const hov = hoverCellRef.current;
      if (hov) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(hov.x * cellW + 0.5, hov.y * cellH + 0.5, cellW - 1, cellH - 1);
        ctx.restore();
      }
    };

    drawRef.current();
  }); // runs after every render — no deps needed

  // Also redraw when terrain state changes (from DB load)
  useEffect(() => {
    terrainRef.current = terrain;
    drawRef.current();
  }, [terrain]);

  // ── Save terrain (debounced) ───────────────────────────────────────────────

  const scheduleSave = useCallback((newTerrain: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        const sid = await ensureStory();
        await api.terrain.save({
          projectId: sid,
          contextId: contextId || null,
          cols,
          rows,
          terrainData: newTerrain,
        });
      } catch (e) {
        console.error('terrain save failed', e);
      }
    }, SAVE_DEBOUNCE_MS);
  }, [storyId, ensureStory, contextId, cols, rows]);

  // ── Canvas event helpers ───────────────────────────────────────────────────

  function getCellFromEvent(e: React.MouseEvent<HTMLCanvasElement>): Pt {
    const rect = canvasRef.current!.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    const cx = Math.floor(((e.clientX - rect.left) * scaleX) / cellW);
    const cy = Math.floor(((e.clientY - rect.top) * scaleY) / cellH);
    return {
      x: Math.max(0, Math.min(cols - 1, cx)),
      y: Math.max(0, Math.min(rows - 1, cy)),
    };
  }

  // ── Mouse handlers ────────────────────────────────────────────────────────

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    e.preventDefault();   // prevent browser drag/selection (fixes selection offset bug)
    const cell = getCellFromEvent(e);
    hoverCellRef.current = cell;

    if (tool === 'terrain_paint') {
      isPainting.current = true;
      const bs = brushSize;
      const newT = bs === 1
        ? paintCell(terrainRef.current, cell.x, cell.y, cols, rows, activeTerrain)
        : paintRect(terrainRef.current, cell.x - Math.floor(bs/2), cell.y - Math.floor(bs/2),
                    cell.x + Math.floor(bs/2), cell.y + Math.floor(bs/2), cols, rows, activeTerrain);
      terrainRef.current = newT;
      drawRef.current();
      return;
    }

    if (tool === 'region_select') {
      isSelecting.current = true;
      regionCellsRef.current = new Set([`${cell.x},${cell.y}`]);
      forceUpdate();
      return;
    }

    if (tool === 'path_draw' || tool === 'river_draw') {
      if (!isDrawingPath.current) {
        isDrawingPath.current = true;
        pathWaypointsRef.current = [cell];
      } else {
        pathWaypointsRef.current = [...pathWaypointsRef.current, cell];
      }
      forceUpdate();
      return;
    }

    if (tool === 'select') {
      // Check if click is inside a location's cells
      const clicked = locations.find(loc =>
        (loc.cells ?? []).some(c => c.x === cell.x && c.y === cell.y)
      );
      if (clicked) {
        setSelectedLocId(clicked.id);
        setFormName(clicked.name);
        setFormDesc(clicked.description);
        setFormSubCols(clicked.cols || 20);
        setFormSubRows(clicked.rows || 15);
        setPanel('edit_loc');
      } else {
        const clickedPath = paths.find(p => {
          const wps = p.waypoints ?? [];
          return wps.some(w => w.x === cell.x && w.y === cell.y);
        });
        if (clickedPath) {
          setSelectedPathId(clickedPath.id);
          setFormPathName(clickedPath.name);
          setFormPathType(clickedPath.pathType);
          setFormPathWidth(clickedPath.widthMultiplier ?? 1);
          setPanel('edit_path');
        } else {
          setSelectedLocId(null);
          setSelectedPathId(null);
          setPanel('none');
        }
      }
    }
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const cell = getCellFromEvent(e);
    hoverCellRef.current = cell;

    // Cancel edge-grace timer when cursor returns to canvas
    if (edgeGraceRef.current) {
      clearTimeout(edgeGraceRef.current);
      edgeGraceRef.current = null;
    }

    if (tool === 'terrain_paint' && isPainting.current) {
      const bs = brushSize;
      const newT = bs === 1
        ? paintCell(terrainRef.current, cell.x, cell.y, cols, rows, activeTerrain)
        : paintRect(terrainRef.current, cell.x - Math.floor(bs/2), cell.y - Math.floor(bs/2),
                    cell.x + Math.floor(bs/2), cell.y + Math.floor(bs/2), cols, rows, activeTerrain);
      terrainRef.current = newT;
    }

    if (tool === 'region_select' && isSelecting.current) {
      regionCellsRef.current.add(`${cell.x},${cell.y}`);
    }

    forceUpdate(); // triggers re-render → useLayoutEffect updates drawRef closure + draws
  }

  function handleMouseUp() {
    if (tool === 'terrain_paint' && isPainting.current) {
      isPainting.current = false;
      const committed = terrainRef.current;
      setTerrain(committed);
      scheduleSave(committed);
    }

    if (tool === 'region_select' && isSelecting.current) {
      isSelecting.current = false;
      const cellSet = regionCellsRef.current;
      if (cellSet.size > 0) {
        const cells = Array.from(cellSet).map(s => {
          const [x, y] = s.split(',').map(Number);
          return { x, y };
        });
        regionCellsRef.current = new Set();
        setPendingCells(cells);
        setFormName('');
        setFormDesc('');
        setFormSubCols(20);
        setFormSubRows(15);
        setPanel('new_loc');
      }
    }
  }

  function handleDoubleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if ((tool === 'path_draw' || tool === 'river_draw') && isDrawingPath.current) {
      e.preventDefault();
      finalizePath();
    }
  }

  // ── Location drill-down ────────────────────────────────────────────────────

  function handleZoomInto(loc: MapNode) {
    setBreadcrumb(prev => [
      ...prev,
      {
        contextId: loc.id,
        name: loc.name,
        cols: loc.cols || 20,
        rows: loc.rows || 15,
      },
    ]);
    setPanel('none');
    regionCellsRef.current = new Set();
  }

  function handleBreadcrumbNav(idx: number) {
    setBreadcrumb(prev => prev.slice(0, idx + 1));
    setPanel('none');
    regionCellsRef.current = new Set();
  }

  // ── Save handlers ──────────────────────────────────────────────────────────

  async function handleSaveNewLoc() {
    if (!formName.trim()) return;
    try {
      const sid = await ensureStory();
      const created = await api.locations.create({
        projectId: sid,
        parentId: contextId || null,
        name: formName.trim(),
        description: formDesc,
        cells: pendingCells,
        cols: formSubCols,
        rows: formSubRows,
        level: breadcrumb.length as any,
        gridX: pendingCells[0]?.x ?? 0,
        gridY: pendingCells[0]?.y ?? 0,
        regionType: '',
        races: [],
        politicalNotes: '',
        connections: {},
      });
      setLocations(prev => [...prev, created]);
      regionCellsRef.current = new Set();
      setPanel('none');
    } catch (e) {
      console.error('create location failed', e);
    }
  }

  async function handleUpdateLoc() {
    if (!selectedLocId || !formName.trim()) return;
    try {
      const updated = await api.locations.update(selectedLocId, {
        name: formName.trim(),
        description: formDesc,
        cols: formSubCols,
        rows: formSubRows,
      });
      setLocations(prev => prev.map(l => l.id === selectedLocId ? updated : l));
      setPanel('none');
    } catch (e) {
      console.error('update location failed', e);
    }
  }

  async function handleDeleteLoc() {
    if (!selectedLocId) return;
    try {
      await api.locations.delete(selectedLocId);
      setLocations(prev => prev.filter(l => l.id !== selectedLocId));
      setSelectedLocId(null);
      setPanel('none');
    } catch (e) {
      console.error('delete location failed', e);
    }
  }

  async function handleSaveNewPath() {
    if (!formPathName.trim()) return;
    const wps: Pt[] = (window as any).__pendingPathWaypoints ?? [];
    if (wps.length < 2) { setPanel('none'); return; }
    const drawType: MapPathType = (window as any).__pendingPathDrawType ?? activePathType;
    try {
      const sid = await ensureStory();
      const created = await api.paths.create({
        projectId: sid,
        contextId: contextId,
        name: formPathName.trim(),
        pathType: drawType,
        waypoints: wps,
        widthMultiplier: formPathWidth,
      });
      setPaths(prev => [...prev, created]);
      setPanel('none');
    } catch (e) {
      console.error('create path failed', e);
    }
  }

  async function handleDeletePath() {
    if (!selectedPathId) return;
    try {
      await api.paths.delete(selectedPathId);
      setPaths(prev => prev.filter(p => p.id !== selectedPathId));
      setSelectedPathId(null);
      setPanel('none');
    } catch (e) {
      console.error('delete path failed', e);
    }
  }

  async function handleUpdatePath() {
    if (!selectedPathId || !formPathName.trim()) return;
    try {
      const updated = await api.paths.update(selectedPathId, {
        name: formPathName.trim(),
        pathType: formPathType,
        widthMultiplier: formPathWidth,
      });
      setPaths(prev => prev.map(p => p.id === selectedPathId ? updated : p));
      setPanel('none');
    } catch (e) {
      console.error('update path failed', e);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const selectedLoc = locations.find(l => l.id === selectedLocId) ?? null;
  const selectedPath = paths.find(p => p.id === selectedPathId) ?? null;

  return (
    <div className="wme-root">
      {/* Toolbar */}
      <div className="wme-toolbar">
        <div className="wme-tools">
          <button
            className={`wme-tool-btn${tool === 'terrain_paint' ? ' active' : ''}`}
            onClick={() => setTool('terrain_paint')}
            title="Paint terrain"
          >
            🖌 Terrain
          </button>
          <button
            className={`wme-tool-btn${tool === 'region_select' ? ' active' : ''}`}
            onClick={() => setTool('region_select')}
            title="Select region to create a location"
          >
            ⬛ Region
          </button>
          <button
            className={`wme-tool-btn${tool === 'river_draw' ? ' active' : ''}`}
            onClick={() => setTool('river_draw')}
            title="Draw a river (click waypoints, double-click to finish, Esc to cancel)"
          >
            🌊 River
          </button>
          <button
            className={`wme-tool-btn${tool === 'path_draw' ? ' active' : ''}`}
            onClick={() => setTool('path_draw')}
            title="Draw a path (click waypoints, double-click to finish, Esc to cancel)"
          >
            〰 Path
          </button>
          <button
            className={`wme-tool-btn${tool === 'select' ? ' active' : ''}`}
            onClick={() => setTool('select')}
            title="Select and edit features"
          >
            ✥ Select
          </button>
          <span className="wme-tool-sep" />
          <button
            className={`wme-tool-btn wme-bg-toggle${showBg ? ' active' : ''}`}
            onClick={() => setShowBg(v => !v)}
            title="Toggle reference image"
          >
            🗺 Ref
          </button>
          {onViewMap && (
            <>
              <span className="wme-tool-sep" />
              <button
                className="wme-tool-btn wme-view-btn"
                onClick={onViewMap}
                title="View finished map"
              >
                👁 View Map
              </button>
            </>
          )}
        </div>

        {/* Breadcrumb */}
        <div className="wme-breadcrumb">
          {breadcrumb.map((b, i) => (
            <span key={b.contextId + i}>
              {i > 0 && <span className="wme-crumb-sep">›</span>}
              <button
                className={`wme-crumb-btn${i === breadcrumb.length - 1 ? ' current' : ''}`}
                onClick={() => handleBreadcrumbNav(i)}
                disabled={i === breadcrumb.length - 1}
              >
                {b.name}
              </button>
            </span>
          ))}
        </div>

        <div className="wme-grid-info">
          {cols}×{rows} ({cellW.toFixed(0)}px/cell)
        </div>
      </div>

      {/* Body */}
      <div className="wme-body">
        {/* Left panel */}
        <div className="wme-left-panel">
          {tool === 'terrain_paint' && (
            <>
              <div className="wme-panel-heading">Terrain</div>
              <div className="wme-terrain-palette">
                {(Object.entries(TERRAIN) as [TerrainKey, typeof TERRAIN[TerrainKey]][])
                  .filter(([k]) => k !== ' ')
                  .map(([key, info]) => (
                    <button
                      key={key}
                      className={`wme-terrain-btn${activeTerrain === key ? ' active' : ''}`}
                      style={{ '--terrain-color': info.color } as React.CSSProperties}
                      onClick={() => setActiveTerrain(key)}
                      title={info.label}
                    >
                      {info.label}
                    </button>
                  ))}
              </div>
              <div className="wme-panel-heading" style={{ marginTop: 12 }}>Brush Size</div>
              <div className="wme-brush-row">
                {([1, 2, 3] as const).map(bs => (
                  <button
                    key={bs}
                    className={`wme-brush-btn${brushSize === bs ? ' active' : ''}`}
                    onClick={() => setBrushSize(bs)}
                  >
                    {bs}×{bs}
                  </button>
                ))}
              </div>
            </>
          )}

          {tool === 'river_draw' && (
            <>
              <div className="wme-panel-heading">River Type</div>
              {(Object.entries(RIVER_STYLES) as [string, DrawStyle][]).map(([type, info]) => (
                <button
                  key={type}
                  className={`wme-path-type-btn${activeRiverType === type ? ' active' : ''}`}
                  style={{ '--path-color': info.color } as React.CSSProperties}
                  onClick={() => setActiveRiverType(type as RiverType)}
                >
                  {info.label}
                </button>
              ))}
              <div className="wme-panel-heading" style={{ marginTop: 12 }}>Width ({drawWidthMultiplier.toFixed(1)}×)</div>
              <input
                type="range"
                className="wme-opacity-slider"
                min={0.5} max={4} step={0.5}
                value={drawWidthMultiplier}
                onChange={e => setDrawWidthMultiplier(parseFloat(e.target.value))}
              />
              {isDrawingPath.current ? (
                <>
                  <div className="wme-hint">Click to add waypoints.<br />Double-click to finish.<br />Esc to cancel.</div>
                  <button className="wme-btn danger" style={{ marginTop: 8 }} onClick={() => {
                    isDrawingPath.current = false;
                    pathWaypointsRef.current = [];
                    forceUpdate();
                  }}>Cancel Drawing</button>
                </>
              ) : (
                <div className="wme-hint">Click on the map to start drawing.</div>
              )}
            </>
          )}

          {tool === 'path_draw' && (
            <>
              <div className="wme-panel-heading">Path Type</div>
              {(Object.entries(PATH_STYLES) as [string, DrawStyle][]).map(([type, info]) => (
                <button
                  key={type}
                  className={`wme-path-type-btn${activePathType === type ? ' active' : ''}`}
                  style={{ '--path-color': info.color } as React.CSSProperties}
                  onClick={() => setActivePathType(type as MapPathType)}
                >
                  {info.label}
                </button>
              ))}
              <div className="wme-panel-heading" style={{ marginTop: 12 }}>Width ({drawWidthMultiplier.toFixed(1)}×)</div>
              <input
                type="range"
                className="wme-opacity-slider"
                min={0.5} max={4} step={0.5}
                value={drawWidthMultiplier}
                onChange={e => setDrawWidthMultiplier(parseFloat(e.target.value))}
              />
              {isDrawingPath.current ? (
                <>
                  <div className="wme-hint">Click to add waypoints.<br />Double-click to finish.<br />Esc to cancel.</div>
                  <button className="wme-btn danger" style={{ marginTop: 8 }} onClick={() => {
                    isDrawingPath.current = false;
                    pathWaypointsRef.current = [];
                    forceUpdate();
                  }}>Cancel Drawing</button>
                </>
              ) : (
                <div className="wme-hint">Click on the map to start drawing.</div>
              )}
            </>
          )}

          {/* Reference Image Opacity */}
          {showBg && (tool === 'terrain_paint' || tool === 'region_select') && (
            <>
              <div className="wme-panel-heading" style={{ marginTop: 16 }}>Reference Opacity</div>
              <input
                type="range"
                className="wme-opacity-slider"
                min={0} max={1} step={0.05}
                value={bgOpacity}
                onChange={e => setBgOpacity(parseFloat(e.target.value))}
              />
              <div className="wme-opacity-val">{Math.round(bgOpacity * 100)}%</div>
            </>
          )}

          {/* Locations list */}
          {locations.length > 0 && (
            <>
              <div className="wme-panel-heading" style={{ marginTop: 16 }}>Locations</div>
              <ul className="wme-feature-list">
                {locations.map((loc, i) => (
                  <li
                    key={loc.id}
                    className={`wme-feature-item${selectedLocId === loc.id ? ' selected' : ''}`}
                    style={{ '--loc-color': LOC_FILL_COLORS[i % LOC_FILL_COLORS.length] } as React.CSSProperties}
                    onClick={() => {
                      setSelectedLocId(loc.id);
                      setFormName(loc.name);
                      setFormDesc(loc.description);
                      setFormSubCols(loc.cols || 20);
                      setFormSubRows(loc.rows || 15);
                      setPanel('edit_loc');
                    }}
                  >
                    {loc.name}
                  </li>
                ))}
              </ul>
            </>
          )}

          {/* Paths list */}
          {paths.filter(p => !(p.pathType in RIVER_STYLES)).length > 0 && (
            <>
              <div className="wme-panel-heading" style={{ marginTop: 16 }}>Paths</div>
              <ul className="wme-feature-list">
                {paths.filter(p => !(p.pathType in RIVER_STYLES)).map(p => (
                  <li
                    key={p.id}
                    className={`wme-feature-item${selectedPathId === p.id ? ' selected' : ''}`}
                    onClick={() => {
                      setSelectedPathId(p.id);
                      setFormPathName(p.name);
                      setPanel('edit_path');
                    }}
                  >
                    <span className="wme-path-dot" style={{ background: ALL_DRAW_STYLES[p.pathType]?.color }} />
                    {p.name}
                  </li>
                ))}
              </ul>
            </>
          )}

          {/* Rivers list */}
          {paths.filter(p => p.pathType in RIVER_STYLES).length > 0 && (
            <>
              <div className="wme-panel-heading" style={{ marginTop: 16 }}>Rivers</div>
              <ul className="wme-feature-list">
                {paths.filter(p => p.pathType in RIVER_STYLES).map(p => (
                  <li
                    key={p.id}
                    className={`wme-feature-item${selectedPathId === p.id ? ' selected' : ''}`}
                    onClick={() => {
                      setSelectedPathId(p.id);
                      setFormPathName(p.name);
                      setPanel('edit_path');
                    }}
                  >
                    <span className="wme-path-dot" style={{ background: ALL_DRAW_STYLES[p.pathType]?.color }} />
                    {p.name}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* Canvas */}
        <div className="wme-canvas-area">
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            className="wme-canvas"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => {
              hoverCellRef.current = null;
              // Edge grace: delay finalization so user can draw to map edges
              if (isDrawingPath.current) {
                edgeGraceRef.current = setTimeout(() => {
                  edgeGraceRef.current = null;
                  if (isDrawingPath.current) finalizePath();
                }, 1500);
              }
              forceUpdate();
            }}
            onDoubleClick={handleDoubleClick}
            onContextMenu={e => e.preventDefault()}
          />
        </div>

        {/* Right panel */}
        {panel !== 'none' && (
          <div className="wme-right-panel">
            {panel === 'new_loc' && (
              <>
                <div className="wme-rp-heading">New Location</div>
                <div className="wme-rp-hint">{pendingCells.length} cells selected</div>
                <label className="wme-rp-label">Name</label>
                <input
                  className="wme-rp-input"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="Location name"
                  autoFocus
                />
                <label className="wme-rp-label">Description</label>
                <textarea
                  className="wme-rp-textarea"
                  value={formDesc}
                  onChange={e => setFormDesc(e.target.value)}
                  placeholder="Describe this location..."
                  rows={4}
                />
                <label className="wme-rp-label">Sub-grid Size</label>
                <div className="wme-rp-row">
                  <span>Cols</span>
                  <input
                    type="number"
                    className="wme-rp-num"
                    min={4} max={200}
                    value={formSubCols}
                    onChange={e => setFormSubCols(parseInt(e.target.value) || 20)}
                  />
                  <span>Rows</span>
                  <input
                    type="number"
                    className="wme-rp-num"
                    min={4} max={200}
                    value={formSubRows}
                    onChange={e => setFormSubRows(parseInt(e.target.value) || 15)}
                  />
                </div>
                <div className="wme-rp-actions">
                  <button className="wme-btn primary" onClick={handleSaveNewLoc}>Create</button>
                  <button className="wme-btn" onClick={() => { setPanel('none'); regionCellsRef.current = new Set(); }}>Cancel</button>
                </div>
              </>
            )}

            {panel === 'edit_loc' && selectedLoc && (
              <>
                <div className="wme-rp-heading">Edit Location</div>
                <label className="wme-rp-label">Name</label>
                <input
                  className="wme-rp-input"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                />
                <label className="wme-rp-label">Description</label>
                <textarea
                  className="wme-rp-textarea"
                  value={formDesc}
                  onChange={e => setFormDesc(e.target.value)}
                  rows={4}
                />
                <label className="wme-rp-label">Sub-grid Size</label>
                <div className="wme-rp-row">
                  <span>Cols</span>
                  <input
                    type="number"
                    className="wme-rp-num"
                    min={4} max={200}
                    value={formSubCols}
                    onChange={e => setFormSubCols(parseInt(e.target.value) || 20)}
                  />
                  <span>Rows</span>
                  <input
                    type="number"
                    className="wme-rp-num"
                    min={4} max={200}
                    value={formSubRows}
                    onChange={e => setFormSubRows(parseInt(e.target.value) || 15)}
                  />
                </div>
                <div className="wme-rp-actions">
                  <button className="wme-btn primary" onClick={handleUpdateLoc}>Save</button>
                  <button
                    className="wme-btn primary"
                    style={{ background: '#2a6b9a' }}
                    onClick={() => handleZoomInto(selectedLoc)}
                  >
                    Zoom In →
                  </button>
                  <button className="wme-btn danger" onClick={handleDeleteLoc}>Delete</button>
                  <button className="wme-btn" onClick={() => setPanel('none')}>Close</button>
                </div>
              </>
            )}

            {panel === 'new_path' && (
              <>
                <div className="wme-rp-heading">
                  New {ALL_DRAW_STYLES[(window as any).__pendingPathDrawType]?.label ?? 'Path'}
                </div>
                <div className="wme-rp-hint">{((window as any).__pendingPathWaypoints as Pt[])?.length ?? 0} waypoints</div>
                <label className="wme-rp-label">Name</label>
                <input
                  className="wme-rp-input"
                  value={formPathName}
                  onChange={e => setFormPathName(e.target.value)}
                  placeholder={`e.g. The King's Road`}
                  autoFocus
                />
                <label className="wme-rp-label">Width ({formPathWidth.toFixed(1)}×)</label>
                <input
                  type="range"
                  className="wme-opacity-slider"
                  min={0.5} max={4} step={0.5}
                  value={formPathWidth}
                  onChange={e => setFormPathWidth(parseFloat(e.target.value))}
                />
                <div className="wme-rp-actions">
                  <button className="wme-btn primary" onClick={handleSaveNewPath}>Save</button>
                  <button className="wme-btn" onClick={() => setPanel('none')}>Cancel</button>
                </div>
              </>
            )}

            {panel === 'edit_path' && selectedPath && (
              <>
                <div className="wme-rp-heading">Edit Path / River</div>
                <label className="wme-rp-label">Name</label>
                <input
                  className="wme-rp-input"
                  value={formPathName}
                  onChange={e => setFormPathName(e.target.value)}
                />
                <label className="wme-rp-label">Type</label>
                <select
                  className="wme-rp-input"
                  value={formPathType}
                  onChange={e => setFormPathType(e.target.value as MapPathType)}
                >
                  {(Object.entries(ALL_DRAW_STYLES) as [string, DrawStyle][]).map(([key, s]) => (
                    <option key={key} value={key}>{s.label}</option>
                  ))}
                </select>
                <label className="wme-rp-label">Width ({formPathWidth.toFixed(1)}×)</label>
                <input
                  type="range"
                  className="wme-opacity-slider"
                  min={0.5} max={4} step={0.5}
                  value={formPathWidth}
                  onChange={e => setFormPathWidth(parseFloat(e.target.value))}
                />
                <div className="wme-rp-hint">{selectedPath.waypoints?.length ?? 0} waypoints</div>
                <div className="wme-rp-actions">
                  <button className="wme-btn primary" onClick={handleUpdatePath}>Save</button>
                  <button className="wme-btn danger" onClick={handleDeletePath}>Delete</button>
                  <button className="wme-btn" onClick={() => setPanel('none')}>Close</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
