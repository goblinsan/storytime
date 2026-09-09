/**
 * Inside the record pane, the pane is the column.
 *
 * A measure is for a line inside a column. When the column is already a
 * measure -- and the record pane is, capped at 64rem with a 21rem index beside
 * it -- capping the paragraph again does not narrow anything. It sets the line
 * to two thirds of its own row and leaves the rest empty, which reads as text
 * refusing to fill the space it was given.
 *
 * This was fixed one element at a time and kept coming back: the record prose,
 * then the empty hero's copy, then the proposal, then whatever was written
 * next. Four rounds of the same correction is not four mistakes, it is a
 * missing rule. So the rule is here, and the next one fails the build.
 *
 * The width is decided in one place: `.editorial-pane--record` in
 * workspace.css. Changing how wide a place reads means changing that.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const CSS = readFileSync(
  fileURLToPath(new URL('../../src/editorial/styles/workspace.css', import.meta.url)), 'utf8',
);

/** Every rule as { selector, body }, with comments stripped. */
const rules = () => [...CSS.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map((m) => ({ selector: m[1].trim(), body: m[2] }));

/**
 * The families that only ever render inside the record pane.
 *
 * Named rather than matched by position, because CSS does not know where a
 * class ends up and a test that guessed would be wrong the first time
 * something moved.
 */
const INSIDE_THE_PANE = [
  'editorial-hero', 'editorial-placefield', 'editorial-mapshelf',
  'editorial-mapcanvas', 'editorial-mapdetails', 'editorial-placeproposal',
  'editorial-candidates',
];

describe('the record pane is the column', () => {
  it('finds the rules it is meant to police', () => {
    // Without this the check below passes by matching nothing, which is how a
    // guard reports success for a rule it never looked at.
    const seen = rules().filter((r) => INSIDE_THE_PANE.some(
      (family) => new RegExp(`\\.${family}(__|--|\\b)`).test(r.selector),
    ));
    expect(seen.length).toBeGreaterThan(15);
  });

  it('lets nothing inside it carry a measure of its own', () => {
    const offenders = rules()
      .filter((r) => INSIDE_THE_PANE.some(
        (family) => new RegExp(`\\.${family}(__|--|\\b)`).test(r.selector),
      ))
      .filter((r) => /max-width:\s*var\(--editorial-measure/.test(r.body))
      .map((r) => r.selector);

    expect(
      offenders,
      'these cap a line inside a column that is already a measure, which puts '
        + 'a hole in the pane rather than narrowing it. The width is decided by '
        + '.editorial-pane--record.',
    ).toEqual([]);
  });

  it('keeps the one rule that does decide the width', () => {
    const pane = rules().find((r) => r.selector === '.editorial-pane--record' && /max-width/.test(r.body));
    expect(pane, '.editorial-pane--record must cap the pane').toBeTruthy();
  });
});
