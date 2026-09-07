/**
 * Everything the API serves outside /api has to be proxied in dev.
 *
 * The dev server answers on one port and the API on another, and anything Vite
 * is not told about falls through to its SPA fallback. So a path the API serves
 * -- reference art, kept pictures -- comes back as index.html with a 200 and an
 * HTML content type, and the browser renders a broken image. It looks like the
 * file is missing, or like the copy that wrote it failed, which is a long way
 * from "nobody added three lines to vite.config.ts".
 *
 * It cost that exact confusion once. This makes adding a served path without
 * proxying it a failing build rather than a puzzle in the next session.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');

/**
 * Top-level paths app.js hands to a router, minus the API (already proxied as
 * one prefix) and minus the /storytime duplicates, which exist for the built
 * bundle rather than for dev.
 */
function servedPaths() {
  const source = read('server/app.js');
  const mounted = [...source.matchAll(/app\.use\(\s*'(\/[^']*)'/g)].map((m) => m[1]);
  return [...new Set(mounted)]
    .filter((p) => p !== '/' && !p.startsWith('/api') && !p.startsWith('/storytime'));
}

function proxiedPaths() {
  const source = read('vite.config.ts');
  const block = source.slice(source.indexOf('proxy:'));
  return [...block.matchAll(/'(\/[^']*)'\s*:\s*\{/g)].map((m) => m[1]);
}

describe('the dev server knows about everything the API serves', () => {
  it('proxies every non-API path app.js mounts a router on', () => {
    const proxied = proxiedPaths();
    const missing = servedPaths().filter((p) => !proxied.includes(p));
    expect(missing, 'these would answer with index.html in dev').toEqual([]);
  });

  it('reads both files as expected, so an empty list cannot pass by accident', () => {
    // Without this, a rename in either file makes both lists empty and the
    // check above passes while checking nothing.
    expect(servedPaths()).toContain('/reference');
    expect(servedPaths()).toContain('/media-files');
    expect(proxiedPaths()).toContain('/api');
  });
});
