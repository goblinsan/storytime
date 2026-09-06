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

/**
 * Every editorial class a component puts in a className.
 *
 * Only class names inside a className attribute count. An earlier version also
 * scanned bare quoted strings and flagged "editorial-fantasy" -- a theme id, not
 * a class -- so the scan reads the attribute's own expression and nothing else.
 */
function classNameExpressions(src) {
  const expressions = [];
  const attribute = /className=/g;
  let match;
  while ((match = attribute.exec(src)) !== null) {
    let i = match.index + match[0].length;
    if (src[i] === '"' || src[i] === "'") {
      const quote = src[i];
      const close = src.indexOf(quote, i + 1);
      if (close === -1) continue;
      expressions.push(src.slice(i + 1, close));
      continue;
    }
    if (src[i] !== '{') continue;
    let depth = 0;
    const from = i;
    for (; i < src.length; i += 1) {
      if (src[i] === '{') depth += 1;
      else if (src[i] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    expressions.push(src.slice(from + 1, i));
  }
  return expressions;
}

function usedClasses() {
  const used = new Map();
  for (const file of files.filter((f) => /\.tsx?$/.test(f) && !f.includes('__tests__'))) {
    const src = readFileSync(file, 'utf8');
    for (const expression of classNameExpressions(src)) {
      const pattern = /(editorial-[a-zA-Z0-9_-]+)/g;
      let match;
      while ((match = pattern.exec(expression)) !== null) {
        const cls = match[1];
        // A class completed by an interpolation -- `editorial-x--${mode}` -- is
        // a prefix, not a whole name. It is still checkable: some defined class
        // has to start with it, or the variants do not exist at all.
        const dynamic = expression.slice(match.index + cls.length).startsWith('${');
        const key = dynamic ? `${cls}*` : cls;
        if (!used.has(key)) used.set(key, file.replace(root, ''));
      }
    }
  }
  return used;
}

const isDefined = (name) =>
  name.endsWith('*')
    ? [...definedClasses].some((defined) => defined.startsWith(name.slice(0, -1)))
    : definedClasses.has(name);

describe('route tree structure', () => {
  it('wraps every route in an error boundary so one failing lens cannot blank the shell', () => {
    // Structural, deliberately: throwing inside a test render would be caught by
    // the boundary and pass trivially, proving nothing about the wiring.
    const source = readFileSync(join(root, 'EditorialApp.tsx'), 'utf8');
    expect(source).toContain('SurfaceBoundary');
    expect(source.match(/<SurfaceBoundary/g) ?? []).toHaveLength(2);
  });

  it('has no placeholder surface left in the pages directory', () => {
    const placeholders = files
      .filter((f) => f.includes('/pages/') && f.endsWith('.tsx'))
      .filter((f) => readFileSync(f, 'utf8').includes('PlaceholderSurface'))
      .map((f) => f.replace(root, ''));
    expect(placeholders).toEqual([]);
  });
});

describe('editorial class contract', () => {
  it('finds the stylesheets and the components', () => {
    expect(definedClasses.size).toBeGreaterThan(50);
    expect(usedClasses().size).toBeGreaterThan(15);
  });

  it('defines every class the components render', () => {
    const missing = [];
    for (const [cls, file] of usedClasses()) {
      if (!isDefined(cls)) missing.push(`${cls}  (used in ${file})`);
    }
    expect(missing).toEqual([]);
  });
});
