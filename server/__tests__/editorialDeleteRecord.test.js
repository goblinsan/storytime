/**
 * Every record surface can delete what it shows.
 *
 * Nothing on these surfaces could be deleted: the server had the routes and no
 * page called them. The rule is checked against the surfaces themselves --
 * every page that lets a record be renamed from its heading shows it in full,
 * and so offers Delete -- plus Media, whose pictures have no heading to rename.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const pages = path.join(here, '..', '..', 'src', 'editorial', 'pages');
const read = (name) => readFileSync(path.join(pages, name), 'utf8');

describe('deleting records', () => {
  const records = readdirSync(pages).filter((f) => f.endsWith('.tsx') && read(f).includes('<RecordTitle'));

  it('finds the record surfaces it is checking', () => {
    expect(records.length).toBeGreaterThanOrEqual(8);
  });

  it('offers Delete on every surface that shows a record, and in Media', () => {
    const missing = [...records, 'Media.tsx'].filter((f) => !read(f).includes('<DeleteCanon'));
    expect(missing, 'these surfaces show a record and cannot delete it').toEqual([]);
  });
});
