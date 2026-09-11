/**
 * Every surface that holds records can start one, the same way.
 *
 * Four of them could not. The cast, the bestiary, societies and the timeline
 * could read, arrange, filter and rewrite what they held, and offered no way
 * to add to it -- so a universe's sixty-six characters all had to arrive from
 * somewhere else, and an empty bestiary said "Creatures recorded for this
 * universe will appear here" without saying how one gets recorded.
 *
 * This check is two rules at once, and the second is the one that lasts:
 * the surfaces have the control, AND the control is one component. Four
 * hand-rolled name forms would have been four slightly different answers to
 * "what does creating a thing ask for", which is how these tabs drifted apart
 * the last three times.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const editorial = path.join(here, '..', '..', 'src', 'editorial');
const pagesDir = path.join(editorial, 'pages');
const CONTROL = path.join(editorial, 'components', 'NewRecord.tsx');

/** The surfaces that hold records of their own, and what each one starts. */
const SURFACES = {
  'Characters.tsx': 'createCharacter',
  'Bestiary.tsx': 'createCreature',
  'Societies.tsx': 'createSociety',
  'Timeline.tsx': 'createEvent',
  'Technologies.tsx': 'createTechnology',
  'Arcs.tsx': 'createArc',
  // Nested: this one also creates inside an existing place, down in the tree
  // where you can see what you are putting it in. The masthead control makes
  // the one at the top of the tree.
  'Geography.tsx': 'createPlace',
};

describe('a surface can start a record', () => {
  it('knows about every surface that offers to start one', () => {
    // The same drift the record-parts guard grew: a hand-written list that
    // does not notice a new surface checks nothing about it.
    const using = readdirSync(pagesDir)
      .filter((f) => f.endsWith('.tsx'))
      .filter((f) => /from '\.\.\/components\/NewRecord'/.test(
        readFileSync(path.join(pagesDir, f), 'utf8'),
      ));
    const missing = using.filter((f) => !(f in SURFACES));
    expect(
      missing,
      `${missing.join(', ')} offers to start a record and is not in this test's list`,
    ).toEqual([]);
  });

  it('has somewhere for the control to live', () => {
    // Without this the checks below pass by matching nothing, which is how a
    // guard reports success for a rule it never looked at.
    const src = readFileSync(CONTROL, 'utf8');
    expect(src).toMatch(/className="editorial-newrecord"/);
    expect(src).toMatch(/export default function NewRecord\b/);
    // A dialog, not a strip: showModal is what puts it in the top layer, traps
    // focus and closes on Escape. The `open` attribute renders the same box
    // and does none of that.
    expect(src).toMatch(/showModal\(\)/);
    // A name and nothing else is the whole point: a form that demands a
    // category before it will take a name stops you mid-thought.
    expect(src).toMatch(/onCreate: \(name: string, extra: string, parentId: string\) => Promise<string>/);
  });

  it('is offered by every surface that holds records, from its masthead', () => {
    for (const [file, method] of Object.entries(SURFACES)) {
      const src = readFileSync(path.join(pagesDir, file), 'utf8');
      // In the head, where it belongs to the surface. In the list column it
      // belonged to the list, and went away with it on a narrow screen.
      expect(src, `${file} does not put the control in its masthead`)
        .toMatch(/action=\{\(\s*\n\s*<NewRecord/);
      // A nesting surface offers a second one inside the record, where the
      // parent is the thing you are standing in rather than a choice.
      expect(src, `${file} offers no way to start a record`)
        .toMatch(/from '\.\.\/components\/NewRecord'/);
      expect(src, `${file} imports the control but renders none`).toMatch(/<NewRecord/);
      expect(src, `${file} renders the control but calls nothing`)
        .toMatch(new RegExp(`editorialApi\\.${method}\\b`));
    }
  });

  it('is the only place that writes a create form', () => {
    const offenders = readdirSync(pagesDir)
      .filter((f) => f.endsWith('.tsx'))
      .filter((f) => /className="editorial-newrecord(__|")/.test(
        readFileSync(path.join(pagesDir, f), 'utf8'),
      ));
    expect(
      offenders,
      `${offenders.join(', ')} writes its own create form. Use NewRecord from `
        + 'src/editorial/components/NewRecord.tsx.',
    ).toEqual([]);
  });
});
