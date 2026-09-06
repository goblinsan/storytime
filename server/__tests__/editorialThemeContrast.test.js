/**
 * Muted text has to pass AA on every ground it is used on, in every preset.
 *
 * The sidebar's count badges computed 4.098:1 and failed WCAG AA at 12px. The
 * trap is worth naming, because reading the stylesheet would have said it was
 * fine: workspace.css writes `var(--editorial-text-muted, #57534e)`, and that
 * fallback does pass. The token resolves through the theme layer, which
 * supplies #78716c, so the fallback is dead and the file reads as correct
 * while the page fails.
 *
 * A preset is data. Nothing about writing one tells the author which surfaces
 * their muted ink will land on, so the check belongs here rather than in a
 * reviewer's head.
 */
import { describe, expect, it } from 'vitest';
import { THEME_PRESETS, themeVariables } from '../../src/editorial/themes.ts';

const parse = (hex) => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const luminance = (hex) => {
  const rgb = parse(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((raw) => {
    const c = raw / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const ratio = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)];
  if (x === null || y === null) return null;
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/** Grounds that small text actually sits on. */
const GROUNDS = ['--theme-canvas', '--theme-surface', '--theme-surface-elevated',
  '--theme-surface-muted', '--theme-surface-active'];

/** Inks used at body size or below. AA wants 4.5:1 for both. */
const INKS = ['--theme-text-heading', '--theme-text-body', '--theme-text-muted'];

describe('every theme preset keeps small text readable on every ground', () => {
  for (const [name, tokens] of Object.entries(THEME_PRESETS)) {
    it(`${name} passes AA for muted and body ink`, () => {
      const vars = themeVariables(tokens);
      const failures = [];
      for (const ink of INKS) {
        for (const ground of GROUNDS) {
          const r = ratio(vars[ink], vars[ground]);
          if (r === null) continue;
          if (r < 4.5) {
            failures.push(`${ink} (${vars[ink]}) on ${ground} (${vars[ground]}) = ${r.toFixed(2)}:1`);
          }
        }
      }
      expect(failures, failures.join('\n')).toEqual([]);
    });

    it(`${name} keeps the accent legible on the canvas it ships with`, () => {
      const vars = themeVariables(tokens);
      const r = ratio(vars['--theme-accent-primary'], vars['--theme-canvas']);
      expect(r, `accent ${vars['--theme-accent-primary']} on canvas ${vars['--theme-canvas']}`)
        .toBeGreaterThanOrEqual(4.5);
    });
  }
});
