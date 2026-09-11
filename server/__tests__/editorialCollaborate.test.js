/**
 * Every Collaborate lets you say what you want.
 *
 * Collaborate was a bare button in twenty places, each asking with nothing
 * but the record. It goes through one control now, which offers a line of
 * instruction before it asks. A button that says Collaborate anywhere else
 * is one that skipped it.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..', 'src', 'editorial');

function sources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    return entry.name.endsWith('.tsx') ? [full] : [];
  });
}

describe('Collaborate', () => {
  it('is never a bare button: it always offers room for instructions first', () => {
    const bare = [];
    for (const file of sources(root)) {
      if (file.endsWith(path.join('components', 'Collaborate.tsx'))) continue;
      const src = readFileSync(file, 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
      for (const [button] of src.matchAll(/<button\b[\s\S]*?<\/button>/g)) {
        if (/\bCollaborate\b/.test(button)) bare.push(path.relative(root, file));
      }
    }
    expect([...new Set(bare)]).toEqual([]);
  });
});
