import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildScopedContextPack } from '../story-harness/contextPack.js';

const connectionString = process.env.STORYTIME_TEST_DATABASE_URL;

if (!connectionString) {
  throw new Error('STORYTIME_TEST_DATABASE_URL is not set.');
}

process.env.STORYTIME_DATABASE_URL = connectionString;

let app;
let db;
let testUniverseId;

beforeAll(async () => {
  db = await import('../db.js');
  await db.migrate();
  await db.run('TRUNCATE stories CASCADE');
  await db.run('TRUNCATE shared_bestiary CASCADE');
  await db.run('TRUNCATE shared_characters CASCADE');
  app = (await import('../app.js')).default;

  // Create a universe
  const uni = await request(app).post('/api/stories').send({
    title: 'Eldermoor Universe',
    description: 'A haunted moorland of barrows and wandering spectral entities.',
    type: 'universe',
  });
  testUniverseId = uni.body.id;
});

afterAll(async () => {
  await db.run('TRUNCATE stories CASCADE');
  await db.run('TRUNCATE shared_bestiary CASCADE');
  await db.run('TRUNCATE shared_characters CASCADE');
  await db.close();
});

describe('Reusable Bestiary (Task 813)', () => {
  let sharedCreatureId;

  it('creates and lists global shared bestiary entries', async () => {
    const createRes = await request(app).post('/api/bestiary/shared').send({
      name: 'Moorland Fog-Hound',
      category: 'Beast / Spectral',
      defaultHearts: 4,
      defaultTactics: ['Vanish in mist', 'Pack howling'],
      description: 'Spectral hounds that stalk travelers in peat bogs.',
      notes: 'Can be dispersed with silver fire.',
    });

    expect(createRes.status).toBe(201);
    expect(createRes.body.id).toMatch(/^shared-beast-/);
    expect(createRes.body.name).toBe('Moorland Fog-Hound');
    sharedCreatureId = createRes.body.id;

    const listRes = await request(app).get('/api/bestiary/shared');
    expect(listRes.status).toBe(200);
    expect(listRes.body.some((b) => b.id === sharedCreatureId)).toBe(true);
  });

  it('adopts a shared creature into a universe project with variant overrides', async () => {
    const adoptRes = await request(app).post('/api/bestiary/adopt-shared').send({
      projectId: testUniverseId,
      sharedBestiaryId: sharedCreatureId,
      overrideName: 'Iron-Collared Fog-Hound',
      overrideHearts: 6,
      isVariant: true,
      overrideNotes: 'Bound to the Barrow Keep.',
    });

    expect(adoptRes.status).toBe(201);
    expect(adoptRes.body.name).toBe('Iron-Collared Fog-Hound');
    expect(adoptRes.body.hearts).toBe(6);
    expect(adoptRes.body.sharedBestiaryId).toBe(sharedCreatureId);
    expect(adoptRes.body.isSharedVariant).toBe(true);
    expect(adoptRes.body.sharedBestiary.name).toBe('Moorland Fog-Hound');

    // Verify project bestiary listing returns shared attribution
    const projectList = await request(app)
      .get('/api/bestiary')
      .query({ projectId: testUniverseId });

    expect(projectList.status).toBe(200);
    const found = projectList.body.find((b) => b.id === adoptRes.body.id);
    expect(found).toBeDefined();
    expect(found.isSharedVariant).toBe(true);
    expect(found.sharedBestiaryId).toBe(sharedCreatureId);
    expect(found.sharedBestiary.name).toBe('Moorland Fog-Hound');
  });
});

describe('Reusable Characters (Task 814)', () => {
  let sharedCharId;

  it('creates and lists global shared characters', async () => {
    const createRes = await request(app).post('/api/characters/shared').send({
      name: 'Vaelen the Chronicler',
      archetype: 'Wandering Lorekeeper',
      summary: 'An ageless scholar recording the decline of great epochs.',
      background: 'Exiled from the High Archives of Oakhaven.',
      defaultTraits: ['Observant', 'Reluctant Pacifist'],
    });

    expect(createRes.status).toBe(201);
    expect(createRes.body.id).toMatch(/^shared-char-/);
    expect(createRes.body.name).toBe('Vaelen the Chronicler');
    sharedCharId = createRes.body.id;

    const listRes = await request(app).get('/api/characters/shared');
    expect(listRes.status).toBe(200);
    expect(listRes.body.some((c) => c.id === sharedCharId)).toBe(true);
  });

  it('adopts a shared character into a universe project with a local role', async () => {
    const adoptRes = await request(app).post('/api/characters/adopt-shared').send({
      projectId: testUniverseId,
      sharedCharacterId: sharedCharId,
      role: 'Curator of the Barrow Crypts',
      motivation: 'Catalog relics before the hounds consume them.',
      isVariant: false,
    });

    expect(adoptRes.status).toBe(201);
    expect(adoptRes.body.name).toBe('Vaelen the Chronicler');
    expect(adoptRes.body.role).toBe('Curator of the Barrow Crypts');
    expect(adoptRes.body.sharedCharacterId).toBe(sharedCharId);
    expect(adoptRes.body.isSharedVariant).toBe(false);
    expect(adoptRes.body.sharedCharacter.name).toBe('Vaelen the Chronicler');

    // Verify project characters listing returns shared attribution
    const projectList = await request(app)
      .get('/api/characters')
      .query({ projectId: testUniverseId });

    expect(projectList.status).toBe(200);
    const found = projectList.body.find((c) => c.id === adoptRes.body.id);
    expect(found).toBeDefined();
    expect(found.sharedCharacterId).toBe(sharedCharId);
    expect(found.sharedCharacter.archetype).toBe('Wandering Lorekeeper');
  });
});

describe('Canon Graph & Relationships (Task 815)', () => {
  let createdRelId;

  it('creates and lists typed canon relationships for a universe project', async () => {
    const createRes = await request(app).post('/api/relationships').send({
      projectId: testUniverseId,
      sourceEntityId: 'char-vaelen',
      sourceEntityType: 'character',
      targetEntityId: 'faction-barrow-keepers',
      targetEntityType: 'faction',
      relationshipType: 'allied_historian',
      confidence: 0.95,
      notes: 'Provides historical translation services in exchange for safe sanctuary.',
    });

    expect(createRes.status).toBe(201);
    expect(createRes.body.id).toMatch(/^rel-/);
    expect(createRes.body.relationshipType).toBe('allied_historian');
    createdRelId = createRes.body.id;

    // Filter by entity
    const listRes = await request(app)
      .get('/api/relationships')
      .query({ projectId: testUniverseId, entityId: 'char-vaelen' });

    expect(listRes.status).toBe(200);
    expect(listRes.body.some((r) => r.id === createdRelId)).toBe(true);
  });

  it('includes relevant relationship rows in scoped context packs', () => {
    const fullContext = {
      characters: [
        { id: 'char-vaelen', name: 'Vaelen' },
        { id: 'char-other', name: 'Other' },
      ],
      locations: [{ id: 'loc-crypts', name: 'Barrow Crypts' }],
      factions: [{ id: 'faction-barrow-keepers', name: 'Barrow Keepers' }],
      relationships: [
        {
          sourceEntityId: 'char-vaelen',
          targetEntityId: 'faction-barrow-keepers',
          relationshipType: 'allied_historian',
        },
        {
          sourceEntityId: 'unrelated-entity-1',
          targetEntityId: 'unrelated-entity-2',
          relationshipType: 'secret_feud',
        },
      ],
    };

    const pack = buildScopedContextPack(fullContext, {
      jobType: 'session_hooks',
      mustReference: ['loc-crypts'],
    });

    expect(pack.relationships).toBeDefined();
    expect(pack.relationships.some((r) => r.relationshipType === 'allied_historian')).toBe(true);
    // Unrelated relationship excluded
    expect(pack.relationships.some((r) => r.relationshipType === 'secret_feud')).toBe(false);
  });
});
