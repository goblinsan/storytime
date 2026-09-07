/**
 * Prose has a measure.
 *
 * The rule was already written down: reader.css defines
 * `--editorial-measure-max: 76ch` under a comment naming the 62-76 character
 * optimal reading measure. It just was not applied to the record, which set a
 * reading line-height, a reading color and no width cap at all -- so in a pane
 * 672px wide at 15px it ran to about 89 characters a line, in the part of the
 * product whose whole premise is reading long prose.
 *
 * A convention that one rule can silently skip is not a convention. This is
 * that rule with teeth: anything a class calls prose must say how wide prose
 * gets, and must say it with the shared token rather than a number of its own,
 * because two different measures is the same problem wearing a hat.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const stylesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'editorial', 'styles',
);

/** Every rule in the editorial stylesheets, as { selector, body, file }. */
function rules() {
  const found = [];
  for (const file of readdirSync(stylesDir).filter((f) => f.endsWith('.css'))) {
    const css = readFileSync(path.join(stylesDir, file), 'utf8')
      // Comments hold example CSS and prose about it; neither is a rule.
      .replace(/\/\*[\s\S]*?\*\//g, '');
    for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      found.push({ selector: match[1].trim(), body: match[2], file });
    }
  }
  return found;
}

/** A rule that styles the prose itself, not something inside or beside it. */
const stylesProse = (selector) => /__prose$/.test(selector.split(/\s+/).pop() ?? '');

describe('prose has a measure', () => {
  it('finds the prose rules at all', () => {
    // Without this the two checks below pass by matching nothing, which is how
    // a guard reports success for a rule it never looked at.
    const proseRules = rules().filter((r) => stylesProse(r.selector));
    expect(proseRules.length).toBeGreaterThanOrEqual(2);
    expect(proseRules.map((r) => r.selector).join(' ')).toMatch(/record__prose/);
    expect(proseRules.map((r) => r.selector).join(' ')).toMatch(/reader__prose/);
  });

  it('caps every prose class at a measure', () => {
    // Grouped by selector: a class may be split across rules, and the cap only
    // has to be set once for it.
    const capped = new Set(
      rules().filter((r) => /max-width/.test(r.body)).map((r) => r.selector.split(/\s+/).pop()),
    );
    const uncapped = [...new Set(
      rules().filter((r) => stylesProse(r.selector)).map((r) => r.selector.split(/\s+/).pop()),
    )].filter((cls) => !capped.has(cls));

    expect(uncapped, 'these read as long lines in a wide pane').toEqual([]);
  });

  it('uses a shared measure token, not a number of its own', () => {
    // Either token: `ch` is the advance of a zero rather than a character, and
    // the sans and serif stacks put a different number of characters in the
    // same ch, so one value cannot serve both. Two named tokens is the fact;
    // a raw number in a rule is somebody eyeballing it again.
    const offenders = rules()
      .filter((r) => stylesProse(r.selector) && /max-width/.test(r.body))
      .filter((r) => !/max-width:\s*var\(--editorial-measure-max(-ui)?\b/.test(r.body))
      .map((r) => `${r.file}: ${r.selector}`);

    expect(offenders, 'a measure nobody named is a measure nobody checked').toEqual([]);
  });
});
