/**
 * A class that names a field styles a field, whichever tag it is on.
 *
 * `.editorial-field__input` was declared once, as `textarea.editorial-field__input`.
 * Three surfaces put the class on an `<input>` -- the timeline's part name,
 * the bestiary's range note, geography's place name -- and all three matched
 * nothing, rendering the browser's own 2px inset box in the system font inside
 * a warm-paper editorial page.
 *
 * It had been found before. The fix was a second rule for that one input, with
 * a comment in the stylesheet explaining the trap exactly. A comment is not a
 * check, and the trap caught three more.
 *
 * So the rule has teeth: if a component class is used on an element in the
 * markup, the stylesheet may not qualify every one of its declarations to a
 * DIFFERENT element. Nothing about this is visible in either file alone --
 * the CSS is valid, the JSX is valid, and the damage is that they do not meet.
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

/** Every .tsx under the editorial tree, at any depth. */
function sources(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sources(full));
    else if (entry.name.endsWith('.tsx')) out.push({ file: entry.name, src: readFileSync(full, 'utf8') });
  }
  return out;
}

/**
 * Which tags a class is written on in the markup.
 *
 * Read backwards from the className to the nearest opening tag, because JSX
 * puts attributes on the lines after the element and the two can be far apart.
 */
function tagsUsingClass(src) {
  const found = new Map();
  for (const match of src.matchAll(/className="([^"{}]+)"/g)) {
    const before = src.slice(0, match.index);
    const tag = [...before.matchAll(/<([a-z][a-zA-Z0-9]*)\b/g)].pop();
    if (!tag) continue;
    for (const name of match[1].split(/\s+/).filter(Boolean)) {
      if (!name.startsWith('editorial-')) continue;
      if (!found.has(name)) found.set(name, new Set());
      found.get(name).add(tag[1]);
    }
  }
  return found;
}

/** Which element each declaration of a class is qualified to, if any. */
function qualifiersOf(sheet, name) {
  const qualifiers = [];
  const pattern = new RegExp(`(^|[\\s,>+~])([a-z][a-zA-Z0-9]*)?\\.${name}(?![\\w-])`, 'g');
  for (const m of sheet.matchAll(pattern)) qualifiers.push(m[2] ?? null);
  return qualifiers;
}

describe('a field class styles the tag it is used on', () => {
  it('finds the markup it is meant to police', () => {
    // Without this the check below passes by matching nothing, which is how a
    // guard reports success for a rule it never looked at.
    const all = sources(editorial).flatMap((s) => [...tagsUsingClass(s.src).keys()]);
    expect(new Set(all).size).toBeGreaterThan(60);
  });

  it('never qualifies every declaration to an element the markup does not use', () => {
    const sheet = css();
    const offenders = [];

    for (const { file, src } of sources(editorial)) {
      for (const [name, tags] of tagsUsingClass(src)) {
        const qualifiers = qualifiersOf(sheet, name);
        // Declared nowhere is a different rule's business, and an unqualified
        // declaration means the class applies to anything.
        if (qualifiers.length === 0 || qualifiers.some((q) => q === null)) continue;
        const styled = new Set(qualifiers);
        for (const tag of tags) {
          if (!styled.has(tag)) {
            offenders.push(`${file}: <${tag} className="${name}"> matches nothing — `
              + `every rule for it is qualified ${[...styled].map((t) => `${t}.`).join(' / ')}`);
          }
        }
      }
    }

    expect(
      offenders,
      'a class carried by one element is styled only for another, so it renders '
        + "as the browser's own control",
    ).toEqual([]);
  });
});
