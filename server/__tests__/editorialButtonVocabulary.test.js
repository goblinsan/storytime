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

const ROLES = ['secondary', 'ghost', 'icon', 'toggle', 'row'];

/**
 * --inline and --nav used to be roles. Both nulled every property the base
 * set -- border, ground, padding, radius, font -- which is not a modifier, it
 * is an admission that the thing was never a button. They are links now.
 */
const RETIRED_ROLES = ['inline', 'nav'];

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
    expect(css).toMatch(/\.editorial-app \.editorial-button:hover:not\(:disabled\) \{/);
    expect(css).toMatch(/\.editorial-app \.editorial-button:disabled \{/);
  });

  it('never lights a disabled control up under the cursor', () => {
    const unguarded = [...css.matchAll(/\.editorial-app \.editorial-(?:button|link)[^,{]*:hover(?!:not\(:disabled\))[^,{]*\{/g)]
      .map((m) => m[0].trim());
    expect(unguarded, `every :hover on a control must be guarded with :not(:disabled)`).toEqual([]);
  });

  /**
   * Rule 3, stated correctly this time.
   *
   * The first version of this test forbade a `color` declaration in a
   * selectable role's hover rule, on the reasoning that hover should change
   * only the ground. Omitting the declaration does not leave the colour alone;
   * it inherits the BASE hover's ink, which belongs to the filled terracotta
   * button and is the inverse of its accent. The toggles rendered
   * canvas-on-canvas at 1.07:1 for two days because a test demanded it.
   *
   * What the rule actually means: hover must not move the ink. So the hover
   * ink has to be stated, and has to be the same token the role rests on.
   */
  it('keeps a role resting on the same ink when it is hovered', () => {
    const inkOf = (block) => (/(^|;)\s*color\s*:\s*([^;]+)/.exec(block) ?? [])[2]?.trim();
    /**
     * The last colour any rule sets on the role, ignoring its states. A role's
     * declarations are spread over several rules -- shared geometry in one,
     * its own chrome in another -- so reading the first rule that mentions it
     * finds whichever happens to come first in the file.
     */
    const effectiveInk = (selectorPart, excludeState) => {
      let found;
      for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!selector.includes(selectorPart)) continue;
        if (excludeState ? !/:hover/.test(selector) : !/:hover/.test(selector)) {
          if (excludeState) { const ink = inkOf(body); if (ink) found = ink; }
          continue;
        }
        if (!excludeState) { const ink = inkOf(body); if (ink) found = ink; }
      }
      return found;
    };

    const offenders = [];
    for (const role of ['toggle', 'row']) {
      const part = `.editorial-button--${role}`;
      const resting = effectiveInk(part, true);
      const hovered = effectiveInk(part, false);
      if (resting === undefined && hovered === undefined) continue;
      if (hovered !== resting) {
        offenders.push(`--${role}: rests on ${resting}, hovers to ${hovered ?? "(the base button's ink)"}`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  /**
   * A role that replaces the base's hover ground must state its own ink.
   *
   * The base is the filled terracotta button and its hover ink is deliberately
   * the inverse of its accent. A role with no filled ground that changes only
   * the background inherits that ink and paints canvas-on-canvas: the tier
   * toggles computed 1.07:1 in dark and 1.05:1 in light for two days. Omitting
   * the declaration is not the same as leaving the colour alone.
   */
  it('makes every role that restyles its hover ground state its hover ink', () => {
    const offenders = [];
    for (const role of ROLES) {
      const pattern = new RegExp(`\\.editorial-button--${role}[^,{]*:hover[^,{]*\\{([^}]*)\\}`, 'g');
      for (const [whole, body] of css.matchAll(pattern)) {
        const setsGround = /(^|;)\s*background(-color)?\s*:/.test(body);
        const setsInk = /(^|;)\s*color\s*:/.test(body);
        if (setsGround && !setsInk) offenders.push(whole.split('{')[0].trim());
      }
    }
    expect(
      offenders,
      `these hover rules change the ground and leave the base's ink in force: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('has retired the roles that were negations of the base', () => {
    for (const role of RETIRED_ROLES) {
      expect(css, `--${role} should be gone`).not.toMatch(new RegExp(`\\.editorial-button--${role}\\b`));
    }
    expect(css).toMatch(/\.editorial-app \.editorial-link \{/);
  });

  it('builds every role from the control tokens rather than a chosen size', () => {
    const block = css.slice(css.indexOf('.editorial-app .editorial-button {'), css.indexOf('.editorial-form {'));
    const raw = [...block.matchAll(/(?<![-\w])(padding|min-height|border-radius)\s*:\s*([^;]+);/g)]
      .map((m) => `${m[1]}: ${m[2].trim()}`)
      .filter((d) => !/var\(--editorial-|:\s*0$|100%|auto/.test(d));
    expect(raw, `a role wrote a raw size: ${raw.join(' | ')}`).toEqual([]);
  });

  /**
   * A class in the markup that sets nothing is the defect this whole exercise
   * started from: `.editorial-cast-tier` was on every tier control and the only
   * rule naming it styled a child, so inspecting the button showed a class that
   * did nothing at all.
   */
  it('has no editorial class in the markup that styles nothing', () => {
    const stylesheets = ['workspace.css', 'tokens.css', 'reader.css']
      .map((f) => readFileSync(join(root, 'styles', f), 'utf8')).join('\n');
    // Classes that are hooks by design: a token root, or a JS/test selector.
    const HOOKS = new Set(['editorial-app']);
    const used = new Set();
    for (const file of components) {
      for (const m of readFileSync(file, 'utf8').matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
        for (const cls of (m[1] ?? m[2] ?? '').split(/\s+/)) {
          if (/^editorial-[\w-]+$/.test(cls)) used.add(cls);
        }
      }
    }
    const rules = [...stylesheets.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, , body]) => /[a-z-]+\s*:/.test(body));

    /** Does any rule set a property on the element carrying this class? */
    const stylesItsOwnElement = (cls) => rules.some(([, sel]) =>
      sel.split(',').some((one) => {
        const subject = one.trim().split(/\s+|>/).filter(Boolean).pop() ?? '';
        return new RegExp(`\\.${cls}(?![\\w-])`).test(subject);
      }));

    const inert = [...used].filter((cls) => {
      if (HOOKS.has(cls)) return false;
      if (stylesItsOwnElement(cls)) return false;
      // A --modifier is allowed to work only by scoping its block's children;
      // that is what a modifier is for. A block name that styles nothing is the
      // .editorial-cast-tier defect: a class on the element, changing nothing
      // about it, while the appearance comes from somewhere else entirely.
      if (!cls.includes('--')) return true;
      return !rules.some(([, sel]) => new RegExp(`\\.${cls}(?![\\w-])`).test(sel));
    });
    expect(inert, `these classes are in the markup and style nothing: ${inert.join(', ')}`).toEqual([]);
  });

  it('finds the buttons to check', () => {
    expect(buttons().length).toBeGreaterThan(10);
  });

  it('has no button without a class', () => {
    const naked = buttons().filter((b) => b.className === null).map((b) => b.file);
    expect([...new Set(naked)]).toEqual([]);
  });

  it('has every button declare a role, or say plainly that it is a link', () => {
    const strays = buttons()
      .filter((b) => b.className !== null && !/\beditorial-(button|link)\b/.test(b.className))
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
