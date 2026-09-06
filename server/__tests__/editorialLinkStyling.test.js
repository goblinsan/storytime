/**
 * tokens.css styles prose links with `.editorial-app a`, which at (0,1,1)
 * outranks any single-class component selector. That silently underlined every
 * sidebar item and every breadcrumb and repainted them on hover -- twice, in two
 * different components, because each fix was made one selector at a time.
 *
 * This asserts the structural rule instead: a component that removes the
 * underline must be able to win, either by carrying `.editorial-app` itself or
 * by living inside the nav/header/aside exemption.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const STYLESHEETS = [
  'src/editorial/styles/tokens.css',
  'src/editorial/styles/workspace.css',
  'src/editorial/styles/reader.css',
];

/** Strip comments so a prose sentence inside one is not parsed as a selector. */
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Crude but sufficient: class count and type count for a compound selector. */
function specificity(selector) {
  const classes = (selector.match(/\.[a-zA-Z0-9_-]+/g) || []).length
    + (selector.match(/:(hover|focus|focus-visible|active|not|is|where)\b/g) || []).length;
  const types = (selector.match(/(^|[\s>+~])[a-z][a-z0-9]*/g) || []).length;
  return [classes, types];
}

const beatsBaseLinkRule = (selector) => {
  // Base rule is `.editorial-app a` -> 1 class, 1 type.
  const [c, t] = specificity(selector);
  return c > 1 || (c === 1 && t > 1);
};

describe('editorial link styling', () => {
  it('keeps the prose link rule that everything else has to out-specify', () => {
    const tokens = stripComments(read('../../src/editorial/styles/tokens.css'));
    expect(tokens).toMatch(/\.editorial-app a\s*\{[^}]*text-decoration:\s*underline/);
  });

  it('exempts navigation chrome once, rather than per component', () => {
    const tokens = stripComments(read('../../src/editorial/styles/tokens.css'));
    expect(tokens).toMatch(/\.editorial-app :is\(nav, header, aside\) a\s*\{[^}]*text-decoration:\s*none/);
  });

  it('every underline removal can actually win the cascade', () => {
    const losers = [];
    for (const file of STYLESHEETS) {
      const css = stripComments(read(`../../${file}`));
      const rules = css.matchAll(/([^{}]+)\{([^{}]*)\}/g);
      for (const [, rawSelector, body] of rules) {
        if (!/text-decoration:\s*none/.test(body)) continue;
        for (const selector of rawSelector.split(',')) {
          const s = selector.trim().replace(/\s+/g, ' ');
          if (!s || !s.includes('.editorial')) continue;
          if (/:is\(nav, header, aside\)/.test(s)) continue;
          if (!beatsBaseLinkRule(s)) losers.push(`${file.split('/').pop()}: ${s}`);
        }
      }
    }
    expect(losers).toEqual([]);
  });
});
