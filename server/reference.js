import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from './env.js';

/**
 * Where reference art is read from.
 *
 * Two modes, and the deployed one deliberately keeps nothing on the machine
 * serving the app:
 *
 *   CONTESORA_REFERENCE_ORIGIN  A read-only HTTP file service, on the node that
 *                               owns the large storage volume. Requests are
 *                               streamed straight through; nothing is written
 *                               to this container's disk and nothing is cached
 *                               there. This is the deployment mode.
 *
 *   CONTESORA_REFERENCE_DIR     A directory on this machine, for development.
 *                               Defaults to the repo's import/ folder, which is
 *                               where import/README.md tells an author to put
 *                               files.
 *
 * The origin wins when both are set. Only GET and HEAD are ever issued or
 * accepted, so this cannot become a write path by accident.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const origin = (env('REFERENCE_ORIGIN') ?? '').trim().replace(/\/+$/, '');
const localDir = env('REFERENCE_DIR')
  ? path.resolve(env('REFERENCE_DIR'))
  : path.join(__dirname, '..', 'import');

export const referenceMode = origin ? 'origin' : 'directory';

/**
 * A request path is a series of plain segments. Anything that could climb out
 * of the root -- an empty, dot, or double-dot segment, a backslash, a NUL -- is
 * refused before it reaches a filesystem or another host.
 */
function safeSegments(requestPath) {
  const decoded = (() => {
    try { return decodeURIComponent(requestPath); } catch { return null; }
  })();
  if (decoded === null || decoded.includes('\0') || decoded.includes('\\')) return null;
  const segments = decoded.split('/').filter((s) => s !== '');
  if (segments.length === 0) return null;
  if (segments.some((s) => s === '.' || s === '..')) return null;
  return segments;
}

export function referenceRouter() {
  const router = express.Router();

  if (referenceMode === 'directory') {
    router.use(express.static(localDir, {
      dotfiles: 'deny',
      index: false,
      fallthrough: false,
      maxAge: '1h',
    }));
    return router;
  }

  // Express 4 wildcard. `/*splat` is Express 5 syntax and matches nothing here,
  // which sends every read to the read-only guard below and answers 405.
  router.get('/*', stream);
  router.head('/*', stream);
  // Anything else is not a read.
  router.use((_req, res) => res.status(405).json({ error: 'Reference assets are read-only.' }));
  return router;

  async function stream(req, res) {
    const segments = safeSegments(req.path);
    if (!segments) return res.status(400).json({ error: 'Bad asset path.' });

    const target = `${origin}/${segments.map(encodeURIComponent).join('/')}`;
    let upstream;
    try {
      upstream = await fetch(target, { method: req.method, redirect: 'error' });
    } catch {
      // The storage node being unreachable is an infrastructure fault, not a
      // missing file, and must not be reported as one: a 404 would make the
      // client drop the plate as though the asset had been deleted.
      return res.status(502).json({ error: 'Reference storage is unreachable.' });
    }

    if (!upstream.ok) {
      return res.status(upstream.status === 404 ? 404 : 502)
        .json({ error: upstream.status === 404 ? 'Asset not found.' : 'Reference storage error.' });
    }

    for (const header of ['content-type', 'content-length', 'etag', 'last-modified']) {
      const value = upstream.headers.get(header);
      if (value) res.setHeader(header, value);
    }
    res.setHeader('Cache-Control', 'public, max-age=3600');

    if (req.method === 'HEAD' || !upstream.body) return res.end();
    // Streamed, so a large plate never lands in this process's memory or disk.
    const reader = upstream.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!res.write(Buffer.from(value))) {
        await new Promise((resolve) => res.once('drain', resolve));
      }
    }
    return res.end();
  }
}
