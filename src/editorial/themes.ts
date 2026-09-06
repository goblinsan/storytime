import type { CSSProperties } from 'react';
import type { UniverseThemeSelection } from './types';
import type { EditorialThemeId, ThemeTokens } from './types';

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
  'accentTertiary',
  'fontHeading',
  'fontBody',
  'fontMono',
] as const;

/**
 * Preset: Neutral Codex (Calm default editorial palette with warm neutral undertones)
 */
export const NEUTRAL_CODEX_THEME: ThemeTokens = {
  // Values from DESIGN.md: warm literary paper, burnt terracotta accent. The
  // accent was cold slate, which is what made every surface read as an admin
  // console rather than a codex.
  canvas: '#fbfaf7',
  surface: '#ffffff',
  surfaceElevated: '#f4f1ea',
  borderSubtle: '#e7e3da',
  borderStrong: '#c8c5bc',
  textHeading: '#1c1917',
  textBody: '#44403c',
  textMuted: '#635e58',
  accentPrimary: '#9a3412',
  accentSecondary: '#b45309',
  accentTertiary: '#0f766e',
  fontHeading: '"Lora", "Newsreader", "Charter", "Iowan Old Style", "Georgia", serif',
  fontBody: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  fontMono: '"SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  fontReader: '"Charter", "Newsreader", "Iowan Old Style", "Palatino Linotype", serif',
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
  textMuted: '#655b4f',
  accentPrimary: '#2d3748',
  accentSecondary: '#8c3b17',
  accentTertiary: '#3f6212',
  fontHeading: '"Cinzel", "Newsreader", "Georgia", serif',
  fontBody: '"Charter", -apple-system, BlinkMacSystemFont, "Segoe UI", serif',
  fontMono: '"SFMono-Regular", Menlo, Monaco, Consolas, monospace',
  fontReader: '"Newsreader", "Charter", "Iowan Old Style", serif',
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
  accentPrimary: '#0369a1',
  accentSecondary: '#0f766e',
  accentTertiary: '#0f766e',
  fontHeading: '"Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontBody: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
  fontMono: '"JetBrains Mono", "SFMono-Regular", Menlo, Monaco, monospace',
  fontReader: '"Charter", "Newsreader", "Palatino Linotype", serif',
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
  accentTertiary: '#3f3f46',
  fontHeading: '"Playfair Display", "Newsreader", "Georgia", serif',
  fontBody: '"Charter", -apple-system, BlinkMacSystemFont, "Segoe UI", serif',
  fontMono: '"SFMono-Regular", Menlo, Monaco, Consolas, monospace',
  fontReader: '"Newsreader", "Charter", "Iowan Old Style", serif',
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
  accentTertiary: '#155e75',
  fontHeading: '"Iowan Old Style", "Newsreader", "Georgia", serif',
  fontBody: '"Charter", "Georgia", serif',
  fontMono: '"SFMono-Regular", Menlo, Monaco, Consolas, monospace',
  fontReader: '"Iowan Old Style", "Charter", "Newsreader", serif',
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
 * The token layer in styles/tokens.css reads 24 --theme-* variables, not the 13
 * a preset declares: every hover, active, subtle, faint and inverse state is its
 * own variable. Emitting only the base tokens leaves those states pinned to the
 * neutral-codex fallbacks, so a themed accent turns near-black on hover and warm
 * parchment surfaces get cool slate hover rows. The derivations below compute
 * the states from the base tokens, which also means a per-universe override
 * carries into every state that depends on it.
 */

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function parseColor(value: string): Rgb | null {
  const hex = value.trim();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex);
  if (short) {
    return {
      r: parseInt(short[1] + short[1], 16),
      g: parseInt(short[2] + short[2], 16),
      b: parseInt(short[3] + short[3], 16),
    };
  }
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (long) {
    return {
      r: parseInt(long[1], 16),
      g: parseInt(long[2], 16),
      b: parseInt(long[3], 16),
    };
  }
  return null;
}

function toHex({ r, g, b }: Rgb): string {
  const channel = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/** Blend `amount` of `toward` into `from`. amount 0 returns `from`. */
function mix(from: string, toward: string, amount: number): string | null {
  const a = parseColor(from);
  const b = parseColor(toward);
  if (!a || !b) return null;
  return toHex({
    r: a.r + (b.r - a.r) * amount,
    g: a.g + (b.g - a.g) * amount,
    b: a.b + (b.b - a.b) * amount,
  });
}

function rgba(color: string, alpha: number): string | null {
  const parsed = parseColor(color);
  if (!parsed) return null;
  return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${alpha})`;
}

/** WCAG relative luminance, used only to decide text-on-accent. */
function luminance(color: string): number | null {
  const parsed = parseColor(color);
  if (!parsed) return null;
  const channel = (raw: number) => {
    const c = raw / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(parsed.r) + 0.7152 * channel(parsed.g) + 0.0722 * channel(parsed.b);
}

const BLACK = '#000000';

/**
 * Every --theme-* variable tokens.css reads, derived from the merged tokens.
 * A value that cannot be parsed as a color is omitted rather than guessed, so
 * the stylesheet's own fallback applies instead of a wrong colour.
 */
export function themeVariables(tokens: ThemeTokens): Record<string, string> {
  const vars: Record<string, string> = {
    '--theme-canvas': tokens.canvas,
    '--theme-surface': tokens.surface,
    '--theme-surface-elevated': tokens.surfaceElevated,
    '--theme-border-subtle': tokens.borderSubtle,
    '--theme-border-strong': tokens.borderStrong,
    '--theme-text-heading': tokens.textHeading,
    '--theme-text-body': tokens.textBody,
    '--theme-text-muted': tokens.textMuted,
    '--theme-text-inverse': tokens.canvas,
    '--theme-accent-primary': tokens.accentPrimary,
    '--theme-accent-secondary': tokens.accentSecondary,
    '--theme-accent-tertiary': tokens.accentTertiary,
    '--theme-font-heading': tokens.fontHeading,
    '--theme-font-body': tokens.fontBody,
    '--theme-font-mono': tokens.fontMono,
    '--theme-font-reader': tokens.fontReader,
  };

  const set = (name: string, value: string | null) => {
    if (value) vars[name] = value;
  };

  // Surface states step away from the canvas toward the heading ink, so they
  // keep the theme's temperature instead of reverting to warm neutral grey.
  set('--theme-surface-subtle', mix(tokens.canvas, tokens.textHeading, 0.02));
  set('--theme-surface-hover', mix(tokens.canvas, tokens.textHeading, 0.04));
  set('--theme-surface-muted', mix(tokens.canvas, tokens.textHeading, 0.06));
  set('--theme-surface-active', mix(tokens.canvas, tokens.textHeading, 0.09));

  set('--theme-border-hairline', rgba(tokens.textHeading, 0.08));
  set('--theme-border-focus', tokens.accentPrimary);

  set('--theme-text-faint', mix(tokens.textMuted, tokens.canvas, 0.25));

  for (const [role, accent] of [
    ['primary', tokens.accentPrimary],
    ['secondary', tokens.accentSecondary],
  ] as const) {
    set(`--theme-accent-${role}-hover`, mix(accent, BLACK, 0.18));
    set(`--theme-accent-${role}-subtle`, mix(accent, tokens.surface, 0.88));

    const accentLuminance = luminance(accent);
    if (accentLuminance !== null) {
      set(`--theme-accent-${role}-text`, accentLuminance > 0.45 ? tokens.textHeading : tokens.canvas);
    }
  }

  return vars;
}

/**
 * Converts a theme selection, theme tokens, or theme id into the CSSProperties
 * that carry a theme. Apply the result to the `.editorial-app` element itself
 * or an ancestor of it: tokens.css declares the --editorial-* tokens on
 * `.editorial-app`, and CSS substitutes var() where the property is declared,
 * so a --theme-* value set on a descendant of that element has no effect.
 *
 * themeVariables() above is the full list of variables emitted. An optional
 * cover image is added as --theme-cover-image when the selection carries one.
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

  const styleRecord: Record<string, string> = themeVariables(tokens);

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
  themeVariables,
  getTheme,
  mergeTheme,
  themeStyle,
};
