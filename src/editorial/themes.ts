import type { CSSProperties } from 'react';
import type { UniverseThemeSelection } from './types';
import type { EditorialThemeId, ThemeTokens } from './types';

/**
 * Valid CSS custom property names corresponding to theme variables.
 */
export const ALLOWED_THEME_VARIABLES = [
  '--theme-canvas',
  '--theme-surface',
  '--theme-surface-elevated',
  '--theme-border-subtle',
  '--theme-border-strong',
  '--theme-border',
  '--theme-text-heading',
  '--theme-text-body',
  '--theme-text-muted',
  '--theme-heading',
  '--theme-body',
  '--theme-muted',
  '--theme-accent-primary',
  '--theme-accent-secondary',
  '--theme-primary',
  '--theme-secondary',
  '--theme-font-heading',
  '--theme-font-body',
  '--theme-font-mono',
  '--theme-heading-font',
  '--theme-body-font',
] as const;

/**
 * Valid keys for ThemeTokens overrides.
 */
export const ALLOWED_TOKEN_KEYS: readonly (keyof ThemeTokens)[] = [
  'canvas',
  'surface',
  'surfaceElevated',
  'borderSubtle',
  'borderStrong',
  'textHeading',
  'textBody',
  'textMuted',
  'accentPrimary',
  'accentSecondary',
  'fontHeading',
  'fontBody',
  'fontMono',
] as const;

/**
 * Preset: Neutral Codex (Calm default editorial palette with warm neutral undertones)
 */
export const NEUTRAL_CODEX_THEME: ThemeTokens = {
  canvas: '#fbfaf8',
  surface: '#ffffff',
  surfaceElevated: '#ffffff',
  borderSubtle: '#e5e3dd',
  borderStrong: '#c8c5bc',
  textHeading: '#1c1917',
  textBody: '#292524',
  textMuted: '#57534e',
  accentPrimary: '#1e293b',
  accentSecondary: '#9a3412',
  fontHeading: '"Newsreader", "Charter", "Georgia", "Cambria", serif',
  fontBody: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  fontMono: '"SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
};

/**
 * Preset: Editorial Fantasy (Earthy parchment, ancient ink, and rich terracotta accents)
 */
export const EDITORIAL_FANTASY_THEME: ThemeTokens = {
  canvas: '#f6f3eb',
  surface: '#faf8f2',
  surfaceElevated: '#ffffff',
  borderSubtle: '#e4decb',
  borderStrong: '#c9be9f',
  textHeading: '#26201b',
  textBody: '#383029',
  textMuted: '#6e6356',
  accentPrimary: '#2d3748',
  accentSecondary: '#8c3b17',
  fontHeading: '"Cinzel", "Newsreader", "Georgia", serif',
  fontBody: '"Charter", -apple-system, BlinkMacSystemFont, "Segoe UI", serif',
  fontMono: '"SFMono-Regular", Menlo, Monaco, Consolas, monospace',
};

/**
 * Preset: Science Fiction (Clean cool slate, disciplined monochrome, and precision blue)
 */
export const SCIENCE_FICTION_THEME: ThemeTokens = {
  canvas: '#f4f6f8',
  surface: '#ffffff',
  surfaceElevated: '#f8fafc',
  borderSubtle: '#dbe2e8',
  borderStrong: '#b9c6d2',
  textHeading: '#0f172a',
  textBody: '#1e293b',
  textMuted: '#475569',
  accentPrimary: '#0284c7',
  accentSecondary: '#0f766e',
  fontHeading: '"Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontBody: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
  fontMono: '"JetBrains Mono", "SFMono-Regular", Menlo, Monaco, monospace',
};

/**
 * Preset: Speculative Mystery (Deep muted mist, noir charcoal, and antique brass)
 */
export const SPECULATIVE_MYSTERY_THEME: ThemeTokens = {
  canvas: '#f3f4f5',
  surface: '#fbfcfc',
  surfaceElevated: '#ffffff',
  borderSubtle: '#d8dcde',
  borderStrong: '#b5bcc0',
  textHeading: '#111827',
  textBody: '#1f2937',
  textMuted: '#4b5563',
  accentPrimary: '#374151',
  accentSecondary: '#92400e',
  fontHeading: '"Playfair Display", "Newsreader", "Georgia", serif',
  fontBody: '"Charter", -apple-system, BlinkMacSystemFont, "Segoe UI", serif',
  fontMono: '"SFMono-Regular", Menlo, Monaco, Consolas, monospace',
};

/**
 * Preset: Historical Chronicle (Classic archival tone, sepia-toned warmth, and burgundy)
 */
export const HISTORICAL_CHRONICLE_THEME: ThemeTokens = {
  canvas: '#f8f5ee',
  surface: '#fcfaf4',
  surfaceElevated: '#ffffff',
  borderSubtle: '#e2dccf',
  borderStrong: '#c2b8a3',
  textHeading: '#231f1d',
  textBody: '#35302c',
  textMuted: '#635b54',
  accentPrimary: '#3c3430',
  accentSecondary: '#831843',
  fontHeading: '"Iowan Old Style", "Newsreader", "Georgia", serif',
  fontBody: '"Charter", "Georgia", serif',
  fontMono: '"SFMono-Regular", Menlo, Monaco, Consolas, monospace',
};

/**
 * Registry of curated editorial theme presets.
 */
export const THEME_PRESETS: Record<string, ThemeTokens> = {
  'neutral-codex': NEUTRAL_CODEX_THEME,
  'editorial-fantasy': EDITORIAL_FANTASY_THEME,
  'science-fiction': SCIENCE_FICTION_THEME,
  'speculative-mystery': SPECULATIVE_MYSTERY_THEME,
  'historical-chronicle': HISTORICAL_CHRONICLE_THEME,
  // Ergonomic aliases
  neutral: NEUTRAL_CODEX_THEME,
  codex: NEUTRAL_CODEX_THEME,
  fantasy: EDITORIAL_FANTASY_THEME,
  scifi: SCIENCE_FICTION_THEME,
  mystery: SPECULATIVE_MYSTERY_THEME,
  historical: HISTORICAL_CHRONICLE_THEME,
  history: HISTORICAL_CHRONICLE_THEME,
};

/**
 * Sanitizes a token value:
 * - Must be non-empty string.
 * - Disallows gradients (linear-gradient, radial-gradient, conic-gradient).
 * - Disallows dangerous characters such as semicolons, curly braces, and urls in token values.
 */
function sanitizeTokenValue(val: unknown): string | null {
  if (typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (!trimmed) return null;
  // Disallow gradients
  if (/gradient/i.test(trimmed)) return null;
  // Disallow CSS syntax break-outs
  if (/[;{}]/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Retrieves the base preset tokens for a given theme id.
 * Unknown theme IDs safely fall back to the neutral-codex preset.
 */
export function getTheme(id?: string | null): ThemeTokens {
  if (!id || typeof id !== 'string') {
    return NEUTRAL_CODEX_THEME;
  }
  const key = id.trim().toLowerCase();
  return THEME_PRESETS[key] || NEUTRAL_CODEX_THEME;
}

/**
 * Merges a base theme or theme selection with safe overrides.
 * Guarantees that only allowed token keys are overwritten with valid non-gradient strings.
 * Arbitrary CSS properties or malicious injections are discarded.
 */
export function mergeTheme(
  base: ThemeTokens | UniverseThemeSelection | string,
  overrides?: Partial<ThemeTokens> | null,
): ThemeTokens {
  let baseTokens: ThemeTokens;
  let selectionOverrides: Partial<ThemeTokens> | undefined;

  if (typeof base === 'string') {
    baseTokens = getTheme(base);
  } else if ('canvas' in base && 'surface' in base && 'textHeading' in base) {
    baseTokens = base as ThemeTokens;
  } else {
    // UniverseThemeSelection
    const selection = base as UniverseThemeSelection;
    baseTokens = getTheme(selection.id);
    selectionOverrides = selection.overrides;
  }

  const merged: ThemeTokens = { ...baseTokens };

  const applySafeOverrides = (candidateOverrides?: Partial<ThemeTokens> | null) => {
    if (!candidateOverrides || typeof candidateOverrides !== 'object') return;
    for (const key of ALLOWED_TOKEN_KEYS) {
      if (Object.prototype.hasOwnProperty.call(candidateOverrides, key)) {
        const val = candidateOverrides[key];
        const safeVal = sanitizeTokenValue(val);
        if (safeVal !== null) {
          merged[key] = safeVal;
        }
      }
    }
  };

  // Apply overrides embedded in selection first
  if (selectionOverrides) {
    applySafeOverrides(selectionOverrides);
  }

  // Apply explicit overrides second
  if (overrides) {
    applySafeOverrides(overrides);
  }

  return merged;
}

/**
 * Converts a theme selection, theme tokens, or theme id into CSSProperties
 * containing the accepted editorial CSS variables and optional cover image.
 *
 * Mapped variables:
 * - canvas: --theme-canvas
 * - surface: --theme-surface
 * - surfaceElevated: --theme-surface-elevated
 * - borderSubtle: --theme-border-subtle, --theme-border
 * - borderStrong: --theme-border-strong
 * - textHeading: --theme-text-heading, --theme-heading
 * - textBody: --theme-text-body, --theme-body
 * - textMuted: --theme-text-muted, --theme-muted
 * - accentPrimary: --theme-accent-primary, --theme-primary
 * - accentSecondary: --theme-accent-secondary, --theme-secondary
 * - fontHeading: --theme-font-heading, --theme-heading-font
 * - fontBody: --theme-font-body, --theme-body-font
 * - fontMono: --theme-font-mono
 *
 * Cover image (if provided and valid URL):
 * - --theme-cover-image: url(...)
 */
export function themeStyle(
  selectionOrTokens?: UniverseThemeSelection | ThemeTokens | EditorialThemeId | null,
  runtimeOverrides?: Partial<ThemeTokens> | null,
): CSSProperties {
  let tokens: ThemeTokens;
  let coverImageUrl: string | undefined;

  if (!selectionOrTokens) {
    tokens = mergeTheme(NEUTRAL_CODEX_THEME, runtimeOverrides);
  } else if (typeof selectionOrTokens === 'string') {
    tokens = mergeTheme(selectionOrTokens, runtimeOverrides);
  } else if ('id' in selectionOrTokens && !('textHeading' in selectionOrTokens)) {
    const sel = selectionOrTokens as UniverseThemeSelection;
    tokens = mergeTheme(sel, runtimeOverrides);
    coverImageUrl = sel.coverImageUrl;
  } else {
    tokens = mergeTheme(selectionOrTokens as ThemeTokens, runtimeOverrides);
  }

  const styleRecord: Record<string, string> = {
    '--theme-canvas': tokens.canvas,
    '--theme-surface': tokens.surface,
    '--theme-surface-elevated': tokens.surfaceElevated,
    '--theme-border-subtle': tokens.borderSubtle,
    '--theme-border-strong': tokens.borderStrong,
    '--theme-border': tokens.borderSubtle,
    '--theme-text-heading': tokens.textHeading,
    '--theme-text-body': tokens.textBody,
    '--theme-text-muted': tokens.textMuted,
    '--theme-heading': tokens.textHeading,
    '--theme-body': tokens.textBody,
    '--theme-muted': tokens.textMuted,
    '--theme-accent-primary': tokens.accentPrimary,
    '--theme-accent-secondary': tokens.accentSecondary,
    '--theme-primary': tokens.accentPrimary,
    '--theme-secondary': tokens.accentSecondary,
    '--theme-font-heading': tokens.fontHeading,
    '--theme-font-body': tokens.fontBody,
    '--theme-font-mono': tokens.fontMono,
    '--theme-heading-font': tokens.fontHeading,
    '--theme-body-font': tokens.fontBody,
  };

  if (coverImageUrl && typeof coverImageUrl === 'string') {
    const trimmed = coverImageUrl.trim();
    // Validate safe URL: no quotes, semi-colons, or curly braces
    if (trimmed && !/[;{}"'\n\r]/.test(trimmed)) {
      styleRecord['--theme-cover-image'] = `url("${trimmed}")`;
    }
  }

  return styleRecord as unknown as CSSProperties;
}

export default {
  NEUTRAL_CODEX_THEME,
  EDITORIAL_FANTASY_THEME,
  SCIENCE_FICTION_THEME,
  SPECULATIVE_MYSTERY_THEME,
  HISTORICAL_CHRONICLE_THEME,
  THEME_PRESETS,
  ALLOWED_TOKEN_KEYS,
  ALLOWED_THEME_VARIABLES,
  getTheme,
  mergeTheme,
  themeStyle,
};
