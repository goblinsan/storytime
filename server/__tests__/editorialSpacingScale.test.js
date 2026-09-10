/**
 * Spacing comes from a scale, or it does not come from anywhere.
 *
 * tokens.css has declared a clean 4px scale from the beginning. Nothing
 * enforced it, so roughly half the surface used it and the rest used hand-
 * picked rem literals: the button base at 6/14px, the tier toggle at
 * 4.8/11.2px -- values that are not on the grid and are not whole pixels at
 * any zoom. A scale followed half the time is worse than no scale, because the
 * result looks deliberate.
 *
 * Two scales, because two different jobs:
 *   --editorial-space-*  positions layout. Fixed at every type size.
 *   --editorial-em-*     tracks the type it sits in. A chip inside a
 *                        paragraph must grow with the paragraph.
 *
 * A declaration that genuinely cannot come from either -- optical alignment of
 * a decoration, clearance for chrome whose height is measured rather than
 * chosen -- says so on the line: `/* scale-exempt: reason *\/`. The exemption
 * is visible in review; drift is not.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SHEETS = ['tokens.css', 'workspace.css', 'reader.css'];

const read = (name) =>
  readFileSync(fileURLToPath(new URL(`../../src/editorial/styles/${name}`, import.meta.url)), 'utf8');

/** Properties whose values place things. Colors and type are governed elsewhere. */
const SPACING = /(?<![-\w])(padding|margin|gap|row-gap|column-gap|inset)(-(top|right|bottom|left))?\s*:\s*([^;{}]+);/g;
const RADIUS = /(?<![-\w])border(-[a-z]+)?-radius\s*:\s*([^;{}]+);/g;

/**
 * var(--token) and var(--token, fallback), including a nested calc/var, plus
 * env(safe-area-inset-*, 0px): the fallback inside a var() or an env() is the
 * token's business, not a length this stylesheet chose.
 */
const VAR = /(?:var|env)\(\s*[\w-]+\s*(?:,[^()]*(?:\([^()]*\)[^()]*)*)?\)/g;
const LENGTH = /(?<![\w.-])(-?\d*\.?\d+)(rem|px|em)\b/g;

const lineOf = (src, index) => src.slice(0, index).split('\n').length;

/**
 * The declaration plus the rest of the line it ends on, so a trailing
 * `scale-exempt` comment is seen even when the declaration spans four lines.
 */
const withTrailingComment = (src, match) => {
  const end = match.index + match[0].length;
  return match[0] + src.slice(end, src.indexOf('\n', end) + 1 || undefined);
};

function violations(src, pattern, valueGroup) {
  const found = [];
  for (const match of src.matchAll(pattern)) {
    const value = match[valueGroup];
    if (withTrailingComment(src, match).includes('scale-exempt:')) continue;
    // A token's own declaration is where the scale is defined.
    if (/^\s*--editorial-/.test(src.slice(src.lastIndexOf('\n', match.index) + 1, match.index + 1))) continue;
    const bare = value.replace(VAR, ' ');
    const lengths = [...bare.matchAll(LENGTH)].map((m) => m[0]);
    if (lengths.length) {
      found.push({ line: lineOf(src, match.index), declaration: match[0].trim().split('\n')[0], lengths });
    }
  }
  return found;
}

/**
 * Type comes from the scale too.
 *
 * Four rules carried a raw font-size: the record's standing line at 0.9375rem,
 * its field label at 0.8125rem, and two in the family tree at 13px and 10px.
 * They were invisible while the scale was fixed, because a hardcoded 13px and
 * a token that resolved to 13.5px look the same. The moment the scale went
 * fluid they stopped moving with everything else, and the record's subheadings
 * came out smaller than the prose they head.
 *
 * A size that is not on the scale is a size that will be wrong the next time
 * the scale changes.
 */
describe('type comes from the scale', () => {
  const SIZE = /(?<![-\w])font-size\s*:\s*([^;{}]+);/g;

  it('finds the font-size declarations at all', () => {
    const all = SHEETS.flatMap((sheet) => [...read(sheet).matchAll(SIZE)]);
    expect(all.length).toBeGreaterThan(50);
  });

  it('writes no font size outside the scale', () => {
    const found = [];
    for (const sheet of SHEETS) {
      const src = read(sheet);
      for (const match of src.matchAll(SIZE)) {
        const value = match[1];
        // A token's own declaration is where the scale is defined, and `em`
        // is relative to whatever it sits in rather than a step on the scale.
        const line = src.slice(src.lastIndexOf('\n', match.index) + 1, match.index + 1);
        if (/^\s*--editorial-/.test(line)) continue;
        if (withTrailingComment(src, match).includes('scale-exempt:')) continue;
        // Strip var() the way the spacing check does, so a size built from
        // tokens passes however it is nested -- the reader's own size is
        // `var(--reader-font-size, var(--editorial-font-size-md, ...))`, which
        // is a preference layered over the scale rather than a number.
        const bare = value.replace(VAR, ' ');
        if (!/(?<![\w.-])[0-9.]+(rem|px)\b/.test(bare)) continue;
        if (withTrailingComment(src, match).includes('scale-exempt:')) continue;
        found.push(`${sheet}:${lineOf(src, match.index)}  font-size: ${value.trim()}`);
      }
    }
    expect(
      found,
      'use a --editorial-font-size-* token, or annotate with /* scale-exempt: why */',
    ).toEqual([]);
  });
});

describe('the editorial spacing scale is enforced, not merely declared', () => {
  it('declares both scales, and a control geometry built from them', () => {
    const tokens = read('tokens.css');
    for (const step of [1, 2, 3, 4, 5, 6, 8, 10, 12, 16]) {
      expect(tokens, `--editorial-space-${step} must exist`).toMatch(new RegExp(`--editorial-space-${step}:`));
    }
    for (const step of [1, 2, 3, 4, 6, 8]) {
      expect(tokens, `--editorial-em-${step} must exist`).toMatch(new RegExp(`--editorial-em-${step}:`));
    }
    for (const name of [
      '--editorial-control-height',
      '--editorial-control-height-dense',
      '--editorial-control-pad-y',
      '--editorial-control-pad-x',
    ]) {
      expect(tokens, `${name} must exist`).toMatch(new RegExp(`${name}:`));
    }
  });

  it('gives a control radius that is not a duplicate of another token', () => {
    const tokens = read('tokens.css');
    const value = (name) => tokens.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();
    // Two names for one value means radius cannot distinguish anything.
    expect(value('--editorial-radius-control')).not.toBe(value('--editorial-radius-sm'));
  });

  for (const sheet of SHEETS) {
    it(`${sheet} writes no spacing length outside the scale`, () => {
      const found = violations(read(sheet), SPACING, 4);
      expect(
        found,
        found.length
          ? `off-scale spacing in ${sheet}:\n${found.map((f) => `  ${sheet}:${f.line}  ${f.declaration}  ->  ${f.lengths.join(', ')}`).join('\n')}\n\nUse a --editorial-space-* or --editorial-em-* token, or annotate the line with /* scale-exempt: why */`
          : '',
      ).toEqual([]);
    });

    it(`${sheet} writes no corner radius outside the scale`, () => {
      const found = violations(read(sheet), RADIUS, 2);
      expect(
        found,
        found.length
          ? `off-scale radius in ${sheet}:\n${found.map((f) => `  ${sheet}:${f.line}  ${f.declaration}`).join('\n')}`
          : '',
      ).toEqual([]);
    });
  }

  it('builds every button role from the control tokens, never a raw size', () => {
    const css = read('workspace.css');
    const block = css.slice(css.indexOf('.editorial-app .editorial-button {'), css.indexOf('.editorial-form {'));
    const sized = [...block.matchAll(/(?<![-\w])(min-height|height|width)\s*:\s*([^;]+);/g)]
      .map((m) => ({ property: m[1], value: m[2].trim() }))
      .filter((d) => d.value !== '100%' && d.value !== 'auto' && d.value !== '0')
      .filter((d) => !d.value.includes('var(--editorial-control-height'));
    expect(sized, `a button role sized itself: ${JSON.stringify(sized)}`).toEqual([]);
  });
});
