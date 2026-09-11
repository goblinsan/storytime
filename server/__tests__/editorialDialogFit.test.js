/**
 * A dialog is centered by its own size, never pinned to all four edges.
 *
 * Pinned with `inset: 0; margin: auto`, a dialog's height is whatever the
 * engine decides an auto height means for it. Chrome's stylesheet shrinks it
 * to the content; Safari stretched it to fill the window, and the media viewer
 * opened as a screen-tall box with the picture floating in the middle of it.
 * `height: fit-content` was the first fix, and Safari ignored that too. It
 * passed every check here because every check ran in Chrome.
 *
 * So the pinning itself is refused: a dialog sets its corner at 50% / 50% and
 * translates back by half its own size, which has one answer in every engine.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const styles = path.join(here, '..', '..', 'src', 'editorial', 'styles');
const SHEETS = ['tokens.css', 'workspace.css', 'reader.css'];

const dialogRules = () => [...SHEETS
  .map((f) => readFileSync(path.join(styles, f), 'utf8'))
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .filter(([, selector]) => /\bdialog\b/.test(selector))
  .map(([, selector, body]) => ({ selector: selector.trim(), body }));

const declares = (body, prop, value) => new RegExp(`(^|;)\\s*${prop}:\\s*${value}\\s*(;|$)`).test(body);

describe('dialogs', () => {
  it('are never pinned to all four edges', () => {
    const pinned = dialogRules()
      .filter(({ body }) => declares(body, 'inset', '0')
        || (declares(body, 'top', '0') && declares(body, 'bottom', '0')))
      .map(({ selector }) => selector);
    expect(pinned).toEqual([]);
  });

  // The second Safari failure, after centering was fixed: the viewer was a
  // grid with a max-height, and WebKit stretched its rows out to that height.
  // The limit and the layout belong on different boxes.
  it('are not grid or flex containers that also carry a max-height', () => {
    const stretched = dialogRules()
      .filter(({ body }) => /(^|;)\s*display:\s*(inline-)?(grid|flex)\s*(;|$)/.test(body)
        && /(^|;)\s*max-height:/.test(body))
      .map(({ selector }) => selector);
    expect(stretched).toEqual([]);
  });

  it('that place themselves, center on their own size', () => {
    const placed = dialogRules().filter(({ body }) => /(^|;)\s*inset:/.test(body));
    expect(placed.length).toBeGreaterThan(0);
    const offCenter = placed
      .filter(({ body }) => !declares(body, 'inset', '50% auto auto 50%')
        || !declares(body, 'transform', 'translate\\(-50%, -50%\\)'))
      .map(({ selector }) => selector);
    expect(offCenter).toEqual([]);
  });
});
