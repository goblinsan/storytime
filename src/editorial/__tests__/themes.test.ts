import { describe, expect, it } from 'vitest';
import {
  EDITORIAL_FANTASY_THEME,
  NEUTRAL_CODEX_THEME,
  SCIENCE_FICTION_THEME,
  THEME_PRESETS,
  getTheme,
  mergeTheme,
  themeStyle,
  themeVariables,
} from '../themes';
import type { ThemeTokens } from '../types';

const PRESET_IDS = [
  'neutral-codex',
  'editorial-fantasy',
  'science-fiction',
  'speculative-mystery',
  'historical-chronicle',
] as const;

describe('theme presets', () => {
  it('resolves every documented preset and falls back for anything else', () => {
    for (const id of PRESET_IDS) {
      expect(THEME_PRESETS[id]).toBeDefined();
    }
    expect(getTheme('no-such-theme')).toBe(NEUTRAL_CODEX_THEME);
    expect(getTheme(null)).toBe(NEUTRAL_CODEX_THEME);
    expect(getTheme('  Science-Fiction  ')).toBe(SCIENCE_FICTION_THEME);
  });

});

describe('emitted theme variables', () => {
  it('derives the interaction states from the theme rather than a fixed neutral', () => {
    const fantasy = themeVariables(EDITORIAL_FANTASY_THEME);
    const scifi = themeVariables(SCIENCE_FICTION_THEME);

    for (const state of [
      '--theme-surface-hover',
      '--theme-surface-active',
      '--theme-accent-primary-hover',
      '--theme-accent-primary-subtle',
    ]) {
      expect(fantasy[state], state).not.toBe(scifi[state]);
    }
  });

  it('keeps a primary button hover in the same family as its rest state', () => {
    const { '--theme-accent-primary': rest, '--theme-accent-primary-hover': hover } =
      themeVariables(SCIENCE_FICTION_THEME);
    const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const [rr, rg, rb] = channels(rest);
    const [hr, hg, hb] = channels(hover);

    // The old failure: accent-primary was themed and accent-primary-hover was
    // not, so a sky-blue button turned near-black slate under the cursor.
    expect(hb).toBeGreaterThan(hr);
    expect(hb).toBeGreaterThan(hg);
    expect(hr + hg + hb).toBeLessThan(rr + rg + rb);
  });

  it('picks accent text by contrast', () => {
    const dark = themeVariables({ ...NEUTRAL_CODEX_THEME, accentPrimary: '#111827' });
    const light = themeVariables({ ...NEUTRAL_CODEX_THEME, accentPrimary: '#fde68a' });
    expect(dark['--theme-accent-primary-text']).toBe(NEUTRAL_CODEX_THEME.canvas);
    expect(light['--theme-accent-primary-text']).toBe(NEUTRAL_CODEX_THEME.textHeading);
  });

  it('omits a derived variable it cannot compute instead of guessing', () => {
    const vars = themeVariables({ ...NEUTRAL_CODEX_THEME, canvas: 'var(--something-else)' });
    expect(vars['--theme-canvas']).toBe('var(--something-else)');
    expect(vars['--theme-surface-hover']).toBeUndefined();
  });
});

describe('overrides', () => {
  it('carries an override into every state derived from it', () => {
    const overridden = mergeTheme('neutral-codex', { accentPrimary: '#7c3aed' });
    const vars = themeVariables(overridden);
    expect(vars['--theme-accent-primary']).toBe('#7c3aed');
    expect(vars['--theme-accent-primary-hover']).not.toBe(
      themeVariables(NEUTRAL_CODEX_THEME)['--theme-accent-primary-hover'],
    );
    expect(vars['--theme-border-focus']).toBe('#7c3aed');
  });

  it('drops gradients, css break-outs and non-strings', () => {
    const merged = mergeTheme('neutral-codex', {
      canvas: 'linear-gradient(#fff, #000)',
      surface: '#fff; position: fixed',
      textBody: '}',
      accentPrimary: 42 as unknown as string,
      borderSubtle: '#abcdef',
    } as Partial<ThemeTokens>);

    expect(merged.canvas).toBe(NEUTRAL_CODEX_THEME.canvas);
    expect(merged.surface).toBe(NEUTRAL_CODEX_THEME.surface);
    expect(merged.textBody).toBe(NEUTRAL_CODEX_THEME.textBody);
    expect(merged.accentPrimary).toBe(NEUTRAL_CODEX_THEME.accentPrimary);
    expect(merged.borderSubtle).toBe('#abcdef');
  });

  it('ignores keys outside the token set', () => {
    const merged = mergeTheme('neutral-codex', { position: 'fixed' } as unknown as Partial<ThemeTokens>);
    expect('position' in merged).toBe(false);
  });
});

describe('themeStyle', () => {
  it('accepts an id, a selection and raw tokens', () => {
    const fromId = themeStyle('editorial-fantasy') as Record<string, string>;
    const fromSelection = themeStyle({ id: 'editorial-fantasy' }) as Record<string, string>;
    const fromTokens = themeStyle(EDITORIAL_FANTASY_THEME) as Record<string, string>;

    expect(fromId['--theme-canvas']).toBe(EDITORIAL_FANTASY_THEME.canvas);
    expect(fromSelection['--theme-canvas']).toBe(EDITORIAL_FANTASY_THEME.canvas);
    expect(fromTokens['--theme-canvas']).toBe(EDITORIAL_FANTASY_THEME.canvas);
  });

  it('applies a selection override through to the derived states', () => {
    const style = themeStyle({
      id: 'science-fiction',
      overrides: { canvas: '#101418' },
    }) as Record<string, string>;
    expect(style['--theme-canvas']).toBe('#101418');
    expect(style['--theme-text-inverse']).toBe('#101418');
  });

  it('quotes a cover image and refuses one that could break out of url()', () => {
    const safe = themeStyle({ id: 'neutral-codex', coverImageUrl: '/media/cover.jpg' }) as Record<string, string>;
    expect(safe['--theme-cover-image']).toBe('url("/media/cover.jpg")');

    const unsafe = themeStyle({
      id: 'neutral-codex',
      coverImageUrl: '/x.jpg"); position: fixed; background: url("evil',
    }) as Record<string, string>;
    expect(unsafe['--theme-cover-image']).toBeUndefined();
  });
});
