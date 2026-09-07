/**
 * Where pictures can come from.
 *
 * A source is a place and a set of choices -- a ComfyUI on the network, a
 * hosted API, which checkpoint to ask for -- and never a secret. The row names
 * an environment variable and the value stays in the environment: a key written
 * into a table is a key in every backup of that table, in a screenshot of a
 * query, and in whatever somebody pastes into a bug report, and the server can
 * read process.env perfectly well without the database knowing anything.
 *
 * So `credentialEnv` goes in and comes back out; the key itself never does.
 * What a reader is told instead is whether that variable is currently set,
 * which is the only thing anybody actually needs to know from here.
 */
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import db from '../db.js';

const router = Router();

const KINDS = new Set(['comfyui', 'openai', 'gemini']);
/** A hosted API is useless without a key; a ComfyUI on your own network is not. */
const NEEDS_KEY = new Set(['openai', 'gemini']);

const SELECT = `
  SELECT id, project_id as "projectId", label, kind, endpoint, model,
         credential_env as "credentialEnv", options, is_default as "isDefault",
         created_at as "createdAt", updated_at as "updatedAt"
  FROM image_sources
`;

const shape = (row) => ({
  ...row,
  isDefault: Boolean(row.isDefault),
  options: typeof row.options === 'string' ? JSON.parse(row.options) : (row.options ?? {}),
  // Never the value. Whether it is there is the useful part, and it is the part
  // that is safe to render, log, or paste into a report.
  credentialReady: !row.credentialEnv || Boolean(process.env[row.credentialEnv]),
});

router.get('/', async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: 'projectId query parameter is required' });
  const rows = await db.all(`${SELECT} WHERE project_id = ? ORDER BY is_default DESC, label ASC`, projectId);
  return res.json(rows.map(shape));
});

/** Only one default per universe, so generating never has to guess. */
async function clearOtherDefaults(projectId, keepId) {
  await db.run(
    'UPDATE image_sources SET is_default = FALSE, updated_at = now() WHERE project_id = ? AND id <> ?',
    projectId, keepId ?? '',
  );
}

router.post('/', async (req, res) => {
  const {
    projectId, label, kind, endpoint = '', model = '',
    credentialEnv = '', options = {}, isDefault = false,
  } = req.body ?? {};

  if (!projectId || !label || !kind) {
    return res.status(400).json({ error: 'projectId, label and kind are required' });
  }
  if (!KINDS.has(kind)) {
    return res.status(400).json({ error: `kind must be one of: ${[...KINDS].join(', ')}` });
  }
  if (kind === 'comfyui' && !endpoint.trim()) {
    return res.status(400).json({ error: 'a comfyui source needs an endpoint' });
  }
  if (NEEDS_KEY.has(kind) && !credentialEnv.trim()) {
    return res.status(400).json({
      error: `a ${kind} source needs credentialEnv: the NAME of an environment variable holding the key, not the key`,
    });
  }
  // A key pasted into the name field is the mistake this exists to prevent, and
  // it is worth catching loudly rather than storing.
  if (/^(sk-|AIza)/.test(credentialEnv.trim())) {
    return res.status(400).json({
      error: 'credentialEnv looks like a key rather than a variable name. Put the key in the environment and name it here.',
    });
  }

  const universe = await db.get('SELECT id FROM stories WHERE id = ?', projectId);
  if (!universe) return res.status(404).json({ error: 'Universe not found' });

  const id = randomUUID();
  // Cleared before the insert, not after: the unique index refuses a second
  // default the moment it lands, so tidying up afterwards never runs -- and an
  // async throw in an express route answers nothing, so it presented as a
  // request that hung rather than an error.
  if (isDefault) await clearOtherDefaults(projectId, id);
  await db.run(`
    INSERT INTO image_sources
      (id, project_id, label, kind, endpoint, model, credential_env, options, is_default)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?)
  `, id, projectId, label.trim(), kind, endpoint.trim(), model.trim(),
  credentialEnv.trim(), JSON.stringify(options ?? {}), Boolean(isDefault));

  const row = await db.get(`${SELECT} WHERE id = ?`, id);
  return res.status(201).json(shape(row));
});

router.patch('/:id', async (req, res) => {
  const existing = await db.get('SELECT id, project_id as "projectId" FROM image_sources WHERE id = ?', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Image source not found' });

  const { label, endpoint, model, credentialEnv, options, isDefault } = req.body ?? {};
  if (credentialEnv !== undefined && /^(sk-|AIza)/.test(String(credentialEnv).trim())) {
    return res.status(400).json({
      error: 'credentialEnv looks like a key rather than a variable name. Put the key in the environment and name it here.',
    });
  }

  if (isDefault) await clearOtherDefaults(existing.projectId, req.params.id);
  await db.run(`
    UPDATE image_sources SET
      label = COALESCE(?, label),
      endpoint = COALESCE(?, endpoint),
      model = COALESCE(?, model),
      credential_env = COALESCE(?, credential_env),
      options = COALESCE(?::jsonb, options),
      is_default = COALESCE(?, is_default),
      updated_at = now()
    WHERE id = ?
  `,
  label ?? null, endpoint ?? null, model ?? null,
  credentialEnv ?? null,
  options === undefined ? null : JSON.stringify(options),
  isDefault === undefined ? null : Boolean(isDefault),
  req.params.id);

  const row = await db.get(`${SELECT} WHERE id = ?`, req.params.id);
  return res.json(shape(row));
});

router.delete('/:id', async (req, res) => {
  const result = await db.run('DELETE FROM image_sources WHERE id = ?', req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Image source not found' });
  return res.json({ success: true });
});

/**
 * Ask the source whether it is really there.
 *
 * Configuration that has never been exercised is a guess. For a ComfyUI this
 * also answers the question that matters next -- which checkpoints it actually
 * has -- so a model can be chosen from what is installed rather than typed from
 * memory and discovered to be wrong at generation time.
 */
router.post('/:id/check', async (req, res) => {
  const row = await db.get(`${SELECT} WHERE id = ?`, req.params.id);
  if (!row) return res.status(404).json({ error: 'Image source not found' });
  const source = shape(row);

  if (source.kind !== 'comfyui') {
    return res.json({
      ok: source.credentialReady,
      detail: source.credentialReady
        ? `${source.credentialEnv} is set in this server's environment.`
        : `${source.credentialEnv} is not set in this server's environment.`,
      models: [],
    });
  }

  try {
    const base = source.endpoint.replace(/\/+$/, '');
    const response = await fetch(`${base}/object_info/CheckpointLoaderSimple`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`answered ${response.status}`);
    const info = await response.json();
    const models = info?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] ?? [];
    return res.json({ ok: true, detail: `${models.length} checkpoints installed.`, models });
  } catch (error) {
    return res.json({ ok: false, detail: `Could not reach it: ${error.message}`, models: [] });
  }
});

export default router;
