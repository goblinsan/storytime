/**
 * The contract between src/editorial/themes.ts and the stylesheets that consume
 * it: every --theme-* variable tokens.css reads must be emitted, nothing else
 * should be, and every webfont a preset names must actually be loaded.
 *
 * This lives beside the server suite rather than in src/editorial/__tests__
 * because it reads the two files from disk, and Vite returns an empty string
 * for a CSS import under the node test environment.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getTheme, themeVariables } from '../../src/editorial/themes.ts';

const read = (relative) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

const PRESET_IDS = [
  'neutral-codex',
  'editorial-fantasy',
  'science-fiction',
  'speculative-mystery',
  'historical-chronicle',
];

const consumedVariables = () => {
  const css = read('../../src/editorial/styles/tokens.css').replace(/\s+/g, ' ');
  return [...new Set([...css.matchAll(/var\(\s*(--theme-[a-z0-9-]+)/g)].map((match) => match[1]))];
};

const SYSTEM_FACES = new Set([
  'Charter', 'Georgia', 'Cambria', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial',
  'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'Liberation Mono', 'Courier New',
  'Iowan Old Style', 'Palatino Linotype', 'URW Palladio L',
]);

describe('theme variables against the token layer', () => {
  it('emits every variable tokens.css reads, for every preset', () => {
    const consumed = consumedVariables();
    expect(consumed.length).toBeGreaterThan(20);

    for (const id of PRESET_IDS) {
      const emitted = new Set(Object.keys(themeVariables(getTheme(id))));
      const missing = consumed.filter((name) => !emitted.has(name));
      // The original defect: 15 of these were never emitted, so every hover,
      // active, subtle and inverse state stayed on the neutral-codex fallback
      // no matter which theme was selected.
      expect(missing, `${id} does not emit`).toEqual([]);
    }
  });

  it('emits nothing tokens.css does not read', () => {
    const consumed = new Set(consumedVariables());
    const stray = Object.keys(themeVariables(getTheme('neutral-codex'))).filter(
      (name) => !consumed.has(name),
    );
    expect(stray).toEqual([]);
  });
});

describe('theme fonts against the document', () => {
  it('names only faces the app loads or the system provides', () => {
    const html = read('../../index.html');
    const loaded = new Set(
      [...html.matchAll(/family=([A-Za-z+]+)/g)].map((match) => match[1].replace(/\+/g, ' ')),
    );

    for (const id of PRESET_IDS) {
      const tokens = getTheme(id);
      for (const stack of [tokens.fontHeading, tokens.fontBody, tokens.fontMono, tokens.fontReader]) {
        for (const [, family] of stack.matchAll(/"([^"]+)"/g)) {
          // A quoted family that is neither loaded nor a system face falls back
          // silently, which is how three presets lost their typography.
          expect(loaded.has(family) || SYSTEM_FACES.has(family), `${id}: "${family}"`).toBe(true);
        }
      }
    }
  });
});
