/**
 * One head, shared, not six copies of it.
 *
 * Six surfaces hand-rolled the masthead markup in two variants: some wrapped
 * it in `editorial-surface__fixed` with `--tight` and some did not, so half
 * the nav carried a hairline rule under the title and 44px beneath it and the
 * other half had no rule and 28px. Nobody chose that. Each page re-decided the
 * structure on its way to solving a different problem and the spacing came
 * along with whatever it had copied, which is how moving between tabs stopped
 * feeling like one application.
 *
 * A shared component that anybody may bypass is a convention, and a convention
 * is exactly what this already was. So the rule has teeth: the markup lives in
 * SurfaceMasthead, and a page that writes it itself fails the build.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const pagesDir = path.join(here, '..', '..', 'src', 'editorial', 'pages');
const componentsDir = path.join(here, '..', '..', 'src', 'editorial', 'components');

const MASTHEAD = path.join(componentsDir, 'SurfaceMasthead.tsx');

const pages = () => readdirSync(pagesDir)
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => ({ file: f, src: readFileSync(path.join(pagesDir, f), 'utf8') }));

describe('one surface masthead', () => {
  it('has somewhere for the markup to live', () => {
    // Without this the checks below pass by matching nothing, which is how a
    // guard reports success for a rule it never looked at.
    const src = readFileSync(MASTHEAD, 'utf8');
    expect(src).toMatch(/editorial-masthead__title/);
    expect(src).toMatch(/editorial-surface__fixed/);
  });

  it('is the only place that writes the masthead markup', () => {
    const offenders = pages()
      .filter((p) => /className="editorial-masthead(__|\s|")/.test(p.src))
      .map((p) => p.file);
    expect(
      offenders,
      'these write the masthead themselves instead of using SurfaceMasthead',
    ).toEqual([]);
  });

  it('is the only place that decides the head spacing', () => {
    // `--tight` was the variant that split the nav in two. It has no callers
    // now, and a page reaching for it again is a page choosing its own spacing.
    const offenders = pages()
      .filter((p) => /editorial-masthead--tight|editorial-surface__fixed/.test(p.src))
      .map((p) => p.file);
    expect(offenders, 'these set the head spacing themselves').toEqual([]);
  });

  /**
   * Surfaces outside the universe nav.
   *
   * The rule this guard exists for is "moving between the tabs of one universe
   * must not change what kind of page you are on". These are not those tabs:
   * they are the global shell around universes, and the library and the reader
   * in particular are a different kind of page on purpose. Named rather than
   * excluded by a pattern, so adding one is a decision somebody makes here.
   */
  const OUTSIDE_THE_UNIVERSE_NAV = new Set([
    'Compendium.tsx', 'Dashboard.tsx', 'Library.tsx', 'Reader.tsx', 'Search.tsx',
    'UniverseCreate.tsx', 'Universes.tsx',
  ]);

  it('titles the universe rather than itself', () => {
    // Eight of twelve surfaces passed a bare string -- "Timeline",
    // "Societies", "Settings" -- while the other four carried the universe's
    // name, so half the nav announced the section and half announced the
    // universe, and moving between them read as moving between products. The
    // section is already named by the sidebar, which highlights it; the title
    // says where you are.
    const offenders = pages()
      .filter((p) => !OUTSIDE_THE_UNIVERSE_NAV.has(p.file))
      .filter((p) => /<SurfaceMasthead[^>]*\stitle="[^"]+"/s.test(p.src))
      .map((p) => p.file);
    expect(
      offenders,
      'these title themselves; the head carries the universe and the sidebar says the section',
    ).toEqual([]);
  });

  it('is used by every universe surface that has a title', () => {
    // A page with an <h1> and no SurfaceMasthead grew a second way of having a
    // title, which is exactly where this started: five of these set the page
    // title with `editorial-section-title`, a 20px section heading, so half
    // the nav had a 30px title and half had a 20px one.
    const offenders = pages()
      .filter((p) => !OUTSIDE_THE_UNIVERSE_NAV.has(p.file))
      .filter((p) => /<h1[\s>]/.test(p.src) && !/SurfaceMasthead/.test(p.src))
      .map((p) => p.file);
    expect(offenders, 'these have an h1 of their own').toEqual([]);
  });
});
