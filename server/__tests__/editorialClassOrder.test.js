/**
 * When two classes sit on one element, the one written last has to win.
 *
 * `className="editorial-link editorial-field__edit"` says what the author
 * meant: a link, and then the thing that makes this particular link different.
 * But both rules are `.editorial-app .something` -- the same specificity -- so
 * the winner is whichever appears later in the stylesheet, and
 * `.editorial-app .editorial-link { margin: 0 }` sits five hundred lines below
 * `.editorial-field__edit { margin-left: ... }`. The Edit control ended up
 * against its own heading, reading "HistoryEdit".
 *
 * The existing guards could not see it. `editorialLinkStyling` compares a
 * component class against the BASE ELEMENT rules -- `.editorial-app button` --
 * not against another component class on the same element.
 * `editorialDeadModifiers` compares a BEM modifier against its own base, and
 * these two share no stem. Nothing looked at two unrelated classes landing on
 * one element, which is the commonest way to combine them.
 *
 * Shorthands are expanded, because that is the other half of why it was
 * invisible: `margin` and `margin-left` are different strings and the same
 * declaration. A guard comparing property names literally reports nothing here.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const EDITORIAL = resolve(import.meta.dirname, '../../src/editorial');

const blankComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

/** tokens.css first, because that is the order the app loads them in. */
const STYLESHEET = ['styles/tokens.css', 'styles/workspace.css']
  .map((f) => join(EDITORIAL, f))
  .filter((f) => existsSync(f))
  .map((f) => blankComments(readFileSync(f, 'utf8')))
  .join('\n');

const specificity = (selector) => [
  (selector.match(/\.[a-zA-Z0-9_-]+/g) || []).length
  + (selector.match(/\[[^\]]+\]/g) || []).length
  + (selector.match(/:(hover|focus|focus-visible|active|disabled|checked|not|is|where)\b/g) || []).length,
  (selector.match(/(^|[\s>+~])[a-z][a-z0-9]*/g) || []).length,
].join(',');

/**
 * A shorthand writes every longhand under it. Comparing the names as strings
 * says `margin` and `margin-left` are unrelated; the cascade says one erases
 * the other.
 */
const SHORTHANDS = {
  margin: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
  padding: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
  border: ['border-top', 'border-right', 'border-bottom', 'border-left',
    'border-width', 'border-style', 'border-color'],
  background: ['background-color', 'background-image', 'background-position',
    'background-size', 'background-repeat'],
  font: ['font-family', 'font-size', 'font-weight', 'font-style', 'line-height'],
  inset: ['top', 'right', 'bottom', 'left'],
  flex: ['flex-grow', 'flex-shrink', 'flex-basis'],
  gap: ['row-gap', 'column-gap'],
};

const expand = (properties) => {
  const out = new Set();
  for (const property of properties) {
    out.add(property);
    for (const longhand of SHORTHANDS[property] ?? []) out.add(longhand);
  }
  return out;
};

const declaredIn = (body) => expand(
  [...body.matchAll(/(?:^|;)\s*([a-z-]+)\s*:/g)].map((m) => m[1]),
);

/** Rules whose subject is a single editorial class, keyed by that class. */
const rulesByClass = () => {
  const index = new Map();
  for (const rule of STYLESHEET.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const [, selector, body] = rule;
    for (const one of selector.split(',')) {
      const trimmed = one.trim().replace(/\s+/g, ' ');
      const match = /^(?:\.editorial-app\s+)?\.([a-zA-Z0-9_-]+)$/.exec(trimmed);
      if (!match) continue;
      if (!index.has(match[1])) index.set(match[1], []);
      index.get(match[1]).push({
        selector: trimmed,
        specificity: specificity(trimmed),
        // Where this rule actually is, not `indexOf(selector)`. A selector is a
        // prefix of every longer selector built on it, so looking the string up
        // found `.editorial-app .editorial-link` inside
        // `.editorial-app .editorial-link.editorial-scrub__clear` 1600 lines
        // above the real base rule -- and the guard concluded the base came
        // first and skipped the pair. It missed a genuinely dead
        // `.editorial-link--discard` for that reason.
        at: rule.index,
        properties: declaredIn(body),
      });
    }
  }
  return index;
};

const componentFiles = () => {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== '__tests__') walk(path);
      else if (entry.isFile() && path.endsWith('.tsx')) out.push(path);
    }
  };
  walk(EDITORIAL);
  return out;
};

/** Every ordered pair of editorial classes that share an element. */
const classPairs = () => {
  const pairs = [];
  for (const file of componentFiles()) {
    const source = readFileSync(file, 'utf8');
    for (const [, quoted, templated] of source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
      const classes = String(quoted ?? templated ?? '')
        .split(/[\s${}?:'"`\\]+/)
        .filter((c) => /^editorial-/.test(c));
      for (let i = 0; i < classes.length; i += 1) {
        for (let j = i + 1; j < classes.length; j += 1) {
          pairs.push({ file: file.split('/').pop(), earlier: classes[i], later: classes[j] });
        }
      }
    }
  }
  return pairs;
};

describe('two classes on one element resolve the way the markup reads', () => {
  const index = rulesByClass();

  it('finds the stylesheet and the markup', () => {
    expect(STYLESHEET.length).toBeGreaterThan(1000);
    expect(index.size).toBeGreaterThan(20);
    expect(classPairs().length).toBeGreaterThan(10);
  });

  it('expands a shorthand over the longhands it writes', () => {
    // The half of this that made the reported bug invisible.
    expect(declaredIn('margin: 0;').has('margin-left')).toBe(true);
    expect(declaredIn('padding: 0;').has('padding-right')).toBe(true);
    expect(declaredIn('margin-left: 1px;').has('margin')).toBe(false);
  });

  it('never lets the class written first overrule the one written last', () => {
    const inverted = [];
    for (const { file, earlier, later } of classPairs()) {
      for (const first of index.get(earlier) ?? []) {
        for (const second of index.get(later) ?? []) {
          if (first.specificity !== second.specificity) continue;
          // The later-written class already wins: nothing to say.
          if (second.at > first.at) continue;
          const overruled = [...second.properties].filter((p) => first.properties.has(p));
          if (!overruled.length) continue;
          inverted.push(`${file}: "${earlier} ${later}" -- .${later} sets `
            + `${overruled.sort().join(', ')}, but .${earlier} is declared later at the same `
            + 'specificity and wins. One of them has to out-specify the other.');
        }
      }
    }
    expect([...new Set(inverted)].sort(), [...new Set(inverted)].sort().join('\n')).toEqual([]);
  });
});
