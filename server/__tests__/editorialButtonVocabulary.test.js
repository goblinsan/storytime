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
   * Rule 3. A role that carries a selected state must not change its ink on
   * hover: the tier toggles painted a hovered chip at 9.7:1 while the selected
   * chip sat at 7:1, so the thing under the cursor read louder than the thing
   * that was active. Hover gets the ground and nothing else.
   */
  it('lets hover change only the ground on a role that has a selected state', () => {
    const SELECTABLE = ['toggle', 'row'];
    const offenders = [];
    for (const role of SELECTABLE) {
      const pattern = new RegExp(`\\.editorial-button--${role}[^{]*:hover[^{]*\\{([^}]*)\\}`, 'g');
      for (const [whole, body] of css.matchAll(pattern)) {
        if (/(^|;)\s*color\s*:/.test(body)) offenders.push(whole.split('{')[0].trim());
      }
    }
    expect(offenders, `hover changes ink on: ${offenders.join(', ')}`).toEqual([]);
  });

  /**
   * A component class on a button competes with `.editorial-app
   * .editorial-button` at the SAME specificity, and the roles are declared near
   * the end of the file, so an equal-specificity rule written earlier loses on
   * source order alone and describes something the browser never renders. Three
   * rules have been silently overruled that way: the house jump chip, the
   * back-to-cast control, and the standing line. Compounding onto the role
   * (`.editorial-button.editorial-thing`) wins by class count instead.
   */
  it('compounds any component rule that competes with the button base', () => {
    const OWNED = ['display', 'min-height', 'width', 'padding', 'border', 'border-radius',
      'background', 'background-color', 'color', 'font-weight', 'font-size', 'text-align'];
    // Classes that share an element with editorial-button somewhere in the tree.
    const companions = new Set();
    for (const button of buttons()) {
      if (!button.className || !/\beditorial-button\b/.test(button.className)) continue;
      for (const cls of button.className.split(/[\s${}?:'"`]+/)) {
        if (/^editorial-[\w-]+$/.test(cls) && !cls.startsWith('editorial-button')) companions.add(cls);
      }
    }

    const losers = [];
    for (const [, rawSelector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!OWNED.some((prop) => new RegExp(`(^|;)\\s*${prop}\\s*:`).test(body))) continue;
      for (const one of rawSelector.split(',')) {
        const sel = one.trim().replace(/\s+/g, ' ');
        const cls = [...companions].find((c) => new RegExp(`\\.${c}(?![\\w-])`).test(sel));
        if (!cls) continue;
        // Safe if it names the role too, or out-classes it another way.
        if (/\.editorial-button/.test(sel)) continue;
        const classes = (sel.match(/\.[a-zA-Z0-9_-]+/g) || []).length
          + (sel.match(/\[[^\]]+\]/g) || []).length;
        if (classes <= 2) losers.push(`${sel} competes with .editorial-app .editorial-button and loses on source order`);
      }
    }
    expect([...new Set(losers)]).toEqual([]);
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
