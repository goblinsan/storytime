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
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

/**
 * The lists are READ OUT OF THE STYLESHEET, not written here.
 *
 * The hand-written version of this file named three inks and five grounds. The
 * editorial CSS uses thirteen inks and nineteen grounds, so the check covered
 * 15 of 247 possible pairs, and every pair it missed was free to fail. That is
 * how `--theme-text-faint` -- a token invented after this test was written,
 * derived as `mix(muted, canvas, 0.25)`, and therefore incapable of reaching
 * the floor its parent sits just above -- carried a group's population and a
 * character's billing rank at 3.51:1 while this file stayed green.
 *
 * Deriving the lists means the next ink cannot be invented outside the check.
 * Adding a token to tokens.css puts it in scope on the next run.
 */
const STYLESHEETS = ['tokens', 'workspace', 'reader']
  .map((name) => resolve(import.meta.dirname, '../../src/editorial/styles', `${name}.css`))
  .filter((file) => existsSync(file))
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n');

/** `--editorial-x: var(--theme-y, ...)` -- the alias layer, read as a map. */
const THEME_SOURCE = new Map(
  [...STYLESHEETS.matchAll(/(--editorial-[\w-]+):\s*var\((--theme-[\w-]+)/g)]
    .map((m) => [m[1], m[2]]),
);

const usedAs = (property) => {
  const pattern = property === 'color'
    ? /(?:^|[;{\s])color:\s*var\((--editorial-[\w-]+)/g
    : /background(?:-color)?:\s*[^;]*?var\((--editorial-[\w-]+)/g;
  return new Set([...STYLESHEETS.matchAll(pattern)]
    .map((m) => THEME_SOURCE.get(m[1]))
    .filter(Boolean));
};

const startsWithAny = (name, prefixes) => prefixes.some((p) => name.startsWith(p));

/**
 * General-purpose ink: it carries running text and is not tied to one card.
 * Status inks are excluded because they only ever sit on their own status
 * ground, which has its own check below.
 */
const INKS = [...usedAs('color')]
  .filter((name) => startsWithAny(name, ['--theme-text-']))
  .filter((name) => name !== '--theme-text-inverse')
  .sort();

/**
 * Grounds a general-purpose ink can land on. `--theme-row-selected` is here
 * because a selected row is a ground like any other -- it was an rgba wash
 * until this run, which is precisely why nothing could measure it.
 */
const GROUNDS = [...usedAs('background')]
  .filter((name) => startsWithAny(name, ['--theme-canvas', '--theme-surface', '--theme-row-selected']))
  .filter((name) => !name.endsWith('-text'))
  .sort();

/**
 * Every token this stylesheet uses as `color:`, classified. Anything that
 * lands in `unclassified` fails the build below.
 *
 * The filters above are the dangerous part of deriving a list: they discard
 * silently. The breadcrumb separator was painted with `--theme-border-strong`
 * -- a border token used as text, 1.73:1 in daylight -- and a filter that
 * keeps only `--theme-text-*` drops it without a word, which reads exactly
 * like passing. An ink that fits no family is a category error, and naming it
 * is the whole point.
 */
const INK_FAMILIES = ['--theme-text-', '--theme-accent-', '--theme-status-'];
const UNCLASSIFIED_INKS = [...usedAs('color')]
  .filter((name) => !startsWithAny(name, INK_FAMILIES))
  .sort();

/** Accents carry links and emphasis, on any page ground but not on selection. */
const ACCENTS = ['--theme-accent-primary', '--theme-accent-secondary', '--theme-accent-tertiary'];
const PAGE_GROUNDS = GROUNDS.filter((name) => name !== '--theme-row-selected');

/**
 * Both lights, every preset. Dark mode is where a palette silently stops
 * working: a wash tuned for warm paper computes 1.02:1 on obsidian, and an
 * accent that carries a whole product in daylight becomes a smudge at night.
 */
describe.each(['light', 'dark'])('in %s', (appearance) => {
describe('every theme preset keeps small text readable on every ground', () => {
  for (const [name, tokens] of Object.entries(THEME_PRESETS)) {
    it(`${name} passes AA for muted and body ink`, () => {
      const vars = themeVariables(tokens, appearance);
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
      const vars = themeVariables(tokens, appearance);
      const r = ratio(vars['--theme-accent-primary'], vars['--theme-canvas']);
      expect(r, `accent ${vars['--theme-accent-primary']} on canvas ${vars['--theme-canvas']}`)
        .toBeGreaterThanOrEqual(4.5);
    });

    it(`${name} keeps every accent role legible on every ground it sits on`, () => {
      const vars = themeVariables(tokens, appearance);
      const failures = [];
      for (const role of ['primary', 'secondary', 'tertiary']) {
        const ink = vars[`--theme-accent-${role}`];
        // Including the hover and active surfaces: an accent that clears 4.5:1
        // on the page and 4.38:1 when hovered fails exactly when it is looked at.
        for (const ground of PAGE_GROUNDS) {
          const r = ratio(ink, vars[ground]);
          if (r !== null && r < 4.5) failures.push(`${role} ${ink} on ${ground} = ${r.toFixed(2)}:1`);
        }
      }
      expect(failures, failures.join('\n')).toEqual([]);
    });

    it(`${name} keeps status ink readable on its own card`, () => {
      const vars = themeVariables(tokens, appearance);
      const failures = [];
      for (const meaning of ['info', 'success', 'warning', 'critical', 'protected']) {
        // The ink sits on the status card, not on the page, so that is the
        // ground it has to clear.
        const r = ratio(vars[`--theme-status-${meaning}-text`], vars[`--theme-status-${meaning}-bg`]);
        if (r !== null && r < 4.5) failures.push(`${meaning} = ${r.toFixed(2)}:1`);
      }
      expect(failures, failures.join('\n')).toEqual([]);
    });

    it(`${name} keeps a selected row's own ink legible on the selection tint`, () => {
      // The tint is made of the accent, so the accent is the one ink that is
      // never far from it: the cast row's name computed 3.98:1 at night. That
      // is what --theme-accent-on-selected is for, and it is only worth having
      // if it is checked.
      const vars = themeVariables(tokens, appearance);
      const r = ratio(vars['--theme-accent-on-selected'], vars['--theme-row-selected']);
      expect(r, `accent-on-selected ${vars['--theme-accent-on-selected']} on `
        + `row-selected ${vars['--theme-row-selected']}`).toBeGreaterThanOrEqual(4.5);
    });

    it(`${name} paints text with an ink, not with a border or a surface`, () => {
      expect(UNCLASSIFIED_INKS,
        'used as `color:` but not a text, accent or status ink -- a border or '
        + 'surface token used as text is drawn to sit beside content, not to be '
        + 'read as content, and no contrast rule covers it')
        .toEqual([]);
    });

    it(`${name} derives its ink and ground lists from the stylesheet`, () => {
      // Guarding the guard. If the regexes stop matching -- a reformat, a
      // rename, a move to another file -- every contrast test above silently
      // becomes a loop over nothing and passes. A check that cannot see the
      // thing it checks has to fail, not go quiet.
      expect(INKS.length, `inks derived: ${INKS.join(', ')}`).toBeGreaterThanOrEqual(4);
      expect(GROUNDS.length, `grounds derived: ${GROUNDS.join(', ')}`).toBeGreaterThanOrEqual(6);
      expect(INKS, 'the ink invented after this test was written').toContain('--theme-text-faint');
      expect(GROUNDS, 'the ground that was an unreadable rgba wash').toContain('--theme-row-selected');
    });

    it(`${name} tells the browser which way round the page is`, () => {
      // Without color-scheme the scrollbars, caret and form controls arrive in
      // the other light and the page looks broken at its edges.
      expect(themeVariables(tokens, appearance)['colorScheme']).toBe(appearance);
    });
  }
});
});
