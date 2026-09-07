/**
 * The suite's own housekeeping, checked by the suite.
 *
 * These files share one Postgres and one worker process: vitest runs them
 * serially (fileParallelism is off in vite.config.ts) but in the same process,
 * so anything a file opens and does not close outlives it. Five files opened a
 * connection pool and never ended it, and one left an HTTP server listening.
 *
 * That is not a theory about a specific failure -- I could not reproduce the
 * intermittent failures that prompted this, and 18 consecutive clean runs say
 * the reproduction I thought I had was not one. It is the difference between a
 * suite whose resource use is accounted for and one where it is not, which is
 * what makes a red run worth believing.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = fileURLToPath(new URL('./', import.meta.url));
const files = readdirSync(dir).filter((f) => /\.test\.js$/.test(f) && f !== 'testHygiene.test.js');
const read = (f) => readFileSync(join(dir, f), 'utf8');

describe('the test suite cleans up after itself', () => {
  it('finds the suite to check', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('closes every connection pool it opens', () => {
    const leaking = files.filter((f) => {
      const src = read(f);
      // A file that never reaches for the database has nothing to close.
      if (!/from '\.\.\/db\.js'|import\('\.\.\/db\.js|import\('\.\.\/app\.js/.test(src)) return false;
      return !/\bdb\.close\(\)|\bclose\(\)/.test(src);
    });
    expect(
      leaking,
      `these files open a pool and never end it:\n  ${leaking.join('\n  ')}`,
    ).toEqual([]);
  });

  it('closes every server it starts listening', () => {
    const leaking = files.filter((f) => {
      const src = read(f);
      if (!/\.listen\(/.test(src)) return false;
      return !/\.close\(/.test(src);
    });
    expect(
      leaking,
      `these files leave a server listening:\n  ${leaking.join('\n  ')}`,
    ).toEqual([]);
  });

  it('restores every environment variable it sets', () => {
    // A file that sets process.env for its own case has to put it back, or the
    // next file in the same worker inherits a configuration nobody chose.
    const SHARED = /process\.env\.(STORYTIME_REFERENCE_ORIGIN|STORYTIME_REFERENCE_DIR)\s*=/;
    const leaking = files.filter((f) => {
      const src = read(f);
      if (!SHARED.test(src)) return false;
      return !/delete process\.env\./.test(src);
    });
    expect(
      leaking,
      `these files set a shared environment variable and never unset it:\n  ${leaking.join('\n  ')}`,
    ).toEqual([]);
  });
});
