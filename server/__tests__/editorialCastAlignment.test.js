/**
 * The cast list has one left edge.
 *
 * It had three: 285 for an unnumbered name, 294 for a group heading, 309 for a
 * numbered one. A disclosure mark pushed heading text right; a billing
 * number's gutter pushed a billed name further right than an unbilled one; and
 * a heading declared `border: none` where a row carries a 1px transparent one,
 * which is the last pixel of it. Whether two names lined up depended on
 * whether a work happened to bill somebody.
 *
 * None of it broke a rule. Every value came from the token scale, so the
 * spacing test passed throughout -- it checks where numbers come from, not
 * where things land, and it never could.
 *
 * What is checkable without a layout engine is that the geometry is declared
 * ONCE and shared, rather than twice and matching. Two matching declarations
 * are a coincidence waiting to be edited apart; one rule cannot drift from
 * itself.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  fileURLToPath(new URL('../../src/editorial/styles/workspace.css', import.meta.url)),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');

const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map(([, selector, body]) => ({ selector: selector.trim(), body }));

/**
 * Everything that has to start its text on the column's single left edge.
 *
 * The controls belong on it too. With only the list covered, the headings and
 * names agreed at 314 while "Grouped by" and "Ordered for" sat at 272 -- one
 * column with two left edges 42px apart, and a guard that passed because it
 * had only been told to look at half of it.
 */
const ON_THE_EDGE = [
  '.editorial-cast-controls',
  '.editorial-house__toggle',
  '.editorial-button--row',
];

describe('everything in the cast list starts on one left edge', () => {
  const shared = rules.filter((r) => ON_THE_EDGE.every((sel) => r.selector.includes(sel)));

  it('declares the shared geometry in exactly one rule', () => {
    expect(
      shared.length,
      'a heading and a row must be laid out by one rule, not by two that happen to agree',
    ).toBe(1);
  });

  it('gives that rule everything the edge depends on', () => {
    // Each of these, set differently on one and not the others, moved the edge.
    for (const property of ['display', 'grid-template-columns', 'border', 'padding-left', 'gap']) {
      expect(shared[0].body, `the shared rule must set ${property}`)
        .toMatch(new RegExp(`(^|;)\\s*${property}\\s*:`));
    }
  });

  it('reserves the gutter whether or not anything is in it', () => {
    // The billing number and the disclosure mark share one track. A track sized
    // to its contents collapses when a list happens to bill nobody, and the
    // names step left while the headings do not.
    expect(shared[0].body).toMatch(/grid-template-columns:\s*var\(--editorial-space-\d/);
    expect(shared[0].body).not.toMatch(/grid-template-columns:\s*(auto|min-content|max-content)/);
  });

  it('lets neither one re-declare what the shared rule settled', () => {
    const owned = ['grid-template-columns', 'padding-left', 'border-left-width', 'margin-left', 'gap'];
    const offenders = [];
    for (const rule of rules) {
      if (rule === shared[0]) continue;
      if (/:hover|:focus|@|\[data-|--set|__inner/.test(rule.selector)) continue;
      if (!ON_THE_EDGE.some((sel) => rule.selector.includes(sel))) continue;
      for (const property of owned) {
        if (new RegExp(`(^|;)\\s*${property}\\s*:`).test(rule.body)) {
          offenders.push(`${rule.selector.replace(/\s+/g, ' ')} sets ${property}`);
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('keeps the billing number and the disclosure mark out of the text column', () => {
    // Either of them laid out as part of the text is what pushed the edge the
    // first two times.
    for (const cls of ['.editorial-cast-row__billing', '.editorial-house__mark']) {
      const own = rules.filter((r) => r.selector.includes(cls) && !/::?before|:hover|\[data-/.test(r.selector));
      expect(own.length, `${cls} should be styled`).toBeGreaterThan(0);
      for (const rule of own) {
        expect(rule.body, `${cls} must not float out of its grid track`).not.toMatch(/float\s*:/);
      }
    }
  });
});
