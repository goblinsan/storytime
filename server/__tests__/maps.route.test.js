/**
 * A place has many maps, and a pin is a position on one of them.
 *
 * The worst outcome for this surface is a place that is one thing on the
 * drawing and another in the records; the second worst is a picture that looks
 * authoritative about a position nobody chose. So: a pin carries no facts, and
 * one an agent guessed is stored as `proposed` and stays visibly a guess until
 * somebody says otherwise.
 *
 * The many-maps rule is the one that shapes everything else. A city has a
 * street plan and a trade-route map and a map of the siege, and the same market
 * sits at a different point on each -- so a pin that named the *place* whose map
 * it was on, rather than the drawing, could only ever hold one of those.
 */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const connectionString = process.env.CONTESORA_TEST_DATABASE_URL || process.env.STORYTIME_TEST_DATABASE_URL;
if (!connectionString) throw new Error('CONTESORA_TEST_DATABASE_URL is not set.');
process.env.CONTESORA_DATABASE_URL = connectionString;

let db;
let app;
let projectId;
let region;
let town;
let streetPlan;

/** A map of a place, without going through the render machine to get one. */
async function drawMap(locationId, { purpose = '', primary = false, url = null } = {}) {
  const assetId = randomUUID();
  await db.run(`
    INSERT INTO media_assets (id, project_id, url, kind, title, subject_type, subject_id)
    VALUES (?, ?, ?, 'map', 'A map', 'location', ?)
  `, assetId, projectId, url ?? `/media-files/${assetId}.png`, locationId);
  const mapId = randomUUID();
  await db.run(`
    INSERT INTO location_maps (id, project_id, location_id, media_asset_id, purpose, is_primary)
    VALUES (?, ?, ?, ?, ?, ?)
  `, mapId, projectId, locationId, assetId, purpose, primary);
  return mapId;
}

beforeAll(async () => {
  db = await import('../db.js');
  await db.migrate();
  app = (await import('../app.js')).default;
});

afterAll(async () => {
  await db.run('TRUNCATE stories CASCADE');
  await db.close();
});

beforeEach(async () => {
  await db.run('TRUNCATE stories CASCADE');
  projectId = randomUUID();
  await db.run(
    `INSERT INTO stories (id, title, author, description, content, type, created_at, updated_at)
     VALUES (?, 'A Universe', '', '', '', 'universe', now(), now())`, projectId,
  );
  region = randomUUID();
  town = randomUUID();
  await db.run(
    "INSERT INTO locations (id, project_id, name, description) VALUES (?, ?, 'The Frontier', 'Out past the ring.')",
    region, projectId,
  );
  await db.run(
    "INSERT INTO locations (id, project_id, name, parent_id) VALUES (?, ?, 'Salt Harbour', ?)",
    town, projectId, region,
  );
  streetPlan = await drawMap(region, { purpose: 'The streets', primary: true });
});

describe('a map and what is on it', () => {
  it('lists what is inside but not yet drawn, per map', async () => {
    const res = await request(app).get(`/api/maps/place/${region}`);
    expect(res.status).toBe(200);
    expect(res.body.place.name).toBe('The Frontier');
    expect(res.body.maps).toHaveLength(1);
    expect(res.body.maps[0].pins).toEqual([]);
    expect(res.body.unplaced[streetPlan].map((u) => u.name)).toEqual(['Salt Harbour']);
  });

  it('moves a place from unplaced to pinned, and back when the pin is removed', async () => {
    await request(app).put(`/api/maps/${streetPlan}/pins/${town}`).send({ x: 0.25, y: 0.5 });

    let res = await request(app).get(`/api/maps/place/${region}`);
    expect(res.body.maps[0].pins).toHaveLength(1);
    expect(res.body.maps[0].pins[0].name).toBe('Salt Harbour');
    expect(res.body.unplaced[streetPlan]).toEqual([]);

    await request(app).delete(`/api/maps/${streetPlan}/pins/${town}`);
    res = await request(app).get(`/api/maps/place/${region}`);
    expect(res.body.maps[0].pins).toEqual([]);
    expect(res.body.unplaced[streetPlan].map((u) => u.name), 'the place itself is untouched')
      .toEqual(['Salt Harbour']);
  });

  it('keeps one pin per place per map, and moving is not a second pin', async () => {
    await request(app).put(`/api/maps/${streetPlan}/pins/${town}`).send({ x: 0.1, y: 0.1 });
    await request(app).put(`/api/maps/${streetPlan}/pins/${town}`).send({ x: 0.8, y: 0.2 });

    const res = await request(app).get(`/api/maps/place/${region}`);
    expect(res.body.maps[0].pins).toHaveLength(1);
    expect(res.body.maps[0].pins[0].x).toBeCloseTo(0.8);
  });

  it('refuses a position that is not a fraction of the image', async () => {
    // Pixels would scatter every pin the moment a map of different dimensions
    // replaced this one, which is the case the review dialog exists for.
    for (const bad of [{ x: 120, y: 40 }, { x: -0.1, y: 0.5 }, { x: 0.5, y: 1.4 }]) {
      const res = await request(app).put(`/api/maps/${streetPlan}/pins/${town}`).send(bad);
      expect(res.status, `${JSON.stringify(bad)} should be refused`).toBe(400);
    }
  });

  it('remembers that a pin was guessed rather than placed', async () => {
    const res = await request(app)
      .put(`/api/maps/${streetPlan}/pins/${town}`).send({ x: 0.3, y: 0.3, status: 'proposed' });
    expect(res.body.status).toBe('proposed');

    // Accepting is just placing it, which is why there is no separate verb.
    const kept = await request(app)
      .put(`/api/maps/${streetPlan}/pins/${town}`).send({ x: 0.3, y: 0.3, status: 'placed' });
    expect(kept.body.status).toBe('placed');
  });

  it('refuses a status it does not know', async () => {
    const res = await request(app)
      .put(`/api/maps/${streetPlan}/pins/${town}`).send({ x: 0.3, y: 0.3, status: 'canon' });
    expect(res.status).toBe(400);
  });

  it('carries no facts of its own', async () => {
    // The point of the whole design: everything a pin says about the place
    // comes from the place, so the drawing cannot disagree with the record.
    await request(app).put(`/api/maps/${streetPlan}/pins/${town}`).send({ x: 0.4, y: 0.4 });
    await db.run("UPDATE locations SET name = 'Saltmarsh' WHERE id = ?", town);

    const res = await request(app).get(`/api/maps/place/${region}`);
    expect(res.body.maps[0].pins[0].name, 'renaming the place renames the pin').toBe('Saltmarsh');
  });

  it('says so when the map or the place is not there', async () => {
    expect((await request(app).get(`/api/maps/place/${randomUUID()}`)).status).toBe(404);
    expect((await request(app).put(`/api/maps/${streetPlan}/pins/${randomUUID()}`)
      .send({ x: 0.5, y: 0.5 })).status).toBe(404);
    expect((await request(app).put(`/api/maps/${randomUUID()}/pins/${town}`)
      .send({ x: 0.5, y: 0.5 })).status).toBe(404);
  });
});

describe('a place has many maps', () => {
  it('holds the same place at a different point on each map', async () => {
    // The whole reason a pin names the drawing rather than the place. Salt
    // Harbour is mid-left on the street plan and top-right on the trade routes,
    // and both are true.
    const trade = await drawMap(region, { purpose: 'Trade routes' });
    await request(app).put(`/api/maps/${streetPlan}/pins/${town}`).send({ x: 0.2, y: 0.5 });
    await request(app).put(`/api/maps/${trade}/pins/${town}`).send({ x: 0.9, y: 0.1 });

    const res = await request(app).get(`/api/maps/place/${region}`);
    expect(res.body.maps).toHaveLength(2);
    const byId = Object.fromEntries(res.body.maps.map((m) => [m.id, m]));
    expect(byId[streetPlan].pins[0].x).toBeCloseTo(0.2);
    expect(byId[trade].pins[0].x).toBeCloseTo(0.9);
  });

  it('counts what is missing separately for each map', async () => {
    // A child drawn on the street plan is still absent from the siege map.
    const siege = await drawMap(region, { purpose: 'The siege' });
    await request(app).put(`/api/maps/${streetPlan}/pins/${town}`).send({ x: 0.2, y: 0.5 });

    const res = await request(app).get(`/api/maps/place/${region}`);
    expect(res.body.unplaced[streetPlan]).toEqual([]);
    expect(res.body.unplaced[siege].map((u) => u.name)).toEqual(['Salt Harbour']);
  });

  it('opens the default map first, and allows only one', async () => {
    const trade = await drawMap(region, { purpose: 'Trade routes' });

    let res = await request(app).get(`/api/maps/place/${region}`);
    expect(res.body.maps[0].id, 'the default comes first').toBe(streetPlan);

    await request(app).patch(`/api/maps/${trade}`).send({ primary: true });
    res = await request(app).get(`/api/maps/place/${region}`);
    expect(res.body.maps[0].id).toBe(trade);
    expect(res.body.maps.filter((m) => m.isPrimary), 'exactly one default').toHaveLength(1);
  });

  it('takes a map away without taking the places it drew', async () => {
    await request(app).put(`/api/maps/${streetPlan}/pins/${town}`).send({ x: 0.2, y: 0.5 });
    expect((await request(app).delete(`/api/maps/${streetPlan}`)).status).toBe(200);

    const res = await request(app).get(`/api/maps/place/${region}`);
    expect(res.body.maps).toEqual([]);
    expect(res.body.inside.map((c) => c.name), 'the place outlives the drawing')
      .toEqual(['Salt Harbour']);
    expect((await db.all('SELECT id FROM location_pins')).length, 'its pins went with it').toBe(0);
  });
});

describe('a place is more than its maps', () => {
  it('turns a drawing that is not a plan back into a picture', async () => {
    // The maps adopted from the old column include a three-quarter
    // illustration of a station in space: a fine picture, and nothing you can
    // pin a corridor on. Only a person can tell those apart, so this is a
    // control -- and what it does is change the picture's job, not delete it.
    await request(app).put(`/api/maps/${streetPlan}/pins/${town}`).send({ x: 0.2, y: 0.5 });

    const res = await request(app).post(`/api/maps/${streetPlan}/not-a-map`);
    expect(res.status).toBe(200);
    expect(res.body.pinsRemoved, 'a pin is a position on a plan').toBe(1);

    const after = await request(app).get(`/api/maps/place/${region}`);
    expect(after.body.maps).toEqual([]);
    expect(after.body.pictures.map((p) => p.kind), 'the picture survives as a picture')
      .toEqual(['reference']);
  });

  it('lists pictures that are not maps, without confusing them for maps', async () => {
    // Reference art and illustrations are not cartography and are not pinnable,
    // but they are still what a place looks like.
    await db.run(`
      INSERT INTO media_assets (id, project_id, url, kind, title, subject_type, subject_id)
      VALUES (?, ?, '/media-files/harbour.png', 'reference', 'The harbour at dusk', 'location', ?)
    `, randomUUID(), projectId, region);

    const res = await request(app).get(`/api/maps/place/${region}`);
    expect(res.body.pictures.map((p) => p.title)).toEqual(['The harbour at dusk']);
    expect(res.body.maps, 'a reference picture is not a map').toHaveLength(1);
  });

  it('keeps history apart from folklore, and the biome apart from what lives in it', async () => {
    // Four fields rather than one 'notes'. Folklore that merely repeats the
    // history is not folklore, and an agent asked for one must not be handed
    // the other.
    await request(app).patch(`/api/locations/${region}`).send({
      history: 'Burned in the retreat of 4102.',
      folklore: 'They say the fire still shows in the water.',
      biome: 'Salt flats under a thin, cold sky.',
      ecology: 'Wire-grass, brine flies, the long-legged waders that eat them.',
    });

    const res = await request(app).get(`/api/maps/place/${region}`);
    expect(res.body.place.history).toContain('4102');
    expect(res.body.place.folklore).toContain('They say');
    expect(res.body.place.biome).toContain('Salt flats');
    expect(res.body.place.ecology).toContain('brine flies');
  });
});
