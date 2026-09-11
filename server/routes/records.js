import { Router } from 'express';
import { RECORD_KINDS, consequences, remove } from '../recordDeletion.js';

/**
 * Deleting any record the editorial surfaces show, the one way that also
 * tidies what pointed at it. See recordDeletion.js.
 */
const router = Router();

const known = (req, res) => {
  if (RECORD_KINDS.includes(req.params.kind)) return true;
  res.status(404).json({ error: `There is no kind of record called "${req.params.kind}".` });
  return false;
};

// What deleting it would change, in words, and whether it can be deleted.
router.get('/:kind/:id/consequences', async (req, res) => {
  if (!known(req, res)) return undefined;
  const said = await consequences(req.params.kind, req.params.id);
  if (!said) return res.status(404).json({ error: 'Not found' });
  return res.json(said);
});

router.delete('/:kind/:id', async (req, res) => {
  if (!known(req, res)) return undefined;
  const result = await remove(req.params.kind, req.params.id);
  if (result.status === 404) return res.status(404).json({ error: 'Not found' });
  if (result.status === 403) return res.status(403).json({ error: result.error });
  return res.json({ ok: true, name: result.name });
});

export default router;
