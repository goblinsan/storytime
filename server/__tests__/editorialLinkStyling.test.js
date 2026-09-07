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

/**
 * Crude but sufficient: class count and type count for a compound selector.
 *
 * Attribute selectors count at class level, and leaving them out is not a
 * rounding error: `.editorial-app input[type="number"]` is (0,2,1), so a rule
 * written as `.editorial-app .editorial-year__input` at (0,2,0) loses to it
 * while looking, to the eye and to the old version of this function, like the
 * more specific of the two.
 */
function specificity(selector) {
  const classes = (selector.match(/\.[a-zA-Z0-9_-]+/g) || []).length
    + (selector.match(/\[[^\]]+\]/g) || []).length
    + (selector.match(/:(hover|focus|focus-visible|active|disabled|checked|not|is|where)\b/g) || []).length;
  const types = (selector.match(/(^|[\s>+~])[a-z][a-z0-9]*/g) || []).length;
  return [classes, types];
}

/** a is at least as specific as b. */
const atLeast = ([ac, at], [bc, bt]) => ac > bc || (ac === bc && at >= bt);

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
/**
 * Which elements tokens.css claims is a fact about tokens.css, so read it there
 * rather than keeping a list in step by hand. The list said h1-h6 and button;
 * tokens.css also styles `p`, and two rules on the cast entry -- the standing
 * line and the governance flag -- lost to `.editorial-app p` and rendered in
 * body ink with the wrong margins for a whole release.
 */
/**
 * Every base element tokens.css styles, with the specificity a component class
 * has to beat to restyle it.
 *
 * The specificity is read rather than assumed. This used to collect element
 * names only and compare everything against a flat (1,1), which is right for
 * `.editorial-app p` and wrong for `.editorial-app input[type="number"]` --
 * so the form controls were in the guarded list on paper and unguarded in
 * practice, and a year field came out with 8px 12px of somebody else's padding.
 */
const guardedBases = () => {
  const tokens = stripComments(read('../../src/editorial/styles/tokens.css'));
  const found = new Map();
  for (const [, selector, body] of tokens.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const one of selector.split(',')) {
      // Plain element rules only. A hover or a disabled state is a higher bar
      // that a component's resting rule has no reason to clear, and treating
      // `.editorial-app button:hover` as the bar for `.editorial-button` said
      // every button on the surface was broken while they all render fine.
      const m = /^\s*\.editorial-app\s+([a-z][a-z0-9]*)((?:\[[^\]]+\])*)\s*$/.exec(one);
      if (!m) continue;
      const here = specificity(one.trim());
      if (!found.has(m[1])) found.set(m[1], new Map());
      const perProperty = found.get(m[1]);
      // Per property, because a component only has to beat the base rules that
      // set the thing it is trying to change.
      for (const [, property] of body.matchAll(/(?:^|;)\s*([a-z-]+)\s*:/g)) {
        const already = perProperty.get(property);
        if (!already || atLeast(here, already)) perProperty.set(property, here);
      }
    }
  }
  return found;
};

describe('component overrides on base elements beat the base element rules', () => {
  const BASES = guardedBases();
  const ELEMENTS = [...BASES.keys()].sort();
  const AT_RISK = new RegExp(
    `<(${ELEMENTS.join('|')})\\b[^>]*className=(?:"([^"]*)"|\\{\`([^\`]*)\`\\}|\\{'([^']*)'\\})`, 'g');
  const OVERRIDDEN = ['font-family', 'font-size', 'font-weight', 'justify-content',
    'text-align', 'color', 'margin', 'margin-top', 'margin-bottom',
    // Geometry, because tokens.css gives the form controls a padding and a
    // border and a component that wants a different shape has to win to get it.
    'padding', 'padding-left', 'padding-right', 'width', 'border', 'border-bottom'];

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

  it('reads the guarded element list out of tokens.css', () => {
    expect(ELEMENTS).toContain('p');
    expect(ELEMENTS).toContain('button');
    expect(ELEMENTS).toContain('h3');
  });

  it('finds the classes that sit on one of those elements', () => {
    expect(classesOnBaseElements().size).toBeGreaterThan(3);
  });

  it('qualifies every one of them that restyles the element', () => {
    const css = STYLESHEETS.map((f) => stripComments(read(`../../${f}`))).join('\n');
    const unqualified = [];

    for (const [cls, { element }] of classesOnBaseElements()) {
      const bases = BASES.get(element);
      if (!bases) continue;
      for (const [, rawSelector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const declared = OVERRIDDEN.filter((prop) => new RegExp(`(^|;)\\s*${prop}\\s*:`).test(body));
        if (!declared.length) continue;
        for (const selector of rawSelector.split(',')) {
          const sel = selector.trim().replace(/\s+/g, ' ');
          if (!new RegExp(`\\.${cls}(?![a-zA-Z0-9_-])`).test(sel)) continue;
          for (const property of declared) {
            const base = bases.get(property);
            if (!base || atLeast(specificity(sel), base)) continue;
            unqualified.push(`.${cls} on <${element}>: "${sel}" (${specificity(sel)}) sets `
              + `${property}, which .editorial-app ${element} also sets at (${base}) -- `
              + 'the base rule wins and the component declaration never applies');
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
