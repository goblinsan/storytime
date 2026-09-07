/**
 * A source is a place, not a secret.
 *
 * The row names an environment variable and the value stays in the
 * environment. A key written into a table is a key in every backup of it, in a
 * screenshot of a query, and in whatever somebody pastes into a bug report --
 * and the server can read process.env perfectly well without the database
 * knowing anything.
 *
 * The commonest way that goes wrong is not malice, it is somebody pasting the
 * key into the field asking for the variable's name, so that is refused rather
 * than stored.
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const connectionString = process.env.CONTESORA_TEST_DATABASE_URL || process.env.STORYTIME_TEST_DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'CONTESORA_TEST_DATABASE_URL is not set. These tests need a Postgres they '
      + 'are allowed to truncate. Skipping them silently would report success '
      + 'for a suite that never ran.',
  );
}

process.env.CONTESORA_DATABASE_URL = connectionString;

let app;
let db;
let projectId;

beforeAll(async () => {
  db = await import('../db.js');
  await db.migrate();
  await db.run('TRUNCATE stories CASCADE');
  app = (await import('../app.js')).default;
  const created = await request(app).post('/api/stories').send({ title: 'Image Source Universe' });
  projectId = created.body.id;
});

afterAll(async () => {
  await db.run('TRUNCATE stories CASCADE');
  await db.close();
});

describe('image sources', () => {
  it('registers a ComfyUI by endpoint', async () => {
    const res = await request(app).post('/api/image-sources').send({
      projectId,
      label: 'A ComfyUI',
      kind: 'comfyui',
      endpoint: 'http://127.0.0.1:5410',
      model: 'sd_xl_base_1.0.safetensors',
      options: { steps: 30 },
    });
    expect(res.status).toBe(201);
    expect(res.body.options).toEqual({ steps: 30 });
    // Nothing to be ready: a ComfyUI on your own network needs no key.
    expect(res.body.credentialReady).toBe(true);
  });

  it('refuses a ComfyUI with nowhere to reach it', async () => {
    const res = await request(app).post('/api/image-sources').send({
      projectId, label: 'Nowhere', kind: 'comfyui',
    });
    expect(res.status).toBe(400);
  });

  it('refuses a hosted source with no variable named', async () => {
    const res = await request(app).post('/api/image-sources').send({
      projectId, label: 'OpenAI', kind: 'openai',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/credentialEnv/);
  });

  it('refuses a key pasted where the variable name goes', async () => {
    // The mistake this whole design exists to prevent, so it fails loudly
    // rather than being written down.
    for (const pasted of ['sk-abcdef0123456789', 'AIzaSyAbcdef0123456789']) {
      const res = await request(app).post('/api/image-sources').send({
        projectId, label: 'Pasted', kind: 'openai', credentialEnv: pasted,
      });
      expect(res.status, `${pasted} should be refused`).toBe(400);
    }
  });

  it('reports whether the named variable is set, never what it holds', async () => {
    process.env.A_TEST_IMAGE_KEY = 'super-secret-value';
    try {
      const res = await request(app).post('/api/image-sources').send({
        projectId, label: 'Hosted', kind: 'gemini', credentialEnv: 'A_TEST_IMAGE_KEY',
      });
      expect(res.status).toBe(201);
      expect(res.body.credentialReady).toBe(true);
      expect(res.body.credentialEnv).toBe('A_TEST_IMAGE_KEY');
      // The value must not appear anywhere in what comes back.
      expect(JSON.stringify(res.body)).not.toContain('super-secret-value');

      const listed = await request(app).get(`/api/image-sources?projectId=${projectId}`);
      expect(JSON.stringify(listed.body)).not.toContain('super-secret-value');
    } finally {
      delete process.env.A_TEST_IMAGE_KEY;
    }
  });

  it('says when the named variable is not set', async () => {
    const res = await request(app).post('/api/image-sources').send({
      projectId, label: 'Unset', kind: 'gemini', credentialEnv: 'DEFINITELY_NOT_SET_ANYWHERE',
    });
    expect(res.body.credentialReady).toBe(false);
  });

  it('keeps one default per universe', async () => {
    const first = await request(app).post('/api/image-sources').send({
      projectId, label: 'First', kind: 'comfyui', endpoint: 'http://a', isDefault: true,
    });
    const second = await request(app).post('/api/image-sources').send({
      projectId, label: 'Second', kind: 'comfyui', endpoint: 'http://b', isDefault: true,
    });
    expect(second.status).toBe(201);

    const listed = await request(app).get(`/api/image-sources?projectId=${projectId}`);
    const defaults = listed.body.filter((s) => s.isDefault);
    expect(defaults, 'generating should never have to choose between two defaults').toHaveLength(1);
    expect(defaults[0].id).toBe(second.body.id);
    expect(listed.body.find((s) => s.id === first.body.id).isDefault).toBe(false);
  });
});

describe('a work carries how it wants to look', () => {
  it('stores a style and its negative, and lets them be cleared', async () => {
    const work = await request(app).post('/api/derivatives').send({
      projectId, type: 'story', title: 'A Work',
    });
    expect(work.status).toBe(201);
    expect(work.body.imageStyle).toBe('');

    const styled = await request(app).put(`/api/derivatives/${work.body.id}`).send({
      imageStyle: 'warm painted storybook illustration',
      imageStyleNegative: 'photorealistic, watermark',
    });
    expect(styled.body.imageStyle).toBe('warm painted storybook illustration');
    expect(styled.body.imageStyleNegative).toBe('photorealistic, watermark');

    // Empty is a real value: it is how somebody takes a style off again.
    const cleared = await request(app).put(`/api/derivatives/${work.body.id}`).send({ imageStyle: '' });
    expect(cleared.body.imageStyle).toBe('');
    expect(cleared.body.imageStyleNegative, 'the other one is left alone')
      .toBe('photorealistic, watermark');
  });
});
