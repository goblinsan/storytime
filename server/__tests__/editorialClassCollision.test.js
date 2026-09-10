/**
 * One class, one owner.
 *
 * `.editorial-proposal` was declared twice: once for the batch review, with a
 * dashed border and 16px of padding all round, and once, much later in the
 * file, for a place's proposal with `padding: 16px 0`. Both are one class
 * selector, so they carry identical specificity and the later one wins per
 * property. The result kept the earlier rule's border and the later rule's
 * horizontal padding of zero, and the text ran into the edge of the box.
 *
 * Nothing catches that by reading either rule: each is correct on its own, and
 * the bug lives in the fact that they are the same name. It is also not a
 * cascade-order problem -- reordering them would only move the damage -- so
 * the ordering guard cannot see it either.
 *
 * A component class belongs to one component. Declaring the same one in two
 * places with different values for the same property is two components sharing
 * a name, which is the thing to catch.
 *
 * IT HAPPENED AGAIN, AND THIS GUARD WATCHED IT HAPPEN
 * `.editorial-ties` was declared twice: once for a person's relationships as a
 * grid, and once, two thousand lines later, for a group's rivalries as a
 * column. Same collision, same consequence -- the later rule turned the
 * earlier component's `display: grid` into `flex`, and handed the later one a
 * `row-gap` it never asked for.
 *
 * The guard did not see it because it only looked at selectors that were one
 * bare class. Nearly every rule in this sheet is written `.editorial-app
 * .editorial-x`, to outrank the element defaults, so the form the codebase
 * actually uses was the one form the check ignored. A rule that skips the
 * common case is a rule that passes for the wrong reason.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SHEETS = ['tokens.css', 'workspace.css', 'reader.css'];

const read = (name) => readFileSync(
  fileURLToPath(new URL(`../../src/editorial/styles/${name}`, import.meta.url)), 'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');

/** Properties that decide a box. Two owners disagreeing about these is the bug. */
const BOX = ['padding', 'margin', 'border', 'border-radius', 'background', 'background-color',
  'display', 'width', 'max-width'];

/**
 * Rules that own a component outright: `.editorial-x`, or the same thing
 * behind the app's root class, `.editorial-app .editorial-x`. Both name a
 * component with no state and no element qualifier, so a second declaration of
 * either is a collision rather than a variant. They are keyed together,
 * because the two forms are the same owner at different specificities and a
 * component declared once in each is the same bug wearing a disguise.
 */
const OWNS = /^(?:\.editorial-app\s+)?(\.editorial-[a-z0-9_-]+)$/;
function bareRules() {
  const found = [];
  for (const sheet of SHEETS) {
    const css = read(sheet);
    // Nesting matters: a rule inside `@media` is a deliberate override for a
    // width, not a second owner of the name. Only rules at the top level of
    // the sheet compete with each other unconditionally.
    let depth = 0;
    let at = 0;
    while (at < css.length) {
      const open = css.indexOf('{', at);
      if (open === -1) break;
      const prelude = css.slice(at, open).trim();
      const close = css.indexOf('}', open);

      if (prelude.startsWith('@')) {
        // An at-rule block: skip past its own brace and keep reading inside it
        // at a depth that disqualifies what it holds.
        depth += 1;
        at = open + 1;
        continue;
      }

      if (depth === 0) {
        for (const selector of prelude.split(',').map((s) => s.trim())) {
          const owned = OWNS.exec(selector);
          if (!owned) continue;
          found.push({
            sheet, selector, written: selector, name: owned[1], body: css.slice(open + 1, close),
          });
        }
      }

      at = close + 1;
      // Every closing brace after a declaration block may also end the at-rule
      // that contained it.
      while (depth > 0 && css.slice(at).trimStart().startsWith('}')) {
        depth -= 1;
        at = css.indexOf('}', at) + 1;
      }
    }
  }
  return found;
}

const valueOf = (body, prop) => {
  const m = body.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i'));
  return m ? m[1].trim() : null;
};

describe('a component class has one owner', () => {
  it('finds the rules it is meant to police', () => {
    // Without this the check below passes by matching nothing, which is how a
    // guard reports success for a rule it never looked at.
    expect(bareRules().length).toBeGreaterThan(200);
  });

  it('is not declared twice with different box rules', () => {
    const byClass = new Map();
    for (const rule of bareRules()) {
      if (!byClass.has(rule.name)) byClass.set(rule.name, []);
      byClass.get(rule.name).push(rule);
    }

    const clashes = [];
    for (const [selector, rules] of byClass) {
      if (rules.length < 2) continue;
      for (const prop of BOX) {
        const values = rules.map((r) => valueOf(r.body, prop)).filter(Boolean);
        if (new Set(values).size > 1) {
          clashes.push(`${selector} sets ${prop} two ways: ${[...new Set(values)].join(' / ')}`);
        }
      }
    }

    expect(
      clashes,
      'two components are sharing a class name; the later declaration wins per '
        + 'property and the result is neither rule',
    ).toEqual([]);
  });
});
