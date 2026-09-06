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
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const editorialRoot = fileURLToPath(new URL('../../src/editorial/', import.meta.url));

const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

const componentFiles = walk(editorialRoot)
  .filter((f) => /\.tsx$/.test(f) && !f.includes('__tests__'));

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

/**
 * tokens.css styles h1-h6 and button at (0,1,1). A component class applied TO
 * one of those elements has to out-specify that base rule, or the element keeps
 * the base font, size or alignment and the component's own styling is silently
 * ignored. This has now caught three separate components: the sidebar links,
 * the character rows, and the house headings in the cast rail.
 *
 * Which classes are at risk is a fact about the markup, not the CSS, so this
 * reads the components to find them.
 */
describe('component overrides on headings and buttons beat the base element rules', () => {
  const AT_RISK = /<(h[1-6]|button)\b[^>]*className=(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\})/g;
  const OVERRIDDEN = ['font-family', 'font-size', 'font-weight', 'justify-content', 'text-align'];

  const classesOnBaseElements = () => {
    const found = new Map();
    for (const file of componentFiles) {
      const src = readFileSync(file, 'utf8');
      for (const [, element, ...groups] of src.matchAll(AT_RISK)) {
        for (const cls of String(groups.find(Boolean) ?? '').split(/[\s${}?:'"`]+/)) {
          if (cls.startsWith('editorial-') && !found.has(cls)) found.set(cls, { element, file });
        }
      }
    }
    return found;
  };

  it('finds the classes that sit on a heading or a button', () => {
    expect(classesOnBaseElements().size).toBeGreaterThan(3);
  });

  it('qualifies every one of them that restyles the element', () => {
    const css = STYLESHEETS.map((f) => stripComments(read(`../../${f}`))).join('\n');
    const unqualified = [];

    for (const [cls, { element }] of classesOnBaseElements()) {
      for (const [, rawSelector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!OVERRIDDEN.some((prop) => new RegExp(`(^|;)\\s*${prop}\\s*:`).test(body))) continue;
        for (const selector of rawSelector.split(',')) {
          const sel = selector.trim().replace(/\s+/g, ' ');
          if (!new RegExp(`\\.${cls}(?![a-zA-Z0-9_-])`).test(sel)) continue;
          const [c, t] = specificity(sel);
          if (!(c > 1 || (c === 1 && t > 1))) {
            unqualified.push(`.${cls} on <${element}>: "${sel}" cannot beat .editorial-app ${element}`);
          }
        }
      }
    }
    expect([...new Set(unqualified)]).toEqual([]);
  });
});

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
