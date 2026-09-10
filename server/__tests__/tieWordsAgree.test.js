/**
 * Two copies of one vocabulary, held to each other.
 *
 * A character's ties are assembled in the browser from the graph endpoint; a
 * group's are assembled on the server. Nothing in this repository imports
 * across that boundary, so the phrasing exists twice: src/editorial/ties.ts
 * and server/tieWords.js.
 *
 * Two copies of a fact is how two versions of a fact begin, which is the exact
 * argument the societies route makes for reading rivalries from the graph
 * instead of retyping them into prose. The copies are allowed to exist because
 * merging them means a new cross-tree import; they are not allowed to disagree.
 *
 * The failure this prevents is quiet and confusing rather than loud: the same
 * edge between the same two records reads "in open conflict with" on one tab
 * and "In an active skirmish with" on another, and an author reasonably
 * concludes those are two different quarrels.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EDGE_LABEL as SERVER_LABEL, readEdge } from '../tieWords.js';

const clientSource = readFileSync(
  fileURLToPath(new URL('../../src/editorial/ties.ts', import.meta.url)), 'utf8',
);

/**
 * The client's table, read out of its source rather than imported.
 *
 * Importing it would mean putting a TypeScript module through this runner for
 * one object, and parsing the literal keeps the test honest about what is
 * actually written in the file the browser ships.
 */
function clientLabels() {
  const block = clientSource.slice(
    clientSource.indexOf('export const EDGE_LABEL'),
    clientSource.indexOf('export const readEdge'),
  );
  const found = {};
  for (const [, kind, forward, back] of block.matchAll(
    /(\w+):\s*\{\s*forward:\s*'([^']*)',\s*back:\s*'([^']*)'\s*\}/g,
  )) {
    found[kind] = { forward, back };
  }
  return found;
}

describe('the two tie vocabularies agree', () => {
  it('reads something out of the client source at all', () => {
    // Without this the comparisons below pass by comparing nothing, which is
    // how a guard reports success for a rule it never looked at.
    expect(Object.keys(clientLabels()).length).toBeGreaterThan(12);
  });

  it('phrases every shared kind the same way, in both directions', () => {
    const client = clientLabels();
    const differences = [];
    for (const [kind, server] of Object.entries(SERVER_LABEL)) {
      const theirs = client[kind];
      if (!theirs) {
        differences.push(`${kind} is on the server and not on the client`);
        continue;
      }
      for (const end of ['forward', 'back']) {
        if (server[end] !== theirs[end]) {
          differences.push(`${kind}.${end}: server "${server[end]}" / client "${theirs[end]}"`);
        }
      }
    }
    expect(differences, 'the same edge would read two different ways').toEqual([]);
  });

  it('keeps direction, which is the whole reason the table has two columns', () => {
    // The bug this stops: a group that is protected rendering as the protector.
    expect(readEdge('protective_bond', true)).toBe('protects');
    expect(readEdge('protective_bond', false)).toBe('protected by');
    expect(readEdge('a_kind_nobody_wrote_down', true)).toBe('a kind nobody wrote down');
  });
});
