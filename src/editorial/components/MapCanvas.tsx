import { useCallback, useRef, useState } from 'react';
import type { MapPin } from '../api';

/**
 * A drawing with places on it.
 *
 * EVERY POSITION IS A FRACTION
 * A pin is stored as a fraction of the image and converted to pixels only for
 * paint. Pixels would be a position on one rendering of one file: replace the
 * map with a wider one, open the page on a phone, and every pin is somewhere
 * else. Fractions survive all of that, which is what makes "here is a better
 * map of the same place" a thing you can do without losing the work.
 *
 * IT WORKS WITHOUT A MOUSE
 * Every act here is positional -- put this there, move that -- and the first
 * version could only be driven by clicking, which meant a keyboard could read
 * the map and change nothing on it. A focused pin moves under the arrow keys,
 * a tenth of a percent at a time and a whole percent with shift, and a place
 * waiting to go down can be dropped in the middle and walked from there. The
 * new position is spoken, because a nudge nobody can see is a nudge nobody can
 * aim.
 *
 * A PROPOSED PIN LOOKS PROPOSED
 * An agent's guess is drawn hollow and dashed and says so. The failure this
 * surface has to avoid is a picture that looks authoritative about a position
 * nobody chose, and the way that failure happens is a guess rendered exactly
 * like a decision.
 */
export interface MapCanvasProps {
  url: string;
  alt: string;
  pins: MapPin[];
  /** The pin being looked at, drawn raised. */
  activeId?: string | null;
  /** A place waiting to be put down; the next click on the map places it. */
  placing?: { id: string; name: string } | null;
  onMove?: (locationId: string, at: { x: number; y: number }) => void;
  onSelect?: (pin: MapPin) => void;
  /** A click on open ground, in fractions. Null when the map cannot be added to. */
  onOpenGround?: (at: { x: number; y: number }) => void;
}

/** Where in the image a pointer is, as fractions, clamped to the image. */
function fractionAt(el: HTMLElement, clientX: number, clientY: number) {
  const box = el.getBoundingClientRect();
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return {
    x: clamp((clientX - box.left) / box.width),
    y: clamp((clientY - box.top) / box.height),
  };
}

export default function MapCanvas({
  url, alt, pins, activeId, placing, onMove, onSelect, onOpenGround,
}: MapCanvasProps) {
  const frame = useRef<HTMLDivElement>(null);
  // Dragging is held here rather than in state per pin: only one pin moves at
  // a time, and rendering every pin on every pointer move was visibly slow
  // once a map had twenty of them.
  const [dragging, setDragging] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  // Four of this project's maps point at a host that no longer answers, and
  // a broken <img> renders as its alt text in a thin box -- which looks like
  // a layout bug rather than a missing picture. Say which it is.
  const [broken, setBroken] = useState(false);

  const beginDrag = useCallback((pin: MapPin, event: React.PointerEvent) => {
    if (!onMove) return;
    event.preventDefault();
    event.stopPropagation();
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    setDragging(pin.locationId);
  }, [onMove]);

  const duringDrag = useCallback((event: React.PointerEvent) => {
    if (!dragging || !frame.current) return;
    setGhost(fractionAt(frame.current, event.clientX, event.clientY));
  }, [dragging]);

  const endDrag = useCallback((event: React.PointerEvent) => {
    if (!dragging || !frame.current) return;
    const at = fractionAt(frame.current, event.clientX, event.clientY);
    onMove?.(dragging, at);
    setDragging(null);
    setGhost(null);
  }, [dragging, onMove]);

  const [spoken, setSpoken] = useState('');

  /** One step is a percent of the image; shift makes it five. */
  const nudge = useCallback((pin: MapPin, event: React.KeyboardEvent) => {
    const step = (event.shiftKey ? 5 : 1) / 100;
    const by: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
    };
    const move = by[event.key];
    if (!move || !onMove) return;
    event.preventDefault();
    const at = {
      x: Math.min(1, Math.max(0, pin.x + move[0])),
      y: Math.min(1, Math.max(0, pin.y + move[1])),
    };
    onMove(pin.locationId, at);
    setSpoken(`${pin.name} moved to ${Math.round(at.x * 100)} percent across, `
      + `${Math.round(at.y * 100)} percent down.`);
  }, [onMove]);

  const clickGround = useCallback((event: React.MouseEvent) => {
    if (!frame.current || dragging) return;
    // A click that landed on a pin is that pin's, not the ground's.
    if ((event.target as HTMLElement).closest('.editorial-pin')) return;
    onOpenGround?.(fractionAt(frame.current, event.clientX, event.clientY));
  }, [dragging, onOpenGround]);

  return (
    <div
      ref={frame}
      className={`editorial-mapcanvas${placing ? ' editorial-mapcanvas--placing' : ''}`}
      onClick={clickGround}
      onPointerMove={duringDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {broken ? (
        <p className="editorial-mapcanvas__missing">
          {'This drawing did not load. It points at '}
          <code>{new URL(url, window.location.origin).host}</code>
          {', which is not answering. The pins below are still recorded; keeping a '
            + 'new map of this place puts them back on a picture.'}
        </p>
      ) : (
        <img
          className="editorial-mapcanvas__image"
          src={url}
          alt={alt}
          draggable={false}
          onError={() => setBroken(true)}
        />
      )}

      {pins.map((pin) => {
        const at = dragging === pin.locationId && ghost ? ghost : pin;
        return (
          <button
            type="button"
            key={pin.id}
            className={[
              'editorial-button',
              'editorial-pin',
              pin.status === 'proposed' ? 'editorial-pin--proposed' : '',
              activeId === pin.locationId ? 'editorial-pin--active' : '',
              dragging === pin.locationId ? 'editorial-pin--dragging' : '',
            ].filter(Boolean).join(' ')}
            style={{ left: `${at.x * 100}%`, top: `${at.y * 100}%` }}
            onPointerDown={(e) => beginDrag(pin, e)}
            onKeyDown={(e) => nudge(pin, e)}
            onClick={(e) => { e.stopPropagation(); onSelect?.(pin); }}
            // The name is the button's own text, not a title attribute: a pin
            // whose name only exists on hover is a pin a keyboard cannot read.
            aria-label={pin.status === 'proposed'
              ? `${pin.name}, a suggested position`
              : pin.name}
          >
            <span className="editorial-pin__dot" aria-hidden="true" />
            <span className="editorial-pin__name">{pin.name}</span>
          </button>
        );
      })}

      {placing && (
        <p className="editorial-mapcanvas__prompt" role="status">
          {`Click where ${placing.name} belongs, or `}
          <button
            type="button"
            className="editorial-link editorial-mapcanvas__middle"
            onClick={(e) => {
              e.stopPropagation();
              onOpenGround?.({ x: 0.5, y: 0.5 });
            }}
          >
            put it in the middle
          </button>
          {' and move it with the arrow keys.'}
        </p>
      )}

      {/* Where a nudge went. An arrow key that moves something silently is a
          control a screen reader user cannot aim. */}
      <p className="editorial-mapcanvas__spoken" role="status" aria-live="polite">{spoken}</p>
    </div>
  );
}
