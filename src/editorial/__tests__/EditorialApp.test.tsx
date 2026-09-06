import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EditorialApp from '../EditorialApp';
import {
  EDITORIAL_BASE,
  compendiumPath,
  dashboardPath,
  libraryPath,
  newUniversePath,
  readerPath,
  searchPath,
  universePath,
  universeSectionPath,
  universesPath,
  type UniverseSection,
} from '../paths';

const U = 'u-void-requiem';

/** Mount the tree the way src/App.tsx mounts it, so the test exercises the real prefix. */
const renderAt = (path: string) =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={`${EDITORIAL_BASE}/*`} element={<EditorialApp />} />
      </Routes>
    </MemoryRouter>,
  );

/**
 * Routes are asserted by the surface each one mounts, not by whatever that
 * surface happens to render: a surface gains loading and error states the moment
 * it becomes real, and the route still has to resolve to it.
 */
const SECTIONS: Array<[UniverseSection, string]> = [
  ['direction', 'direction'],
  ['encyclopedia', 'encyclopedia'],
  ['characters', 'characters'],
  ['geography', 'geography'],
  ['timeline', 'timeline'],
  ['societies', 'societies'],
  ['bestiary', 'bestiary'],
  ['works', 'works'],
  ['media', 'media'],
  ['settings', 'universe-settings'],
];

const GLOBAL: Array<[string, string]> = [
  [dashboardPath(), 'dashboard'],
  [universesPath(), 'universes'],
  [newUniversePath(), 'universe-create'],
  [libraryPath(), 'library'],
  [searchPath(), 'search'],
  [compendiumPath(), 'compendium'],
];

describe('the editorial route tree resolves', () => {
  it.each(GLOBAL)('%s mounts its surface', (path, surface) => {
    const markup = renderAt(path);
    expect(markup).toContain(`data-surface="${surface}"`);
    expect(markup).not.toContain('No such page');
  });

  it('the universe overview mounts its surface', () => {
    const markup = renderAt(universePath(U));
    expect(markup).toContain('data-surface="universe-dashboard"');
    expect(markup).not.toContain('No such page');
  });

  it.each(SECTIONS)('the %s section mounts its surface', (section, surface) => {
    const markup = renderAt(universeSectionPath(U, section));
    expect(markup).toContain(`data-surface="${surface}"`);
    expect(markup).not.toContain('No such page');
  });

  it('the reader mounts its surface', () => {
    const markup = renderAt(readerPath(U, 'work-1'));
    expect(markup).toContain('data-surface="reader"');
    expect(markup).not.toContain('No such page');
  });

  it('gives every route a distinct surface', () => {
    const seen = new Set<string>();
    const paths = [
      ...GLOBAL.map(([p]) => p),
      universePath(U),
      ...SECTIONS.map(([s]) => universeSectionPath(U, s)),
      readerPath(U, 'work-1'),
    ];
    for (const path of paths) {
      const surface = renderAt(path).match(/data-surface="([^"]+)"/)?.[1];
      expect(surface, path).toBeDefined();
      expect(seen.has(surface!), `${path} reuses surface ${surface}`).toBe(false);
      seen.add(surface!);
    }
    expect(seen.size).toBe(paths.length);
  });

  it('an unknown editorial path renders not-found, inside the shell', () => {
    const markup = renderAt(`${EDITORIAL_BASE}/universes/${U}/nonsense`);
    expect(markup).toContain('No such page');
    expect(markup).toContain('editorial-shell');
  });
});

describe('the shell frames every surface', () => {
  it('renders the sidebar, top bar and content region around a surface', () => {
    const markup = renderAt(dashboardPath());
    expect(markup).toContain('editorial-app editorial-shell');
    expect(markup).toContain('editorial-shell__sidebar');
    expect(markup).toContain('editorial-topbar');
    expect(markup).toContain('editorial-shell__content');
    expect(markup).toContain('aria-label="Editorial Navigation"');
  });

  it('renders every surface inside an editorial-app root', () => {
    // tokens.css declares every --editorial-* token on .editorial-app. A surface
    // outside it falls back to raw UA styling -- which is what happened when the
    // reader was moved out of the shell to get its full-viewport layout.
    const paths = [
      ...GLOBAL.map(([p]) => p),
      universePath(U),
      ...SECTIONS.map(([s]) => universeSectionPath(U, s)),
      readerPath(U, 'work-1'),
    ];
    for (const path of paths) {
      expect(renderAt(path), path).toMatch(/class="[^"]*\beditorial-app\b/);
    }
  });

  it('applies theme variables to the shell root', () => {
    expect(renderAt(dashboardPath())).toContain('--theme-canvas');
  });

  it('shows the universe section of the sidebar only inside a universe', () => {
    expect(renderAt(universePath(U))).toContain('Active Universe');
    expect(renderAt(dashboardPath())).not.toContain('Active Universe');
  });

  it('does not treat universes/new as a universe', () => {
    // It matches the universes/:id pattern, so without a guard the shell shows
    // the navigation for a universe called "new".
    const markup = renderAt(newUniversePath());
    expect(markup).toContain('data-surface="universe-create"');
    expect(markup).not.toContain('Active Universe');
  });
});

describe('the tree is finished', () => {
  it('has no placeholder surface left', () => {
    // 1012's own acceptance: a tree with holes in it is not a finished tree.
    const paths = [
      ...GLOBAL.map(([p]) => p),
      universePath(U),
      ...SECTIONS.map(([s]) => universeSectionPath(U, s)),
      readerPath(U, 'work-1'),
    ];
    for (const path of paths) {
      expect(renderAt(path), path).not.toContain('data-placeholder="true"');
      expect(renderAt(path), path).not.toContain('Not built yet');
    }
  });

});

describe('the tree owns no literal prefix', () => {
  it('every rendered link sits under the mount point', () => {
    const markup = renderAt(universePath(U));
    const hrefs = [...markup.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href === EDITORIAL_BASE || href.startsWith(`${EDITORIAL_BASE}/`)).toBe(true);
    }
  });

  it('does not claim the legacy /universes/:storyId route', () => {
    const hrefs = [...renderAt(dashboardPath()).matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs.some((h) => h.startsWith('/universes'))).toBe(false);
  });
});
