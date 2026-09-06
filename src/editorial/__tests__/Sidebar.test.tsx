import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from '../Sidebar';
import type { UniverseSummary } from '../types';
import { EDITORIAL_BASE } from '../paths';

const universe: UniverseSummary = {
  id: 'u-void-requiem',
  title: 'Void Requiem',
  description: 'A dying-star opera.',
  canonCounts: {
    characters: 24,
    locations: 17,
    factions: 6,
    timelineEvents: 41,
    bestiaryEntries: 9,
    technologies: 12,
    mysterySignals: 3,
    arcs: 5,
    relationships: 62,
  },
  worksCount: 4,
  concernsCount: 2,
};

const render = (props: Parameters<typeof Sidebar>[0] = {}, route = EDITORIAL_BASE) =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[route]}>
      <Sidebar {...props} />
    </MemoryRouter>,
  );

const hrefs = (markup: string) =>
  Array.from(markup.matchAll(/href="([^"]+)"/g)).map((match) => match[1]);

describe('editorial sidebar routes', () => {
  it('uses the contract vocabulary for the three contested sections', () => {
    const markup = render({ universe });
    const links = hrefs(markup);

    expect(links).toContain(`${EDITORIAL_BASE}/universes/u-void-requiem/direction`);
    expect(links).toContain(`${EDITORIAL_BASE}/universes/u-void-requiem/geography`);
    expect(links).toContain(`${EDITORIAL_BASE}/universes/u-void-requiem/timeline`);

    expect(markup).toContain('>Direction<');
    expect(markup).toContain('>Geography<');
    expect(markup).toContain('>Timeline<');

    for (const rejected of ['/development', '/world', '/history']) {
      expect(links.some((href) => href.endsWith(rejected))).toBe(false);
    }
    for (const rejected of ['>Development<', '>World<', '>History<']) {
      expect(markup).not.toContain(rejected);
    }
  });

  it('renders every route under the editorial prefix', () => {
    const links = hrefs(render({ universe }));
    expect(links.length).toBeGreaterThan(0);
    for (const href of links) {
      expect(href === EDITORIAL_BASE || href.startsWith(`${EDITORIAL_BASE}/`)).toBe(true);
    }
  });

  it('never collides with the legacy /universes/:storyId route', () => {
    const links = hrefs(render({ universe }));
    expect(links.some((href) => href.startsWith('/universes'))).toBe(false);
  });

  it('renders the global destinations with no universe selected', () => {
    const markup = render();
    for (const label of ['Dashboard', 'Universes', 'Library', 'Shared Compendium', 'Search', 'New Universe']) {
      expect(markup).toContain(`>${label}<`);
    }
    expect(markup).not.toContain('Active Universe');
  });

  it('shows canon counts as part of the link text so they are in the accessible name', () => {
    const markup = render({ universe });
    expect(markup).toMatch(/Characters<\/span><span class="editorial-sidebar__badge">24</);
    expect(markup).toMatch(/Works<\/span><span class="editorial-sidebar__badge">4</);
  });

  it('omits a zero badge rather than rendering an empty count', () => {
    const markup = render({ universe: { ...universe, worksCount: 0 } });
    expect(markup).toContain('>Works<');
    expect(markup).not.toMatch(/editorial-sidebar__badge">0</);
  });
});

describe('editorial sidebar accessible naming', () => {
  it('names each link explicitly only when collapsed hides its label', () => {
    expect(render({ universe, collapsed: true })).toContain('aria-label="Characters"');
    expect(render({ universe, collapsed: false })).not.toContain('aria-label="Characters"');
  });

  it('marks the collapse toggle with its expanded state', () => {
    expect(render({ universe, onToggleCollapse: () => {} })).toContain('aria-expanded="true"');
  });
});

describe('editorial sidebar drawer', () => {
  it('carries the open modifier and a backdrop only when open', () => {
    const open = render({ universe, mobileOpen: true, onCloseMobile: () => {} });
    expect(open).toContain('editorial-shell__sidebar--open');
    expect(open).toContain('editorial-sidebar-backdrop--visible');

    const closed = render({ universe, mobileOpen: false, onCloseMobile: () => {} });
    expect(closed).not.toContain('editorial-shell__sidebar--open');
    expect(closed).not.toContain('editorial-sidebar-backdrop');
  });

  it('emits a clean class list when no modifier applies', () => {
    expect(render({ universe })).toContain('class="editorial-shell__sidebar"');
  });

  it('styles the callback controls by class rather than inline style', () => {
    const markup = render({ universe, onNewUniverse: () => {}, onSelectUniverse: () => {} });
    expect(markup).toContain('editorial-sidebar__link--action');
    expect(markup).toContain('editorial-sidebar__universe-switch');
    expect(markup).not.toContain('style="');
  });
});
