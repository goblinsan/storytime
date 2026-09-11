import { useMemo } from 'react';

/**
 * Choosing a place, out of a tree.
 *
 * Places are nested -- a chamber inside a hulk inside a system -- and a select
 * that lists them flat makes "Bio-Coolant Necro-Lab" a peer of "The Corporate
 * Rim". Thirty of them in one flat column is a list nobody can find anything
 * in, and worse, it hides the fact that two of the options are two rooms of
 * the same ship.
 *
 * The bestiary worked this out and the technologies surface then took the
 * widget without the reasoning, which is how the same payload came to be drawn
 * two different ways on two tabs. It is one component now.
 *
 * Depth is computed from the tree rather than read from `level`, which is 0 on
 * every row in the universe this was built against and would render thirty
 * places flat -- the exact bug, arriving by a different route.
 */
export interface PlaceOption {
  id: string;
  name: string;
  parentId: string | null;
}

export default function PlaceSelect({
  id, className, value, places, disabled, none, exclude, onChange,
}: {
  id: string;
  className: string;
  value: string;
  places: PlaceOption[];
  disabled?: boolean;
  /** What the empty choice says. "Not recorded", "Choose a place…". */
  none: string;
  /** Places already spoken for, left out of the list. */
  exclude?: Set<string>;
  onChange: (locationId: string) => void;
}) {
  const rows = useMemo(() => {
    const known = new Set(places.map((p) => p.id));
    const parent = new Map(places.map((p) => [p.id, p.parentId]));

    const depth = new Map<string, number>();
    const measure = (placeId: string, seen: Set<string>): number => {
      if (depth.has(placeId)) return depth.get(placeId)!;
      const up = parent.get(placeId);
      // A cycle would otherwise hang the page. Canon has had stranger shapes.
      const d = !up || !known.has(up) || seen.has(up)
        ? 0
        : measure(up, new Set(seen).add(up)) + 1;
      depth.set(placeId, d);
      return d;
    };
    for (const p of places) measure(p.id, new Set([p.id]));

    const byName = [...places].sort((a, b) => a.name.localeCompare(b.name));
    const children = new Map<string, PlaceOption[]>();
    const roots: PlaceOption[] = [];
    for (const p of byName) {
      if (!p.parentId || !known.has(p.parentId)) { roots.push(p); continue; }
      if (!children.has(p.parentId)) children.set(p.parentId, []);
      children.get(p.parentId)!.push(p);
    }

    const out: Array<PlaceOption & { depth: number }> = [];
    const walk = (row: PlaceOption, seen: Set<string>) => {
      if (seen.has(row.id)) return;
      out.push({ ...row, depth: depth.get(row.id) ?? 0 });
      for (const child of children.get(row.id) ?? []) walk(child, new Set(seen).add(row.id));
    };
    for (const root of roots) walk(root, new Set());
    return out;
  }, [places]);

  return (
    <select
      id={id}
      className={className}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{none}</option>
      {rows
        .filter((p) => !exclude?.has(p.id))
        .map((p) => (
          <option key={p.id} value={p.id}>
            {`${'  '.repeat(p.depth)}${p.name}`}
          </option>
        ))}
    </select>
  );
}
