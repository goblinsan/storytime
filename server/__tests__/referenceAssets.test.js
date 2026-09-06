/**
 * Reference art needs an address before anything can render it.
 *
 * import/README.md tells the author to drop files in `import/` and pull them
 * into the app; that pipeline writes blobs into `assets`, and no route ever
 * returns their content. The editorial media studio reads `media_assets`,
 * which stores a URL. The two were never connected, so a portrait could sit on
 * disk, be named in canon prose, and be unreachable by any URL.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// app.js pulls in the db at import time and refuses to start without a
// connection, so the URL has to be set before it is loaded.
const connectionString = process.env.STORYTIME_TEST_DATABASE_URL;
if (!connectionString) throw new Error('STORYTIME_TEST_DATABASE_URL is not set.');
process.env.STORYTIME_DATABASE_URL = connectionString;

let app;

const importDir = fileURLToPath(new URL('../../import/', import.meta.url));
const nested = join(importDir, '__reference_test__');
const file = join(nested, 'probe.png');

// A one-pixel PNG, so the assertion is about routing rather than about images.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('reference assets are addressable', () => {
  beforeAll(async () => {
    mkdirSync(nested, { recursive: true });
    writeFileSync(file, PNG);
    app = (await import('../app.js')).default;
  });
  afterAll(() => rmSync(nested, { recursive: true, force: true }));

  it('serves a file placed in the import directory', async () => {
    const res = await request(app).get('/reference/__reference_test__/probe.png');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/png/);
    expect(res.body.length).toBe(PNG.length);
  });

  it('serves it under the preview prefix too', async () => {
    const res = await request(app).get('/storytime/reference/__reference_test__/probe.png');
    expect(res.status).toBe(200);
  });

  it('does not hand back the SPA shell for a missing asset', async () => {
    // Without fallthrough:false the catch-all answers 200 with index.html, and
    // an <img> pointed at a moved file silently renders nothing rather than
    // firing an error the UI can act on.
    const res = await request(app).get('/reference/__reference_test__/gone.png');
    expect(res.status).toBe(404);
    // The status is what an <img> onError reacts to. What must not happen is a
    // 200 carrying the SPA shell, which decodes as nothing and fires no error.
    expect(res.text ?? '').not.toMatch(/id="root"/);
  });

  it('refuses to climb out of the import directory', async () => {
    const res = await request(app).get('/reference/..%2f..%2fpackage.json');
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
