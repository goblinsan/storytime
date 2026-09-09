/**
 * The route and the database agree about what a subject can be.
 *
 * `subject_type` is allow-listed twice: once in `server/routes/media.js` as a
 * Set, and once in the table as a CHECK constraint. Adding 'universe' to the
 * first and not the second meant the application accepted the request, copied
 * the picture onto network storage, and only then hit a constraint that had
 * never heard of it -- a 500, an orphaned file on the volume, and the process
 * gone with it.
 *
 * Neither list is wrong on its own. The bug is that there are two, and the
 * only way to notice was to write one and watch it fail. `kind` is checked the
 * same way for the same reason.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const connectionString = process.env.CONTESORA_TEST_DATABASE_URL || process.env.STORYTIME_TEST_DATABASE_URL;
if (!connectionString) throw new Error('CONTESORA_TEST_DATABASE_URL is not set.');
process.env.CONTESORA_DATABASE_URL = connectionString;

const ROUTE = readFileSync(
  fileURLToPath(new URL('../routes/media.js', import.meta.url)), 'utf8',
);

/** The values a `new Set([...])` in the route lists. */
function declared(name) {
  const match = ROUTE.match(new RegExp(`const ${name} = new Set\\(\\[([^\\]]*)\\]`));
  if (!match) return null;
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
}

/** The values a CHECK constraint admits, read from the live table. */
async function allowed(db, constraint) {
  const row = await db.get(
    'SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = ?', constraint,
  );
  if (!row) return null;
  return [...row.def.matchAll(/'([^']+)'::text/g)].map((m) => m[1]).sort();
}

let db;

beforeAll(async () => {
  db = await import('../db.js');
  await db.migrate();
});

afterAll(async () => { await db.close(); });

describe('the route and the table allow the same subjects', () => {
  it('finds both lists at all', () => {
    // Without this the checks below pass by comparing nothing to nothing,
    // which is how a guard reports success for a rule it never looked at.
    expect(declared('SUBJECT_TYPES'), 'the route no longer declares SUBJECT_TYPES this way')
      .toBeTruthy();
    expect(declared('KINDS'), 'the route no longer declares KINDS this way').toBeTruthy();
  });

  it('agrees about subject_type', async () => {
    expect(
      await allowed(db, 'media_assets_subject_type_check'),
      'the route accepts subjects the table refuses, or the other way round',
    ).toEqual(declared('SUBJECT_TYPES'));
  });

  it('agrees about kind', async () => {
    expect(
      await allowed(db, 'media_assets_kind_check'),
      'the route accepts kinds the table refuses, or the other way round',
    ).toEqual(declared('KINDS'));
  });
});
