/**
 * Every editorial class a component renders must exist in the stylesheets.
 *
 * `.editorial-button` was referenced by the responsive touch-target rules but
 * never actually defined, so anything using it rendered as an unstyled link and
 * nothing failed. A class name is a contract between the components and the
 * design system, and it is checkable.
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

const files = walk(root);

const stylesheetText = files
  .filter((f) => f.endsWith('.css'))
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '');

/** Every class the stylesheets actually define a rule for. */
const definedClasses = new Set(
  [...stylesheetText.matchAll(/\.(editorial-[a-zA-Z0-9_-]+)/g)].map((m) => m[1]),
);

/** Every editorial class a component puts in a className. */
function usedClasses() {
  const used = new Map();
  for (const file of files.filter((f) => /\.tsx?$/.test(f) && !f.includes('__tests__'))) {
    const src = readFileSync(file, 'utf8');
    for (const [, literal] of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\})/g)) {
      for (const cls of String(literal ?? '').split(/[\s${}?:'"`]+/)) {
        if (cls.startsWith('editorial-')) {
          if (!used.has(cls)) used.set(cls, file.replace(root, ''));
        }
      }
    }
    // Class names built in a ternary or an array join, e.g. 'editorial-x--active'.
    // Only in .tsx: a bare editorial- string in a .ts module is a theme id or a
    // storage key, not a class name.
    if (file.endsWith('.tsx')) {
      for (const [, cls] of src.matchAll(/'(editorial-[a-zA-Z0-9_-]+)'/g)) {
        if (!used.has(cls)) used.set(cls, file.replace(root, ''));
      }
    }
  }
  return used;
}

describe('editorial class contract', () => {
  it('finds the stylesheets and the components', () => {
    expect(definedClasses.size).toBeGreaterThan(50);
    expect(usedClasses().size).toBeGreaterThan(15);
  });

  it('defines every class the components render', () => {
    const missing = [];
    for (const [cls, file] of usedClasses()) {
      if (!definedClasses.has(cls)) missing.push(`${cls}  (used in ${file})`);
    }
    expect(missing).toEqual([]);
  });
});
