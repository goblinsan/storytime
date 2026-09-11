/**
 * A dialog centered with `inset: 0; margin: auto` has to say how tall it is.
 *
 * Chrome's own stylesheet gives a dialog `height: fit-content`, so leaving the
 * height out looks fine there. Safari's does not: with top and bottom both at
 * zero and the height left auto, the dialog stretches to fill the window, and
 * the media viewer opened as a screen-tall box with the picture floating in
 * the middle of it. It passed every check here because every check ran in
 * Chrome.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const styles = path.join(here, '..', '..', 'src', 'editorial', 'styles');
const SHEETS = ['tokens.css', 'workspace.css', 'reader.css'];

const rules = () => SHEETS
  .map((f) => readFileSync(path.join(styles, f), 'utf8'))
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .matchAll(/([^{}]+)\{([^{}]*)\}/g);

describe('dialogs centered by inset', () => {
  it('declare their own height, rather than trusting the browser default', () => {
    const unsized = [];
    let seen = 0;
    for (const [, selector, body] of rules()) {
      if (!/\bdialog\b/.test(selector) || !/(^|;)\s*inset:\s*0\s*(;|$)/.test(body)) continue;
      seen += 1;
      if (!/(^|;)\s*height:\s*fit-content\s*(;|$)/.test(body)) unsized.push(selector.trim());
    }
    expect(seen).toBeGreaterThan(0);
    expect(unsized).toEqual([]);
  });
});
