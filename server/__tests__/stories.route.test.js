import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Point the store at a throwaway file before anything imports it. server/db.js
// opens its database at import time, so this has to happen before the dynamic
// import below, and the import cannot be a static one.
const dbFile = path.join(os.tmpdir(), `storytime-test-${process.pid}-${Date.now()}.db`);
process.env.STORYTIME_DB_PATH = dbFile;

let app;

beforeAll(async () => {
  app = (await import('../app.js')).default;
});

afterAll(() => {
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(dbFile + suffix, { force: true });
  }
});

describe('the test harness itself', () => {
  it('runs against a throwaway database, not the development one', () => {
    expect(process.env.STORYTIME_DB_PATH).toBe(dbFile);
    expect(fs.existsSync(dbFile)).toBe(true);
    expect(path.resolve(dbFile)).not.toBe(
      path.resolve(path.join(import.meta.dirname, '..', '..', 'storytime.db')),
    );
  });
});

describe('GET /api/health', () => {
  it('reports ok with a timestamp', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(Number.isNaN(Date.parse(response.body.timestamp))).toBe(false);
  });
});

describe('stories', () => {
  it('starts empty', async () => {
    const response = await request(app).get('/api/stories');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('creates a project and returns it with the fields it was given', async () => {
    const response = await request(app)
      .post('/api/stories')
      .send({ title: 'The Salt Road', author: 'Wren', type: 'campaign' });

    expect(response.status).toBe(201);
    expect(response.body.title).toBe('The Salt Road');
    expect(response.body.author).toBe('Wren');
    expect(response.body.type).toBe('campaign');
    expect(response.body.id).toEqual(expect.any(String));
    expect(response.body.isPublished).toBe(false);
    expect(response.body.characters).toEqual([]);
  });

  it('lists a created project, and defaults the fields it was not given', async () => {
    const created = await request(app)
      .post('/api/stories')
      .send({ title: 'Ash and Ledger' });

    const listed = await request(app).get('/api/stories');

    expect(listed.status).toBe(200);
    const found = listed.body.find((story) => story.id === created.body.id);
    expect(found).toBeDefined();
    expect(found.title).toBe('Ash and Ledger');
    expect(found.author).toBe('');
    expect(found.type).toBe('story');
    expect(found.characters).toEqual([]);
  });

  it('filters the list by type', async () => {
    await request(app).post('/api/stories').send({ title: 'Only Ours', type: 'oneshot' });

    const response = await request(app).get('/api/stories').query({ type: 'oneshot' });

    expect(response.status).toBe(200);
    expect(response.body.length).toBeGreaterThan(0);
    for (const story of response.body) {
      expect(story.type).toBe('oneshot');
    }
    expect(response.body.some((story) => story.title === 'Only Ours')).toBe(true);
  });
});
