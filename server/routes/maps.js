/**
 * Maps, and the pins on them.
 *
 * A map is an image belonging to a place. Any place may have one, so the Hub
 * can have its islands and a station its decks. A pin is a location's position
 * ON a map and carries no facts of its own: the location record stays the only
 * truth about what a place IS, so the drawing and the records cannot disagree
 * about anything except where something sits.
 *
 * That is deliberate. The worst outcome for this surface is a second copy of
 * the truth that drifts from the first, and the second worst is a picture that
 * looks authoritative about a position nobody chose -- which is why a pin an
 * agent guessed is stored as `proposed` and has to be accepted before it stops
 * looking like a guess.
 */
import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';
import { keepImage } from '../mediaStore.js';

const router = Router();

const PIN_SELECT = `
  SELECT p.id, p.project_id AS "projectId", p.map_location_id AS "mapLocationId",
         p.location_id AS "locationId", p.x, p.y, p.status,
         l.name AS "name", l.description AS "description"
  FROM location_pins p JOIN locations l ON l.id = p.location_id
`;

/**
 * GET /maps/:locationId
 *
 * The map of one place, and everything pinned on it, plus what is inside that
 * place and has not been pinned yet -- because a list of what is missing from
 * the drawing is the more useful half when a map is new.
 */
router.get('/:locationId', async (req, res) => {
  const place = await db.get(`
    SELECT id, project_id AS "projectId", name, description, map_image AS "mapImage",
           parent_id AS "parentId", region_type AS "regionType"
    FROM locations WHERE id = ?
  `, req.params.locationId);
  if (!place) return res.status(404).json({ error: 'Place not found' });

  const pins = await db.all(`${PIN_SELECT} WHERE p.map_location_id = ? ORDER BY l.name`, place.id);
  const pinned = new Set(pins.map((p) => p.locationId));
  const inside = await db.all(`
    SELECT id, name, description FROM locations WHERE parent_id = ? ORDER BY name
  `, place.id);

  return res.json({
    place,
    pins,
    unplaced: inside.filter((c) => !pinned.has(c.id)),
  });
});

/**
 * POST /maps/:locationId/keep
 *
 * Keep one candidate as this place's map. The bytes are copied onto storage the
 * way an accepted portrait is, so a map does not depend on the render machine's
 * scratch folder staying as it was.
 */
router.post('/:locationId/keep', async (req, res) => {
  const { url } = req.body ?? {};
  if (typeof url !== 'string' || !url.trim()) {
    return res.status(400).json({ error: 'url is required' });
  }
  const place = await db.get('SELECT id, project_id AS "projectId", name FROM locations WHERE id = ?', req.params.locationId);
  if (!place) return res.status(404).json({ error: 'Place not found' });

  let kept;
  try {
    kept = await keepImage(url.trim());
  } catch (error) {
    return res.status(502).json({ error: `Could not copy that map to storage: ${error.message}` });
  }

  await db.run(
    'UPDATE locations SET map_image = ?, updated_at = now() WHERE id = ?', kept.url, place.id,
  );
  // Catalogued as well, so a map is findable among the universe's media rather
  // than being a URL that exists only in one column.
  await db.run(`
    INSERT INTO media_assets (id, project_id, url, kind, title, subject_type, subject_id)
    VALUES (?, ?, ?, 'map', ?, 'location', ?)
  `, randomUUID(), place.projectId, kept.url, `Map of ${place.name}`, place.id)
    .catch(() => {});

  return res.json({ mapImage: kept.url, stored: kept.stored, storage: kept.detail });
});

/** Put a pin down, or move one. Position is a fraction of the image, never pixels. */
router.put('/:locationId/pins/:pinnedId', async (req, res) => {
  const { x, y, status = 'placed' } = req.body ?? {};
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
    return res.status(400).json({ error: 'x and y are fractions of the image, between 0 and 1' });
  }
  if (!['proposed', 'placed'].includes(status)) {
    return res.status(400).json({ error: "status must be 'proposed' or 'placed'" });
  }

  const map = await db.get('SELECT id, project_id AS "projectId" FROM locations WHERE id = ?', req.params.locationId);
  if (!map) return res.status(404).json({ error: 'Map not found' });
  const pinned = await db.get('SELECT id FROM locations WHERE id = ?', req.params.pinnedId);
  if (!pinned) return res.status(404).json({ error: 'Place not found' });

  await db.run(`
    INSERT INTO location_pins (id, project_id, map_location_id, location_id, x, y, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (map_location_id, location_id)
    DO UPDATE SET x = EXCLUDED.x, y = EXCLUDED.y, status = EXCLUDED.status, updated_at = now()
  `, randomUUID(), map.projectId, map.id, pinned.id, x, y, status);

  const row = await db.get(
    `${PIN_SELECT} WHERE p.map_location_id = ? AND p.location_id = ?`, map.id, pinned.id,
  );
  return res.json(row);
});

/** Take a pin off. The place is untouched: a pin is a position, not the record. */
router.delete('/:locationId/pins/:pinnedId', async (req, res) => {
  const result = await db.run(
    'DELETE FROM location_pins WHERE map_location_id = ? AND location_id = ?',
    req.params.locationId, req.params.pinnedId,
  );
  if (result.changes === 0) return res.status(404).json({ error: 'Pin not found' });
  return res.json({ success: true });
});

export default router;
