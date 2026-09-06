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

const SECTIONS: Array<[UniverseSection, string]> = [
  ['direction', 'Direction'],
  ['encyclopedia', 'Encyclopedia'],
  ['characters', 'Characters'],
  ['geography', 'Geography'],
  ['timeline', 'Timeline'],
  ['societies', 'Societies'],
  ['bestiary', 'Bestiary'],
  ['works', 'Works'],
  ['media', 'Media'],
  ['settings', 'Universe settings'],
];

const GLOBAL: Array<[string, string]> = [
  [dashboardPath(), 'Working dashboard'],
  [universesPath(), 'Universes'],
  [newUniversePath(), 'New universe'],
  [libraryPath(), 'Library'],
  [searchPath(), 'Search'],
  [compendiumPath(), 'Shared compendium'],
];

describe('the editorial route tree resolves', () => {
  it.each(GLOBAL)('%s renders its surface', (path, heading) => {
    const markup = renderAt(path);
    expect(markup).toContain(`>${heading}<`);
    expect(markup).not.toContain('No such page');
  });

  it('the universe overview renders its surface', () => {
    const markup = renderAt(universePath(U));
    expect(markup).toContain('>Universe overview<');
    expect(markup).not.toContain('No such page');
  });

  it.each(SECTIONS)('the %s section renders its surface', (section, heading) => {
    const markup = renderAt(universeSectionPath(U, section));
    expect(markup).toContain(`>${heading}<`);
    expect(markup).not.toContain('No such page');
  });

  it('the reader renders its surface', () => {
    const markup = renderAt(readerPath(U, 'work-1'));
    expect(markup).toContain('>Reader<');
    expect(markup).not.toContain('No such page');
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

  it('applies theme variables to the shell root', () => {
    expect(renderAt(dashboardPath())).toContain('--theme-canvas');
  });

  it('shows the universe section of the sidebar only inside a universe', () => {
    expect(renderAt(universePath(U))).toContain('Active Universe');
    expect(renderAt(dashboardPath())).not.toContain('Active Universe');
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
