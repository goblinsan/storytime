/**
 * One button vocabulary, declared in DESIGN.md and defined once in
 * workspace.css. Before it existed, eleven components had invented their own
 * button chrome and two rendered buttons with no class at all, so no two
 * controls in the app agreed on shape, height, or what selection looks like.
 *
 * "If the save button looks different in two places, one is wrong."
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../src/editorial/', import.meta.url));

const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

const components = walk(root).filter((f) => /\.tsx$/.test(f) && !f.includes('__tests__'));
const css = readFileSync(join(root, 'styles/workspace.css'), 'utf8');

const ROLES = ['secondary', 'ghost', 'icon', 'toggle', 'row', 'inline', 'nav'];

/**
 * Each <button> in the tree, with whatever className it carries.
 *
 * The opening tag has to be scanned rather than matched: an arrow function in
 * an onClick contains a '>', so a lazy regex ends the tag early and reports a
 * button as classless when it is not.
 */
function openingTag(src, from) {
  let depth = 0;
  let quote = null;
  for (let i = from; i < src.length; i += 1) {
    const ch = src[i];
    if (quote) {
      if (ch === quote && src[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    else if (ch === '>' && depth === 0) return src.slice(from, i + 1);
  }
  return src.slice(from);
}

function buttons() {
  const found = [];
  for (const file of components) {
    const src = readFileSync(file, 'utf8');
    for (const match of src.matchAll(/<button\b/g)) {
      const tag = openingTag(src, match.index);
      const cls = /className=(?:"([^"]*)"|\{`([^`]*)`\}|\{([^}]*)\})/.exec(tag);
      found.push({
        file: file.replace(root, ''),
        className: cls ? (cls[1] ?? cls[2] ?? cls[3] ?? '') : null,
      });
    }
  }
  return found;
}

describe('the button vocabulary', () => {
  it('defines a base and every role exactly once', () => {
    expect(css).toMatch(/\.editorial-app \.editorial-button \{/);
    for (const role of ROLES) {
      expect(css, role).toMatch(new RegExp(`\\.editorial-app \\.editorial-button--${role} \\{`));
    }
  });

  it('gives the base a hover, a disabled and a focusable state', () => {
    expect(css).toMatch(/\.editorial-app \.editorial-button:hover \{/);
    expect(css).toMatch(/\.editorial-app \.editorial-button:disabled \{/);
  });

  it('finds the buttons to check', () => {
    expect(buttons().length).toBeGreaterThan(10);
  });

  it('has no button without a class', () => {
    const naked = buttons().filter((b) => b.className === null).map((b) => b.file);
    expect([...new Set(naked)]).toEqual([]);
  });

  it('has every button declare a role from the vocabulary', () => {
    const strays = buttons()
      .filter((b) => b.className !== null && !/\beditorial-button\b/.test(b.className))
      .map((b) => `${b.file}: className="${b.className.slice(0, 70)}"`);
    expect([...new Set(strays)]).toEqual([]);
  });

  it('does not let a component redefine the chrome the vocabulary owns', () => {
    // A component class may position a button. It may not restyle its ground,
    // its border or its radius; that is what made every control different.
    const OWNED = ['background', 'background-color', 'border', 'border-radius', 'border-color'];
    const offenders = [];
    for (const [, rawSelector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selectors = rawSelector.split(',').map((s) => s.trim());
      if (!selectors.some((s) => /\.editorial-(cast-tier|cast-entry|kin__link|passage-link)\b/.test(s))) continue;
      for (const prop of OWNED) {
        if (new RegExp(`(^|;)\\s*${prop}\\s*:`).test(body)) {
          offenders.push(`${selectors.join(', ')} sets ${prop}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
