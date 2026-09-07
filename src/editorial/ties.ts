/**
 * Relationships, as one list per person.
 *
 * The canon records the same fact more than once and in more than one
 * vocabulary. Elyse Vane being Solenne's mother is three rows -- `parent`,
 * `parent_of`, and the reciprocal `child_of` -- and every one of them reads
 * "child of Elyse Vane" on Solenne's record, so her record said it three
 * times.
 *
 * That was not only noise. The list keys its items by what they say and who
 * they point at, so three identical readings are three identical keys, and
 * duplicate keys stop React reconciling a list correctly: rows belonging to
 * the person you were just looking at stayed on screen for the person you
 * moved to. Malakor showed eleven relationships after two presses of the
 * browser's back button, and four of them were not his.
 *
 * Deduplicating here fixes both, and is the right place for it: the surface
 * should state a fact once regardless of how many ways the canon spells it.
 * Collapsing the rows in the database is a separate decision, and a
 * destructive one.
 */
export interface Tie {
  otherId: string;
  otherName: string;
  reads: string;
  family: boolean;
}

export interface GraphEdge {
  sourceEntityId: string | number;
  targetEntityId: string | number;
  sourceEntityType?: string;
  targetEntityType?: string;
  relationshipType: string;
}

export const FAMILY_TYPES = new Set(['parent', 'parent_of', 'child_of', 'ancestor', 'spouse',
  'sibling', 'family']);

/**
 * How an edge reads from each end. Both directions are written down rather
 * than inferred, because "ancestor of" does not reverse to "ancestor of".
 */
export const EDGE_LABEL: Record<string, { forward: string; back: string }> = {
  parent: { forward: 'parent of', back: 'child of' },
  parent_of: { forward: 'parent of', back: 'child of' },
  child_of: { forward: 'child of', back: 'parent of' },
  ancestor: { forward: 'ancestor of', back: 'descended from' },
  guardian_of: { forward: 'guardian of', back: 'ward of' },
  spouse: { forward: 'married to', back: 'married to' },
  sibling: { forward: 'sibling of', back: 'sibling of' },
  family: { forward: 'kin of', back: 'kin of' },
  protective_bond: { forward: 'protects', back: 'protected by' },
  // Symmetric on purpose: a likeness runs both ways, and the canon that needs
  // it -- a refugee child who looks like a daughter three centuries dead --
  // has no direction to it. It replaced a protective_bond, which was the only
  // shape available for "these two are connected" and read as a bond between
  // people who never met.
  resemblance: { forward: 'bears a likeness to', back: 'bears a likeness to' },
  hostile: { forward: 'hostile to', back: 'hostile to' },
  feud: { forward: 'feuding with', back: 'feuding with' },
  active_skirmish: { forward: 'in open conflict with', back: 'in open conflict with' },
  cold_war: { forward: 'in cold war with', back: 'in cold war with' },
  trade_war: { forward: 'in trade war with', back: 'in trade war with' },
  uneasy_alliance: { forward: 'uneasily allied with', back: 'uneasily allied with' },
};

export const readEdge = (type: string, forward: boolean) => {
  const known = EDGE_LABEL[type];
  if (known) return forward ? known.forward : known.back;
  return type.replace(/_/g, ' ');
};

/** A tie's identity: what it says, about whom. Two the same are one fact. */
export const tieKey = (tie: Tie) => `${tie.reads} ${tie.otherId}`;

export function buildTies(
  edges: GraphEdge[],
  nameOf: (id: string) => string,
): Map<string, Tie[]> {
  const index = new Map<string, Tie[]>();
  const seen = new Map<string, Set<string>>();

  const add = (owner: string, tie: Tie) => {
    if (!seen.has(owner)) seen.set(owner, new Set());
    const already = seen.get(owner)!;
    const key = tieKey(tie);
    if (already.has(key)) return;
    already.add(key);
    index.set(owner, [...(index.get(owner) ?? []), tie]);
  };

  for (const edge of edges) {
    const [a, b] = [String(edge.sourceEntityId), String(edge.targetEntityId)];
    // A row pointing at itself says nothing, and would render as its own
    // relative on both ends of the same line.
    if (a === b) continue;
    const family = FAMILY_TYPES.has(edge.relationshipType);
    add(a, { otherId: b, otherName: nameOf(b), reads: readEdge(edge.relationshipType, true), family });
    add(b, { otherId: a, otherName: nameOf(a), reads: readEdge(edge.relationshipType, false), family });
  }
  return index;
}
