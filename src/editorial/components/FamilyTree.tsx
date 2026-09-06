import type { LineageMember } from '../api';

/**
 * A drawn family tree, for one person's immediate generations.
 *
 * The rebuild contract (docs/editorial-ux-rebuild.md 5.1) names this as a core
 * part of the Characters & Family lens and it had never been built: the
 * classes existed in workspace.css and no component rendered them. Lineage was
 * being shown as four comma-separated lines of links, which tells you who is
 * related and nothing about the shape of the family.
 *
 * Laid out arithmetically rather than by measuring the DOM, so it renders the
 * same on the server, in a test and in a browser, and it scales by viewBox
 * rather than by breakpoint. Section 7.1 grants this one component permission
 * to scroll horizontally on mobile; that is why the wrapper, not the svg,
 * carries the overflow.
 */

const NODE_W = 158;
const NODE_H = 46;
const GAP_X = 14;
const GAP_Y = 54;
const PAD = 4;

export interface TreePerson {
  id: string;
  name: string;
  role?: string;
}

interface Placed extends TreePerson {
  x: number;
  y: number;
  kind: 'parent' | 'self' | 'spouse' | 'sibling' | 'child';
}

const rowWidth = (n: number) => n * NODE_W + Math.max(0, n - 1) * GAP_X;

/** Lay a generation out centred on `centre`. */
function spread(people: TreePerson[], centre: number, y: number, kind: Placed['kind']): Placed[] {
  const left = centre - rowWidth(people.length) / 2;
  return people.map((person, i) => ({
    ...person, kind, y, x: left + i * (NODE_W + GAP_X),
  }));
}

export interface FamilyTreeProps {
  self: TreePerson;
  parents: LineageMember[];
  spouses: LineageMember[];
  siblings: LineageMember[];
  children: LineageMember[];
  onChoose: (id: string) => void;
}

const asPerson = (m: LineageMember): TreePerson => ({
  id: String(m.id), name: m.name ?? String(m.id), role: m.role,
});

export default function FamilyTree({
  self, parents, spouses, siblings, children, onChoose,
}: FamilyTreeProps) {
  const hasAny = parents.length || spouses.length || siblings.length || children.length;
  if (!hasAny) return null;

  // The middle generation reads left to right: siblings, the person, partners.
  const middle: TreePerson[] = [
    ...siblings.map(asPerson),
    self,
    ...spouses.map(asPerson),
  ];
  const selfIndex = siblings.length;

  const middleWidth = rowWidth(middle.length);
  const parentWidth = rowWidth(parents.length);
  const childWidth = rowWidth(children.length);
  const width = Math.max(middleWidth, parentWidth, childWidth) + PAD * 2;
  const centre = width / 2;

  const rows: Placed[] = [];
  let y = PAD;
  if (parents.length) {
    rows.push(...spread(parents.map(asPerson), centre, y, 'parent'));
    y += NODE_H + GAP_Y;
  }

  // The middle row is centred on the person, not on itself, so the person stays
  // under their parents however many siblings or partners they have.
  const middleLeft = centre - (selfIndex * (NODE_W + GAP_X)) - NODE_W / 2;
  const middleRow: Placed[] = middle.map((person, i) => ({
    ...person,
    kind: i === selfIndex ? 'self' : (i < selfIndex ? 'sibling' : 'spouse'),
    y,
    x: middleLeft + i * (NODE_W + GAP_X),
  }));
  rows.push(...middleRow);
  const middleY = y;
  y += NODE_H;

  let childRow: Placed[] = [];
  if (children.length) {
    y += GAP_Y;
    childRow = spread(children.map(asPerson), centre, y, 'child');
    rows.push(...childRow);
    y += NODE_H;
  }

  // Nothing is allowed to sit at a negative coordinate; shift the whole tree.
  const minX = Math.min(...rows.map((n) => n.x));
  const shift = minX < PAD ? PAD - minX : 0;
  const placed = rows.map((n) => ({ ...n, x: n.x + shift }));
  const viewWidth = Math.max(width, Math.max(...placed.map((n) => n.x + NODE_W)) + PAD);
  const viewHeight = y + PAD;

  const at = (kind: Placed['kind'], id: string) =>
    placed.find((n) => n.kind === kind && n.id === id);
  const self2 = placed.find((n) => n.kind === 'self')!;
  const selfCx = self2.x + NODE_W / 2;

  const parentBarY = middleY - GAP_Y / 2;
  const childBarY = middleY + NODE_H + GAP_Y / 2;

  return (
    <div className="editorial-family-tree">
      <svg
        className="editorial-family-tree__canvas"
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
        width={viewWidth}
        height={viewHeight}
        role="img"
        aria-label={`Family of ${self.name}: ${parents.length} recorded parents, ${spouses.length} partners, ${siblings.length} siblings, ${children.length} children`}
      >
        <g className="editorial-family-tree__edges">
          {parents.length > 0 && (
            <>
              {placed.filter((n) => n.kind === 'parent').map((p) => (
                <path key={`pe-${p.id}`} d={`M ${p.x + NODE_W / 2} ${p.y + NODE_H} V ${parentBarY}`} />
              ))}
              <path d={`M ${Math.min(...placed.filter((n) => n.kind === 'parent').map((n) => n.x + NODE_W / 2))} ${parentBarY} H ${Math.max(selfCx, ...placed.filter((n) => n.kind === 'parent' || n.kind === 'sibling').map((n) => n.x + NODE_W / 2))}`} />
              <path d={`M ${selfCx} ${parentBarY} V ${middleY}`} />
              {placed.filter((n) => n.kind === 'sibling').map((s) => (
                <path key={`se-${s.id}`} d={`M ${s.x + NODE_W / 2} ${parentBarY} V ${s.y}`} />
              ))}
            </>
          )}

          {placed.filter((n) => n.kind === 'spouse').map((s) => (
            <path
              key={`sp-${s.id}`}
              className="editorial-family-tree__edge--partner"
              d={`M ${self2.x + NODE_W} ${self2.y + NODE_H / 2} H ${s.x}`}
            />
          ))}

          {childRow.length > 0 && (
            <>
              <path d={`M ${selfCx} ${middleY + NODE_H} V ${childBarY}`} />
              <path d={`M ${Math.min(selfCx, ...childRow.map((n) => n.x + shift + NODE_W / 2))} ${childBarY} H ${Math.max(selfCx, ...childRow.map((n) => n.x + shift + NODE_W / 2))}`} />
              {childRow.map((c) => {
                const node = at('child', c.id)!;
                return <path key={`ce-${c.id}`} d={`M ${node.x + NODE_W / 2} ${childBarY} V ${node.y}`} />;
              })}
            </>
          )}
        </g>

        {placed.map((node) => (
          <g key={`${node.kind}-${node.id}`} transform={`translate(${node.x} ${node.y})`}>
            <rect
              className="editorial-family-tree__node"
              data-kind={node.kind}
              width={NODE_W}
              height={NODE_H}
              rx="4"
            />
            <text className="editorial-family-tree__name" x={NODE_W / 2} y="19" textAnchor="middle">
              {node.name.length > 22 ? `${node.name.slice(0, 21)}…` : node.name}
            </text>
            {node.role && (
              <text className="editorial-family-tree__role" x={NODE_W / 2} y="34" textAnchor="middle">
                {node.role.length > 26 ? `${node.role.slice(0, 25)}…` : node.role}
              </text>
            )}
            {node.kind !== 'self' && (
              <rect
                className="editorial-family-tree__hit"
                width={NODE_W}
                height={NODE_H}
                rx="4"
                role="button"
                tabIndex={0}
                aria-label={`Open ${node.name}`}
                onClick={() => onChoose(node.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChoose(node.id); }
                }}
              />
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
