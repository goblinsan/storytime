/**
 * A modifier rule that never applies.
 *
 * `.editorial-picker--set { display: block }` was written to give a picker's
 * chips a row of their own, with a comment explaining why. It never applied:
 * `.editorial-picker { display: inline-flex }` sits 72 lines further down the
 * file, and two selectors of equal specificity are settled by source order.
 * The stylesheet read as correct, the comment asserted a fix, and the chips
 * kept wrapping into ragged half-rows.
 *
 * This is the same shape as the bugs `editorialLinkStyling` and
 * `editorialCastAlignment` were written for -- a rule that loses quietly --
 * caught in a different place: not ink or geometry, but a BEM modifier
 * overruled by its own base class.
 *
 * The check is deliberately narrow, because the interesting part is the false
 * positives. A base rule inside `@media (max-width: 900px)` also comes later
 * in the file and also has equal specificity, and overriding a modifier at a
 * narrow width is exactly what a responsive override is for. Comparing across
 * that boundary said the sidebar's collapsed width was dead; the sidebar
 * collapses from 248px to 68px on the running page. So rules are only ever
 * compared against rules in the same at-rule context.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const STYLE_DIR = resolve(import.meta.dirname, '../../src/editorial/styles');
const SHEETS = ['tokens', 'workspace', 'reader']
  .map((name) => ({ name: `${name}.css`, file: resolve(STYLE_DIR, `${name}.css`) }))
  .filter(({ file }) => existsSync(file));

/**
 * Comments are blanked, not removed, so byte offsets still map to lines --
 * which means newlines have to survive the blanking, or every line number this
 * test reports points somewhere above the rule it is talking about.
 */
const blankComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g,
  (m) => m.replace(/[^\n]/g, ' '));

/**
 * Style rules with the at-rule context they sit in. A brace walk rather than a
 * regex, because a regex cannot tell a rule inside `@media` from one beside it,
 * and that distinction is the whole point.
 */
function readRules(css) {
  const rules = [];
  const stack = [];
  let start = 0;
  for (let i = 0; i < css.length; i += 1) {
    if (css[i] === '{') {
      const prelude = css.slice(start, i).trim();
      stack.push(prelude);
      start = i + 1;
      continue;
    }
    if (css[i] !== '}') continue;
    const prelude = stack.pop();
    if (prelude !== undefined && !prelude.startsWith('@')) {
      rules.push({
        selectors: prelude.split(',').map((s) => s.trim()).filter(Boolean),
        body: css.slice(start, i),
        at: start,
        context: stack.filter((p) => p.startsWith('@')).join(' & '),
      });
    }
    start = i + 1;
  }
  return rules;
}

const declaredProperties = (body) => new Set(
  [...body.matchAll(/(?:^|;)\s*([a-z-]+)\s*:/g)].map((m) => m[1]),
);

const lineOf = (css, index) => css.slice(0, index).split('\n').length;

describe('a BEM modifier is not overruled by its own base class', () => {
  for (const { name, file } of SHEETS) {
    it(`${name} has no modifier rule that source order kills`, () => {
      const css = blankComments(readFileSync(file, 'utf8'));
      const rules = readRules(css);

      const bySelector = new Map();
      for (const rule of rules) {
        for (const selector of rule.selectors) {
          if (!bySelector.has(selector)) bySelector.set(selector, []);
          bySelector.get(selector).push(rule);
        }
      }

      const dead = [];
      for (const [selector, modifierRules] of bySelector) {
        const match = /^\.([\w-]+)--[\w-]+$/.exec(selector);
        if (!match) continue;
        const base = `.${match[1]}`;
        const baseRules = bySelector.get(base);
        if (!baseRules) continue;

        for (const modifier of modifierRules) {
          for (const baseRule of baseRules) {
            // Same context only. A later rule in a narrower media query is a
            // responsive override, not a defect.
            if (baseRule.context !== modifier.context) continue;
            if (baseRule.at < modifier.at) continue;
            const baseProps = declaredProperties(baseRule.body);
            const overruled = [...declaredProperties(modifier.body)].filter((p) => baseProps.has(p));
            if (!overruled.length) continue;
            dead.push(`${name}:${lineOf(css, modifier.at)} ${selector} sets `
              + `{${overruled.join(', ')}} but ${base} declares the same at line `
              + `${lineOf(css, baseRule.at)}, wins on source order, and the modifier never applies`);
          }
        }
      }

      expect(dead, dead.join('\n')).toEqual([]);
    });
  }
});
