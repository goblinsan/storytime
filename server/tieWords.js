/**
 * How a recorded relationship reads, and whether it is a quarrel or a side.
 *
 * `active_skirmish` is a column value. "In open conflict with" is what it
 * means, and which of the two ends you are standing on decides whether a
 * `protective_bond` reads "protects" or "protected by".
 *
 * This is the server's copy of a vocabulary the client also keeps, in
 * src/editorial/ties.ts, because a character's ties are assembled in the
 * browser from the graph endpoint and a group's are assembled here. Nothing in
 * this repository imports across that boundary and this is not the change that
 * should start. So the two are held together by a test instead:
 * tieWordsAgree.test.js fails the build if they ever disagree about a kind
 * they both know. Two copies is the compromise; two copies that quietly drift
 * is the bug.
 */
export const EDGE_LABEL = {
  parent: { forward: 'parent of', back: 'child of' },
  parent_of: { forward: 'parent of', back: 'child of' },
  child_of: { forward: 'child of', back: 'parent of' },
  ancestor: { forward: 'ancestor of', back: 'descended from' },
  guardian_of: { forward: 'guardian of', back: 'ward of' },
  spouse: { forward: 'married to', back: 'married to' },
  sibling: { forward: 'sibling of', back: 'sibling of' },
  family: { forward: 'kin of', back: 'kin of' },
  protective_bond: { forward: 'protects', back: 'protected by' },
  resemblance: { forward: 'bears a likeness to', back: 'bears a likeness to' },
  hostile: { forward: 'hostile to', back: 'hostile to' },
  feud: { forward: 'feuding with', back: 'feuding with' },
  active_skirmish: { forward: 'in open conflict with', back: 'in open conflict with' },
  cold_war: { forward: 'in cold war with', back: 'in cold war with' },
  trade_war: { forward: 'in trade war with', back: 'in trade war with' },
  uneasy_alliance: { forward: 'uneasily allied with', back: 'uneasily allied with' },
};

/** An unknown kind reads as its own words rather than not at all. */
export const readEdge = (type, forward) => {
  const known = EDGE_LABEL[type];
  if (known) return forward ? known.forward : known.back;
  return String(type).replace(/_/g, ' ');
};

/**
 * Standing with somebody, rather than against them.
 *
 * Being at war with a group is not belonging to it -- the reason this set
 * exists at all is that reading every edge as allegiance once filed a man
 * under the cartel he is in a feud with. A surface that shows quarrels under
 * one heading has to know which edges are not quarrels.
 */
export const ALIGNED = new Set(['uneasy_alliance', 'allied', 'ally', 'alliance',
  'member_of', 'sworn_to', 'serves', 'loyal_to', 'patron_of', 'protective_bond',
  'guardian_of', 'spouse', 'sibling', 'family', 'parent', 'parent_of', 'child_of',
  'ancestor', 'resemblance']);

export const isAligned = (kind) => ALIGNED.has(kind);
