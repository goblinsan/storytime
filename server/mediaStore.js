/**
 * Keeping a picture, rather than pointing at where it was made.
 *
 * A generated preview lives in ComfyUI's output folder. That is fine for
 * something nobody has chosen yet -- most previews are thrown away -- but the
 * moment one becomes a character's reference image it is canon, and canon
 * should not depend on a scratch directory on the machine that renders things.
 * ComfyUI's output folder gets cleared, and its filenames count from one and
 * start again when it is, so the URL that worked this morning can be a
 * different picture this afternoon.
 *
 * So keeping one copies the bytes onto the storage volume and records a URL
 * that serves them from there.
 *
 * WHERE THAT IS
 * CONTESORA_MEDIA_DIR, which is expected to be a mount of the large network
 * volume, never local disk on the machine running the app. It is deliberately
 * not CONTESORA_REFERENCE_DIR: that one is a read path with a default (the
 * repo's own import/ folder), and a write path must never have a default that
 * quietly puts project images inside a checkout.
 *
 * When it is not configured, keeping still works -- the asset simply keeps the
 * URL it came with, and says so. A missing volume must not throw away the
 * picture somebody just chose.
 */
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import { env } from './env.js';

/** Where kept media lands, or null when there is nowhere yet. No default. */
export const mediaDir = () => (env('MEDIA_DIR') ? path.resolve(env('MEDIA_DIR')) : null);

/** The path kept media is served back from. */
export const MEDIA_ROUTE = '/media-files';

const EXTENSIONS = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

/**
 * A name from the bytes, not from where they came.
 *
 * `contesora_00001_.png` is not a name, it is a position in a folder somebody
 * else empties. Hashing the content means the same picture kept twice is one
 * file rather than two, and a name never collides with a different image.
 */
export const nameFor = (bytes, contentType) => {
  const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
  return `${digest}${EXTENSIONS[contentType] ?? '.png'}`;
};

/** Bigger than any portrait this asks for, and small enough to refuse a surprise. */
const MAX_BYTES = 32 * 1024 * 1024;

/**
 * Fetch a picture and put it somewhere it will still be tomorrow.
 *
 * Returns the URL to record. When there is nowhere to put it, that is the URL
 * it came with and `stored` is false, so a caller can say what really happened
 * rather than imply a copy that never took place.
 */
export async function keepImage(sourceUrl) {
  const dir = mediaDir();
  if (!dir) {
    return {
      stored: false,
      url: sourceUrl,
      detail: 'No storage is configured (CONTESORA_MEDIA_DIR), so this still points at '
        + 'the machine that generated it.',
    };
  }

  const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`could not read the image (${response.status})`);
  const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim();
  if (!contentType.startsWith('image/')) {
    throw new Error(`that URL answered with ${contentType || 'no content type'}, not an image`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error('the image was empty');
  if (bytes.length > MAX_BYTES) throw new Error(`the image is ${bytes.length} bytes, which is more than this keeps`);

  const name = nameFor(bytes, contentType);
  await mkdir(dir, { recursive: true });
  // Written under its content hash, so keeping the same picture twice is one
  // file written twice rather than two copies of it.
  await writeFile(path.join(dir, name), bytes);

  return {
    stored: true,
    url: `${MEDIA_ROUTE}/${name}`,
    bytes: bytes.length,
    detail: `Copied ${bytes.length} bytes to storage.`,
  };
}

/**
 * Reading kept media back, and nothing else.
 *
 * Static, read-only, no directory listing. Mounted only when storage is
 * configured: with no volume there is nothing here to read, and a route that
 * silently serves an empty default directory is worse than a 404.
 */
export function mediaFilesRouter() {
  const router = express.Router();
  // The directory is resolved on the first request rather than at import, so
  // this does not depend on whether the environment was loaded before the app
  // module was. That ordering is invisible when it is wrong: the route just
  // answers 404 forever and looks like a missing file.
  const handlers = new Map();
  const handlerFor = (dir) => {
    if (!handlers.has(dir)) {
      handlers.set(dir, express.static(dir, {
        dotfiles: 'deny',
        index: false,
        fallthrough: false,
        // Named by content hash, so a given URL is always the same bytes.
        immutable: true,
        maxAge: '30d',
      }));
    }
    return handlers.get(dir);
  };

  router.use((req, res, next) => {
    const dir = mediaDir();
    // No volume means there is nothing here to read. Saying so beats serving
    // an empty default directory that looks like storage and holds nothing.
    if (!dir) return res.status(404).json({ error: 'No media storage is configured on this server.' });
    return handlerFor(dir)(req, res, next);
  });
  return router;
}
