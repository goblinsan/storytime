/**
 * A control that holds state has to look like it.
 *
 * The technologies sort set was four buttons carrying `aria-pressed`, wearing
 * `editorial-link` -- a class with no `[aria-pressed]` rule anywhere. So the
 * chosen order rendered byte for byte like the other three: same ink, same
 * weight, no rule, no ground. The only thing on screen saying which order you
 * were in was the order of the rows themselves, which is the thing you were
 * trying to find out.
 *
 * Nothing caught it. `editorialButtonVocabulary` checks that a button carries
 * one of the button classes and stops; no test in this directory knew the
 * attribute existed. Both halves are checked here, because either alone is
 * satisfiable while the bug stands: a button that carries state must wear a
 * role that renders it, AND every role that claims to render it must actually
 * declare the rule.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const editorial = path.join(here, '..', '..', 'src', 'editorial');
const SHEETS = ['tokens.css', 'workspace.css', 'reader.css'];

const css = () => SHEETS
  .map((f) => readFileSync(path.join(editorial, 'styles', f), 'utf8'))
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '');

function sources(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sources(full));
    else if (entry.name.endsWith('.tsx')) {
      out.push({ file: entry.name, src: readFileSync(full, 'utf8') });
    }
  }
  return out;
}

/**
 * The roles that paint a pressed state, read out of the stylesheet rather than
 * listed here -- a hand-written list of them is the next thing to drift.
 */
function selectableRoles(sheet) {
  const found = new Set();
  for (const m of sheet.matchAll(/\.(editorial-[a-z0-9_-]+)\[aria-pressed=['"]true['"]\]/g)) {
    found.add(m[1]);
  }
  return found;
}

/** Every JSX element that sets aria-pressed, with the classes it wears. */
function pressedElements(src) {
  const out = [];
  for (const m of src.matchAll(/aria-pressed=\{/g)) {
    // The element's own tag and attributes: back to the opening '<', forward
    // to the '>' that closes the tag.
    const open = src.lastIndexOf('<', m.index);
    const close = src.indexOf('>', m.index);
    if (open === -1 || close === -1) continue;
    const tag = src.slice(open, close);
    const className = /className="([^"]*)"/.exec(tag);
    out.push({
      element: (/^<([A-Za-z][\w.]*)/.exec(tag) ?? [, '?'])[1],
      classes: className ? className[1].split(/\s+/).filter(Boolean) : [],
      // A className computed from an expression can vary with the state --
      // settings swaps `--secondary` in and out on the same condition, and
      // changes the label with it. That is a rendered state, by another
      // means. A FIXED class carrying aria-pressed is the bug: it renders
      // the same whether the control is held or not, and can only ever.
      fixed: /className="/.test(tag),
    });
  }
  return out;
}

describe('a pressed control looks pressed', () => {
  it('finds the roles and the markup it is meant to police', () => {
    // Without this the checks below pass by matching nothing, which is how a
    // guard reports success for a rule it never looked at.
    expect(selectableRoles(css()).size).toBeGreaterThan(1);
    const all = sources(editorial).flatMap((s) => pressedElements(s.src));
    expect(all.length).toBeGreaterThan(3);
  });

  it('gives every role that claims a pressed state a rule that paints one', () => {
    const sheet = css();
    const roles = selectableRoles(sheet);
    const unpainted = [];
    for (const role of roles) {
      // The rule exists; check it changes something visible rather than
      // merely existing. A selector with an empty body is not a state.
      const body = new RegExp(
        `\\.${role}\\[aria-pressed=['"]true['"]\\][^{]*\\{([^}]*)\\}`,
      ).exec(sheet);
      const declarations = (body?.[1] ?? '').split(';').map((d) => d.trim()).filter(Boolean);
      if (declarations.length === 0) unpainted.push(role);
    }
    expect(unpainted, `${unpainted.join(', ')} claims a pressed state and paints nothing`)
      .toEqual([]);
  });

  it('never puts aria-pressed on a control whose class cannot show it', () => {
    const roles = selectableRoles(css());
    const offenders = [];
    for (const { file, src } of sources(editorial)) {
      for (const el of pressedElements(src)) {
        // A component of our own is responsible for its own markup.
        if (/^[A-Z]/.test(el.element)) continue;
        if (!el.fixed) continue;
        if (el.classes.some((c) => roles.has(c))) continue;
        offenders.push(`${file}: <${el.element} className="${el.classes.join(' ')}"> `
          + 'carries aria-pressed and wears no class that renders it');
      }
    }
    expect(
      offenders,
      'a control that holds state renders identically whether or not it is held',
    ).toEqual([]);
  });
});
