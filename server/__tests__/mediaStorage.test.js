/**
 * A kept picture must outlive the machine that drew it.
 *
 * A generated preview's URL points into ComfyUI's output folder. That folder
 * gets cleared, and its filenames count from one and start again when it is,
 * so cataloguing that URL records a promise nobody kept: the same address is a
 * different picture next week, or nothing at all.
 *
 * Keeping therefore copies the bytes onto the storage volume before writing
 * the row down. These tests hold three things about that: it really copies, it
 * writes nowhere when no volume is configured (rather than falling back to
 * somewhere convenient and local), and a copy that fails does not leave a
 * catalogued asset pointing at a file that was never written.
 */
import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const connectionString = process.env.CONTESORA_TEST_DATABASE_URL || process.env.STORYTIME_TEST_DATABASE_URL;
if (!connectionString) throw new Error('CONTESORA_TEST_DATABASE_URL is not set.');
process.env.CONTESORA_DATABASE_URL = connectionString;

/** A one-pixel PNG. Small, and genuinely decodable, unlike a string of bytes. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

let db;
let app;
let store;
let projectId;
/** Stands in for the render machine: somewhere with an image and a URL for it. */
let elsewhere;
let elsewhereUrl;
let served = { body: PNG, type: 'image/png', status: 200 };

beforeAll(async () => {
  db = await import('../db.js');
  await db.migrate();
  app = (await import('../app.js')).default;
  store = await import('../mediaStore.js');

  elsewhere = createServer((req, res) => {
    if (served.status !== 200) {
      res.writeHead(served.status).end('no');
      return;
    }
    res.writeHead(200, { 'content-type': served.type }).end(served.body);
  });
  await new Promise((resolve) => { elsewhere.listen(0, '127.0.0.1', resolve); });
  elsewhereUrl = `http://127.0.0.1:${elsewhere.address().port}/contesora_00001_.png`;
});

afterAll(async () => {
  await new Promise((resolve) => { elsewhere.close(resolve); });
  await db.run('TRUNCATE stories CASCADE');
  await db.close();
});

beforeEach(async () => {
  served = { body: PNG, type: 'image/png', status: 200 };
  delete process.env.CONTESORA_MEDIA_DIR;
  await db.run('TRUNCATE stories CASCADE');
  projectId = randomUUID();
  await db.run(
    `INSERT INTO stories (id, title, author, description, content, type, created_at, updated_at)
     VALUES (?, 'Void Requiem', '', '', '', 'universe', now(), now())`, projectId,
  );
});

afterEach(() => { delete process.env.CONTESORA_MEDIA_DIR; });

/** What is actually kept there. The volume's own marker is not media. */
const keptFiles = async (dir) => (await readdir(dir)).filter((f) => !f.startsWith('.'));

/** A directory that is the storage volume: configured, and carrying its marker. */
const givenStorage = async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'contesora-media-'));
  await writeFile(path.join(dir, '.contesora-volume'), 'test');
  process.env.CONTESORA_MEDIA_DIR = dir;
  return dir;
};

/** Configured, pointed at a directory that exists, and NOT the volume. */
const givenUnmountedVolume = async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'contesora-notmounted-'));
  process.env.CONTESORA_MEDIA_DIR = dir;
  return dir;
};

describe('keeping a picture', () => {
  it('copies the bytes onto storage and serves them from there', async () => {
    const dir = await givenStorage();
    const kept = await store.keepImage(elsewhereUrl);

    expect(kept.stored).toBe(true);
    expect(kept.url.startsWith('/media-files/')).toBe(true);
    const written = await keptFiles(dir);
    expect(written).toHaveLength(1);
    expect(await readFile(path.join(dir, written[0]))).toEqual(PNG);
    // The recorded URL names the file that was actually written.
    expect(kept.url).toBe(`/media-files/${written[0]}`);
  });

  it('names the file after its content, so the render machine cannot rename it', async () => {
    const dir = await givenStorage();
    const first = await store.keepImage(elsewhereUrl);

    // Same picture, different address: ComfyUI's counter restarts whenever its
    // output folder is cleared, so its filenames are positions, not names.
    const again = await store.keepImage(elsewhereUrl.replace('00001', '00001_'));
    expect(again.url).toBe(first.url);
    expect(await keptFiles(dir), 'the same picture is one file').toHaveLength(1);

    served = { ...served, body: Buffer.concat([PNG, Buffer.from([0])]) };
    const other = await store.keepImage(elsewhereUrl);
    expect(other.url).not.toBe(first.url);
    expect(await keptFiles(dir)).toHaveLength(2);
  });

  it('writes nowhere at all when no storage is configured', async () => {
    // The failure this guards against is a default. A write path that falls
    // back to a convenient local directory puts project images on the disk of
    // the machine hosting the app, which is the one place they must not be.
    expect(store.mediaDir()).toBeNull();
    const kept = await store.keepImage(elsewhereUrl);
    expect(kept.stored).toBe(false);
    expect(kept.url, 'it keeps the URL it came with rather than losing the picture')
      .toBe(elsewhereUrl);
    expect(kept.detail).toMatch(/CONTESORA_MEDIA_DIR/);
  });

  it('writes nothing when the volume is configured but not mounted', async () => {
    // The dangerous case, and the one that looks identical from inside the
    // container: the bind mount is `nofail`, so a storage node that was down at
    // boot leaves a directory that exists, is writable, and is the app host's
    // own disk. "Empty" and "not mounted" are the same picture; the marker is
    // what tells them apart.
    const dir = await givenUnmountedVolume();
    const kept = await store.keepImage(elsewhereUrl);

    expect(kept.stored).toBe(false);
    expect(kept.url, 'the picture is not lost, it just did not move').toBe(elsewhereUrl);
    expect(kept.detail).toMatch(/not mounted/);
    expect(await readdir(dir), 'nothing may land on the host disk').toHaveLength(0);
  });

  it('refuses something that is not an image', async () => {
    await givenStorage();
    served = { body: Buffer.from('<html>login</html>'), type: 'text/html', status: 200 };
    await expect(store.keepImage(elsewhereUrl)).rejects.toThrow(/not an image/);
  });
});

describe('cataloguing an accepted preview', () => {
  it('adopts it, and records where it now lives', async () => {
    const dir = await givenStorage();
    const res = await request(app).post('/api/media').send({
      projectId, url: elsewhereUrl, kind: 'reference', title: 'Malakor', adopt: true,
    });

    expect(res.status).toBe(201);
    expect(res.body.stored).toBe(true);
    expect(res.body.url.startsWith('/media-files/'), `got ${res.body.url}`).toBe(true);
    expect(await keptFiles(dir)).toHaveLength(1);
  });

  it('serves the kept picture back from storage', async () => {
    await givenStorage();
    const kept = await request(app).post('/api/media').send({
      projectId, url: elsewhereUrl, kind: 'reference', title: 'Malakor', adopt: true,
    });

    // The whole point of copying is that the recorded URL still works when the
    // machine that drew it does not, so the read path is worth exercising.
    const read = await request(app).get(kept.body.url);
    expect(read.status).toBe(200);
    expect(read.headers['content-type']).toMatch(/image\/png/);
    expect(Buffer.from(read.body)).toEqual(PNG);
  });

  it('leaves an ordinary catalogue entry alone', async () => {
    await givenStorage();
    const res = await request(app).post('/api/media').send({
      projectId, url: '/reference/already-somewhere.png', kind: 'reference', title: 'Held',
    });
    expect(res.body.url).toBe('/reference/already-somewhere.png');
    expect(res.body.stored).toBe(false);
  });

  it('will not adopt onto an unmounted volume', async () => {
    const dir = await givenUnmountedVolume();
    const res = await request(app).post('/api/media').send({
      projectId, url: elsewhereUrl, kind: 'reference', title: 'Malakor', adopt: true,
    });

    // Catalogued, because the picture is real and the choice was made -- but
    // pointing where it came from, and saying plainly that it did not move.
    expect(res.status).toBe(201);
    expect(res.body.stored).toBe(false);
    expect(res.body.url).toBe(elsewhereUrl);
    expect(res.body.storage).toMatch(/not mounted/);
    expect(await readdir(dir)).toHaveLength(0);
  });

  it('catalogues nothing when the copy fails', async () => {
    await givenStorage();
    served = { ...served, status: 404 };
    const res = await request(app).post('/api/media').send({
      projectId, url: elsewhereUrl, kind: 'reference', title: 'Gone', adopt: true,
    });

    expect(res.status).toBe(502);
    const listed = await request(app).get(`/api/media?projectId=${projectId}`);
    expect(listed.body, 'a row here would point at a file that was never written')
      .toHaveLength(0);
  });
});
