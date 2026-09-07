/**
 * Reference art needs an address before anything can render it.
 *
 * import/README.md tells the author to drop files in `import/` and pull them
 * into the app; that pipeline writes blobs into `assets`, and no route ever
 * returns their content. The editorial media studio reads `media_assets`,
 * which stores a URL. The two were never connected, so a portrait could sit on
 * disk, be named in canon prose, and be unreachable by any URL.
 */
import express from 'express';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// app.js pulls in the db at import time and refuses to start without a
// connection, so the URL has to be set before it is loaded.
const connectionString = process.env.CONTESORA_TEST_DATABASE_URL || process.env.STORYTIME_TEST_DATABASE_URL;
if (!connectionString) throw new Error('CONTESORA_TEST_DATABASE_URL is not set.');
process.env.CONTESORA_DATABASE_URL = connectionString;

let app;
let db;

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
    db = await import('../db.js');
    app = (await import('../app.js')).default;
  });

  afterAll(async () => {
    rmSync(nested, { recursive: true, force: true });
    await db.close();
  });

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

/**
 * The deployment mode. Project images must not land on the disk of the machine
 * hosting the app: they are streamed from a read-only file service on the node
 * that owns the large storage volume.
 */
describe('reference assets stream from network storage', () => {
  let origin;
  let store;
  let served;
  let streamed;
  let streamedDb;

  beforeAll(async () => {
    // A stand-in for the storage node's read-only file service.
    store = express();
    store.get('/:name', (req, res) => {
      served.push(req.method + ' ' + req.params.name);
      if (req.params.name !== 'probe.png') return res.status(404).end();
      res.type('png').send(PNG);
    });
    origin = await new Promise((resolve) => {
      store = store.listen(0, () => resolve(`http://127.0.0.1:${store.address().port}`));
    });
    process.env.STORYTIME_REFERENCE_ORIGIN = origin;
    // A second module registry means a second app and a second pool; both are
    // this block's to close, and the listening stand-in is too. Left open they
    // hold the worker's event loop for the rest of the run.
    vi.resetModules();
    streamedDb = await import('../db.js?streaming');
    streamed = (await import('../app.js?streaming')).default;
  });

  afterAll(async () => {
    delete process.env.STORYTIME_REFERENCE_ORIGIN;
    await streamedDb.close();
    await new Promise((resolve) => store.close(resolve));
  });

  beforeEach(() => { served = []; });

  it('streams a file from the origin rather than from local disk', async () => {
    const res = await request(streamed).get('/reference/probe.png');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/png/);
    expect(res.body.length).toBe(PNG.length);
    expect(served).toContain('GET probe.png');
  });

  it('writes nothing to the import directory while doing it', () => {
    // Streaming that quietly caches to disk would defeat the whole point.
    expect(readdirSync(importDir)).not.toContain('probe.png');
  });

  it('reports a missing asset as missing', async () => {
    const res = await request(streamed).get('/reference/gone.png');
    expect(res.status).toBe(404);
  });

  it('refuses a path that tries to climb out of the store', async () => {
    const res = await request(streamed).get('/reference/..%2fsecret');
    expect(res.status).toBe(400);
    expect(served).toEqual([]);
  });

  it('is read-only', async () => {
    const res = await request(streamed).post('/reference/probe.png').send(PNG);
    expect(res.status).toBe(405);
  });
});
