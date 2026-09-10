/**
 * Every surface is the same width, and no surface is named.
 *
 * There were four width rules across two files and three tiers: a 1280px cap
 * on `.editorial-surface`, a `:has(.editorial-panes)` exception that lifted it
 * for two surfaces, and a `.editorial-shell__content:has([data-surface='...'])`
 * rule listing four more by name at 96rem. Measured at a 1900px window:
 * Overview reached x=1551, Characters x=1759, Geography x=1875. Moving along
 * the nav changed how much of the screen the application was willing to use.
 *
 * Each of those rules was added after somebody complained about one tab. That
 * is the shape of the bug, not the fix: a list of exceptions is a rule that
 * was wrong, maintained one surface at a time, and the next surface always
 * looks different from the ones already argued about.
 *
 * The rule is that there is no rule to remember: the content column fills the
 * window, and a LINE gets a measure because a line is what becomes unreadable
 * when it runs long. A surface is not a line.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = path.join(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'editorial', 'styles',
);
const sheets = () => readdirSync(dir)
  .filter((f) => f.endsWith('.css'))
  .map((f) => ({ file: f, css: readFileSync(path.join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '') }));

/** Rules as { file, selector, body }, comments stripped. */
const rules = () => sheets().flatMap(({ file, css }) => [
  ...css.matchAll(/([^{}]+)\{([^{}]*)\}/g),
].map((m) => ({ file, selector: m[1].trim(), body: m[2] })));

describe('one width for every surface', () => {
  it('finds the layout rules at all', () => {
    // Without this the checks below pass by matching nothing, which is how a
    // guard reports success for a rule it never looked at.
    const seen = rules().filter((r) => /editorial-(surface|shell__content)\b/.test(r.selector));
    expect(seen.length).toBeGreaterThan(2);
  });

  it('caps no surface and no content column', () => {
    const offenders = rules()
      .filter((r) => /\.editorial-(surface|shell__content)\b/.test(r.selector))
      // Read the value rather than pattern-matching around it: `\s*` can match
      // nothing, which let a negative lookahead for `100%` succeed one
      // character early and flag the very rule that widens.
      .filter((r) => {
        const said = r.body.match(/max-width:\s*([^;]+)/);
        return !!said && said[1].trim() !== '100%' && said[1].trim() !== 'none';
      })
      .map((r) => `${r.file}: ${r.selector}`);

    expect(
      offenders,
      'a surface that caps itself makes its tab narrower than its neighbours; '
        + 'cap the prose inside it instead',
    ).toEqual([]);
  });

  it('names no surface in a layout rule', () => {
    // `[data-surface='x']` in a width rule is an exception with a name on it,
    // which is how four tabs ended up at one width and two at another.
    const offenders = rules()
      .filter((r) => /\[data-surface=/.test(r.selector))
      .filter((r) => /(max-width|width|flex-basis)\s*:/.test(r.body))
      .map((r) => `${r.file}: ${r.selector}`);

    expect(offenders, 'these give one named surface a width of its own').toEqual([]);
  });
});
