/**
 * index.html ships to everyone. Nothing local belongs in it.
 *
 * A live-reload tag from a design tool was committed here and went out in two
 * releases: a script pointing at http://localhost:8400 that every visitor's
 * browser would try to fetch and fail, and that a page served over HTTPS
 * refuses outright as mixed content. It arrived through `git add -A` and left
 * no trace anywhere a person would look.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const html = readFileSync(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8');

describe('the shipped HTML', () => {
  it('points at no local address', () => {
    const local = [...html.matchAll(/\b(?:https?:\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?\S*/gi)]
      .map((m) => m[0]);
    expect(local, `index.html references a local address: ${local.join(', ')}`).toEqual([]);
  });

  it('carries no injected tooling', () => {
    for (const marker of ['impeccable', 'livereload', 'browser-sync', 'webpack-dev-server']) {
      expect(html.toLowerCase(), `index.html carries ${marker}`).not.toContain(marker);
    }
  });

  it('loads scripts only from itself or an allowed font host', () => {
    const sources = [...html.matchAll(/<script[^>]*\ssrc=["']([^"']+)["']/gi)].map((m) => m[1]);
    const stray = sources.filter((src) => !src.startsWith('/'));
    expect(stray, `index.html loads a script from ${stray.join(', ')}`).toEqual([]);
  });

  it('sets the appearance before the first paint', () => {
    // React mounts after the browser has painted; without this a dark reader
    // gets a white frame, which is the one thing dark mode exists to prevent.
    expect(html).toMatch(/editorialAppearance/);
    expect(html).toMatch(/prefers-color-scheme: dark/);
  });
});
