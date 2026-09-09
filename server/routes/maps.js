/**
 * The maps of a place, the pins on them, and the pictures that are not maps.
 *
 * A place has many maps. A city has a street plan and a trade-route map and a
 * map of the siege; a station has a deck plan per deck. They are drawings of
 * one place with different jobs, so a map is its own record and carries the
 * one sentence that says which to open -- and a pin belongs to a drawing, not
 * to the place, because the same market sits at a different point on the
 * street plan than on the regional map.
 *
 * A place also has pictures that are not maps at all: reference art, an
 * illustration of the harbour at dusk. Those stay ordinary media assets and
 * are listed here beside the maps rather than being routed through them, which
 * is the difference between a geography surface and a map surface.
 *
 * A pin carries no facts. It says which place, on which map, and where. The
 * location record stays the only truth about what a place IS, so the drawing
 * and the records cannot disagree about anything except position. That is
 * deliberate: the worst outcome here is a second copy of the truth that drifts
 * from the first, and the second worst is a picture that looks authoritative
 * about a position nobody chose -- which is why a pin an agent guessed is
 * stored as `proposed` and has to be accepted before it stops looking like one.
 */
import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';
import { keepImage } from '../mediaStore.js';

const router = Router();

const PIN_SELECT = `
  SELECT p.id, p.project_id AS "projectId", p.map_id AS "mapId",
         p.location_id AS "locationId", p.x, p.y, p.status,
         l.name AS "name", l.description AS "description"
  FROM location_pins p JOIN locations l ON l.id = p.location_id
`;

const MAP_SELECT = `
  SELECT m.id, m.project_id AS "projectId", m.location_id AS "locationId",
         m.media_asset_id AS "mediaAssetId", m.purpose, m.is_primary AS "isPrimary",
         m.created_at AS "createdAt",
         a.url, a.title, a.caption
  FROM location_maps m JOIN media_assets a ON a.id = m.media_asset_id
`;

/** The place's own record, with the lore fields the geography surface reads. */
const PLACE_SELECT = `
  SELECT id, project_id AS "projectId", name, description, parent_id AS "parentId",
         region_type AS "regionType", political_notes AS "politicalNotes",
         history, folklore, biome, ecology, is_protected AS "isProtected"
  FROM locations
`;

/**
 * GET /maps/universe/:projectId
 *
 * The universe as a subject you can draw and pin on.
 *
 * The same payload shape as a place, deliberately: the surface that reads it
 * does not need to know whether it is looking at a station or at everything.
 * What is "inside" the universe is its outermost places, which is exactly what
 * belongs on a map of the whole setting.
 */
router.get('/universe/:projectId', async (req, res) => {
  const universe = await db.get(
    `SELECT id, title, description, history, folklore, biome, ecology
     FROM stories WHERE id = ?`, req.params.projectId,
  );
  if (!universe) return res.status(404).json({ error: 'Universe not found' });

  const maps = await db.all(`
    ${MAP_SELECT} WHERE m.project_id = ? AND m.location_id IS NULL
    ORDER BY m.is_primary DESC, m.created_at ASC
  `, universe.id);
  const pins = maps.length
    ? await db.all(
      `${PIN_SELECT} WHERE p.map_id IN (${maps.map(() => '?').join(',')}) ORDER BY l.name`,
      ...maps.map((m) => m.id),
    )
    : [];

  const pictures = await db.all(`
    SELECT id, url, kind, title, caption FROM media_assets
    WHERE subject_type = 'universe' AND subject_id = ? AND kind <> 'map'
    ORDER BY created_at DESC
  `, universe.id);

  // What sits directly in the universe: the places nothing else contains.
  const inside = await db.all(`
    SELECT l.id, l.name, l.description FROM locations l
    WHERE l.project_id = ?
      AND (l.parent_id IS NULL
        OR NOT EXISTS (SELECT 1 FROM locations p WHERE p.id = l.parent_id))
    ORDER BY l.name
  `, universe.id);

  return res.json({
    place: {
      id: universe.id,
      projectId: universe.id,
      name: universe.title,
      description: universe.description ?? '',
      parentId: null,
      regionType: '',
      politicalNotes: '',
      history: universe.history ?? '',
      folklore: universe.folklore ?? '',
      biome: universe.biome ?? '',
      ecology: universe.ecology ?? '',
      isProtected: false,
      // The one thing the surface needs to know, because a universe is
      // written through a different route than a place.
      isUniverse: true,
    },
    maps: maps.map((m) => ({ ...m, pins: pins.filter((p) => p.mapId === m.id) })),
    pictures,
    unplaced: Object.fromEntries(maps.map((m) => {
      const on = new Set(pins.filter((p) => p.mapId === m.id).map((p) => p.locationId));
      return [m.id, inside.filter((c) => !on.has(c.id))];
    })),
    inside,
  });
});

/** Keep one candidate as a map of the universe. */
router.post('/universe/:projectId/keep', async (req, res) => {
  const { url, purpose = '', title = null, primary } = req.body ?? {};
  if (typeof url !== 'string' || !url.trim()) {
    return res.status(400).json({ error: 'url is required' });
  }
  const universe = await db.get('SELECT id, title FROM stories WHERE id = ?', req.params.projectId);
  if (!universe) return res.status(404).json({ error: 'Universe not found' });

  let kept;
  try {
    kept = await keepImage(url.trim());
  } catch (error) {
    return res.status(502).json({ error: `Could not copy that map to storage: ${error.message}` });
  }

  const existing = await db.get(
    'SELECT count(*)::int AS n FROM location_maps WHERE project_id = ? AND location_id IS NULL',
    universe.id,
  );
  const makePrimary = primary === undefined ? existing.n === 0 : Boolean(primary);
  if (makePrimary) {
    await db.run(
      'UPDATE location_maps SET is_primary = FALSE WHERE project_id = ? AND location_id IS NULL',
      universe.id,
    );
  }

  const assetId = randomUUID();
  await db.run(`
    INSERT INTO media_assets (id, project_id, url, kind, title, subject_type, subject_id)
    VALUES (?, ?, ?, 'map', ?, 'universe', ?)
  `, assetId, universe.id, kept.url, title || `Map of ${universe.title}`, universe.id);

  const mapId = randomUUID();
  await db.run(`
    INSERT INTO location_maps (id, project_id, location_id, media_asset_id, purpose, is_primary)
    VALUES (?, ?, NULL, ?, ?, ?)
  `, mapId, universe.id, assetId, String(purpose ?? ''), makePrimary);

  const map = await db.get(`${MAP_SELECT} WHERE m.id = ?`, mapId);
  return res.status(201).json({ map: { ...map, pins: [] }, stored: kept.stored, storage: kept.detail });
});

/**
 * GET /maps/places?projectId=X
 *
 * Every place in the universe with enough about it to navigate by: how many
 * maps it has, how many places sit inside it, and which one to open first.
 *
 * WHICH ONE OPENS
 * The first of the outermost places, alphabetically -- the top of the tree the
 * reader is looking at. Nothing cleverer, because a cleverer rule was tried:
 * "the biggest place that has been drawn" opened a universe on a derelict
 * station three levels down, and no arrangement of the screen explained why.
 * A default is only a default if you can check it. The last place opened
 * travels in the URL, so this one applies once and then never again.
 */
router.get('/places', async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: 'projectId required' });

  const places = await db.all(`
    SELECT l.id, l.name, l.description, l.parent_id AS "parentId", l.level,
           l.region_type AS "regionType",
           (SELECT count(*)::int FROM location_maps m WHERE m.location_id = l.id) AS "mapCount",
           -- Pictures are counted apart from maps because they answer a
           -- different question. A place whose only image was reclassified
           -- from a map to a picture is still illustrated; reporting it as
           -- "not drawn" said the opposite of what had just happened.
           (SELECT count(*)::int FROM media_assets a
             WHERE a.subject_type = 'location' AND a.subject_id = l.id AND a.kind <> 'map'
           ) AS "pictureCount",
           (SELECT count(*)::int FROM locations c WHERE c.parent_id = l.id) AS "insideCount"
    FROM locations l WHERE l.project_id = ? ORDER BY l.level, l.name
  `, projectId);

  // The first of the outermost places, alphabetically.
  //
  // This used to rank by "drawn, then containing the most", which put a
  // universe on a derelict station three levels down and could not be
  // reconciled with anything on screen. A default has to be a rule the reader
  // can check: this one is the top of the tree they are looking at.
  const has = new Set(places.map((p) => p.id));
  const outermost = places
    .filter((p) => !p.parentId || !has.has(p.parentId))
    .sort((a, b) => a.name.localeCompare(b.name));
  const opens = outermost[0] ?? places[0] ?? null;

  return res.json({
    places,
    opens: opens?.id ?? null,
  });
});

/**
 * GET /maps/place/:locationId
 *
 * Everything the geography surface needs about one place in a single read: the
 * record, every map of it with its pins, the pictures that are not maps, and
 * what is inside the place but drawn on none of them -- because a list of what
 * is missing from the map is the more useful half when a map is new.
 */
router.get('/place/:locationId', async (req, res) => {
  const place = await db.get(`${PLACE_SELECT} WHERE id = ?`, req.params.locationId);
  if (!place) return res.status(404).json({ error: 'Place not found' });

  const maps = await db.all(
    `${MAP_SELECT} WHERE m.location_id = ? ORDER BY m.is_primary DESC, m.created_at ASC`,
    place.id,
  );
  const pins = maps.length
    ? await db.all(
      `${PIN_SELECT} WHERE p.map_id IN (${maps.map(() => '?').join(',')}) ORDER BY l.name`,
      ...maps.map((m) => m.id),
    )
    : [];

  const pictures = await db.all(`
    SELECT id, url, kind, title, caption
    FROM media_assets
    WHERE subject_type = 'location' AND subject_id = ? AND kind <> 'map'
    ORDER BY created_at DESC
  `, place.id);

  const inside = await db.all(
    'SELECT id, name, description FROM locations WHERE parent_id = ? ORDER BY name', place.id,
  );

  return res.json({
    place,
    maps: maps.map((m) => ({ ...m, pins: pins.filter((p) => p.mapId === m.id) })),
    pictures,
    // Unplaced is per-map: a child drawn on the street plan is still missing
    // from the siege map. Answering it once for the place would have said
    // "nothing is missing" the moment any map showed it.
    unplaced: Object.fromEntries(maps.map((m) => {
      const on = new Set(pins.filter((p) => p.mapId === m.id).map((p) => p.locationId));
      return [m.id, inside.filter((c) => !on.has(c.id))];
    })),
    inside,
  });
});

/**
 * POST /maps/place/:locationId/keep
 *
 * Keep one candidate as another map of this place. The bytes are copied onto
 * storage the way an accepted portrait is, so a map does not depend on the
 * render machine's scratch folder staying as it was.
 */
router.post('/place/:locationId/keep', async (req, res) => {
  const { url, purpose = '', title = null, primary } = req.body ?? {};
  if (typeof url !== 'string' || !url.trim()) {
    return res.status(400).json({ error: 'url is required' });
  }
  const place = await db.get(
    'SELECT id, project_id AS "projectId", name FROM locations WHERE id = ?', req.params.locationId,
  );
  if (!place) return res.status(404).json({ error: 'Place not found' });

  let kept;
  try {
    kept = await keepImage(url.trim());
  } catch (error) {
    return res.status(502).json({ error: `Could not copy that map to storage: ${error.message}` });
  }

  // The first map of a place is its default, because a place with maps and no
  // default opens to nothing.
  const existing = await db.get(
    'SELECT count(*)::int AS n FROM location_maps WHERE location_id = ?', place.id,
  );
  const makePrimary = primary === undefined ? existing.n === 0 : Boolean(primary);
  if (makePrimary) {
    await db.run('UPDATE location_maps SET is_primary = FALSE WHERE location_id = ?', place.id);
  }

  const assetId = randomUUID();
  await db.run(`
    INSERT INTO media_assets (id, project_id, url, kind, title, subject_type, subject_id)
    VALUES (?, ?, ?, 'map', ?, 'location', ?)
  `, assetId, place.projectId, kept.url, title || `Map of ${place.name}`, place.id);

  const mapId = randomUUID();
  await db.run(`
    INSERT INTO location_maps (id, project_id, location_id, media_asset_id, purpose, is_primary)
    VALUES (?, ?, ?, ?, ?, ?)
  `, mapId, place.projectId, place.id, assetId, String(purpose ?? ''), makePrimary);

  const map = await db.get(`${MAP_SELECT} WHERE m.id = ?`, mapId);
  return res.status(201).json({ map: { ...map, pins: [] }, stored: kept.stored, storage: kept.detail });
});

/** Retitle a map, say what it is for, or make it the one that opens. */
router.patch('/:mapId', async (req, res) => {
  const map = await db.get(`${MAP_SELECT} WHERE m.id = ?`, req.params.mapId);
  if (!map) return res.status(404).json({ error: 'Map not found' });

  const { purpose, title, primary } = req.body ?? {};
  if (primary === true) {
    await db.run('UPDATE location_maps SET is_primary = FALSE WHERE location_id = ?', map.locationId);
  }
  await db.run(`
    UPDATE location_maps
    SET purpose = COALESCE(?, purpose), is_primary = COALESCE(?, is_primary), updated_at = now()
    WHERE id = ?
  `, purpose ?? null, primary === undefined ? null : Boolean(primary), map.id);
  if (typeof title === 'string') {
    await db.run('UPDATE media_assets SET title = ? WHERE id = ?', title, map.mediaAssetId);
  }

  return res.json(await db.get(`${MAP_SELECT} WHERE m.id = ?`, map.id));
});

/**
 * Remove one map. Its pins go with it and nothing else does: the places it drew
 * are records in their own right and do not belong to a drawing.
 */
router.delete('/:mapId', async (req, res) => {
  const map = await db.get('SELECT id, media_asset_id AS "mediaAssetId" FROM location_maps WHERE id = ?', req.params.mapId);
  if (!map) return res.status(404).json({ error: 'Map not found' });
  await db.run('DELETE FROM location_maps WHERE id = ?', map.id);
  await db.run('DELETE FROM media_assets WHERE id = ?', map.mediaAssetId);
  return res.json({ success: true });
});

/**
 * POST /maps/:mapId/not-a-map
 *
 * This drawing is a picture of the place, not a plan of it.
 *
 * Needed because the two are genuinely hard to tell apart from the outside.
 * The maps adopted from the old `map_image` column include a three-quarter
 * illustration of a station in space: a fine picture and nothing you can pin a
 * corridor on. Only a person can judge which is which, so this is a control
 * rather than a rule.
 *
 * The picture survives as a picture -- it becomes reference art of the place,
 * which is a thing a location has -- and only its job changes. Its pins go,
 * because a pin is a position on a plan and there is no longer a plan.
 */
router.post('/:mapId/not-a-map', async (req, res) => {
  const map = await db.get(`
    SELECT id, media_asset_id AS "mediaAssetId", location_id AS "locationId"
    FROM location_maps WHERE id = ?
  `, req.params.mapId);
  if (!map) return res.status(404).json({ error: 'Map not found' });

  const pins = await db.get(
    'SELECT count(*)::int AS n FROM location_pins WHERE map_id = ?', map.id,
  );
  // Stop calling it a map. It was titled "Map of X" when it was catalogued as
  // one, and leaving that on a picture we have just agreed is not a map puts
  // the contradiction on the reading surface.
  await db.run(`
    UPDATE media_assets
    SET kind = 'reference', title = regexp_replace(title, '^Map of ', '')
    WHERE id = ?
  `, map.mediaAssetId);
  await db.run('DELETE FROM location_maps WHERE id = ?', map.id);

  // If that was the one that opened, something else has to be. A place with
  // maps and no default opens on whichever the database happens to return.
  const remaining = await db.all(
    'SELECT id, is_primary AS "isPrimary" FROM location_maps WHERE location_id = ? ORDER BY created_at',
    map.locationId,
  );
  if (remaining.length && !remaining.some((m) => m.isPrimary)) {
    await db.run('UPDATE location_maps SET is_primary = TRUE WHERE id = ?', remaining[0].id);
  }

  return res.json({
    success: true,
    pinsRemoved: pins.n,
    detail: pins.n
      ? `Kept as a picture of this place. ${pins.n} pin${pins.n > 1 ? 's' : ''} went with the plan.`
      : 'Kept as a picture of this place.',
  });
});

/** Put a pin down, or move one. Position is a fraction of the image, never pixels. */
router.put('/:mapId/pins/:pinnedId', async (req, res) => {
  const { x, y, status = 'placed' } = req.body ?? {};
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
    return res.status(400).json({ error: 'x and y are fractions of the image, between 0 and 1' });
  }
  if (!['proposed', 'placed'].includes(status)) {
    return res.status(400).json({ error: "status must be 'proposed' or 'placed'" });
  }

  const map = await db.get(
    'SELECT id, project_id AS "projectId" FROM location_maps WHERE id = ?', req.params.mapId,
  );
  if (!map) return res.status(404).json({ error: 'Map not found' });
  const pinned = await db.get('SELECT id FROM locations WHERE id = ?', req.params.pinnedId);
  if (!pinned) return res.status(404).json({ error: 'Place not found' });

  await db.run(`
    INSERT INTO location_pins (id, project_id, map_id, location_id, x, y, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (map_id, location_id)
    DO UPDATE SET x = EXCLUDED.x, y = EXCLUDED.y, status = EXCLUDED.status, updated_at = now()
  `, randomUUID(), map.projectId, map.id, pinned.id, x, y, status);

  return res.json(await db.get(
    `${PIN_SELECT} WHERE p.map_id = ? AND p.location_id = ?`, map.id, pinned.id,
  ));
});

/** Take a pin off. The place is untouched: a pin is a position, not the record. */
router.delete('/:mapId/pins/:pinnedId', async (req, res) => {
  const result = await db.run(
    'DELETE FROM location_pins WHERE map_id = ? AND location_id = ?',
    req.params.mapId, req.params.pinnedId,
  );
  if (result.changes === 0) return res.status(404).json({ error: 'Pin not found' });
  return res.json({ success: true });
});

export default router;
