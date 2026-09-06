/**
 * The one place the editorial route prefix is written down.
 *
 * The legacy app still owns `/universes/:storyId` in src/App.tsx, so the
 * editorial tree cannot take the root until legacy retirement. Every route,
 * link and redirect is built from the builders below; cutover sets
 * EDITORIAL_BASE to '' and the whole tree moves in one edit.
 *
 * See docs/editorial-ux-rebuild.md section 2.2.2. No other file under
 * src/editorial/ may contain the literal string '/editorial'.
 */

export const EDITORIAL_BASE = '/editorial';

export type UniverseSection =
  | 'direction'
  | 'encyclopedia'
  | 'characters'
  | 'geography'
  | 'timeline'
  | 'societies'
  | 'bestiary'
  | 'works'
  | 'media'
  | 'settings';

const join = (...segments: string[]): string => {
  const path = segments.filter(Boolean).join('/');
  return path.startsWith('/') ? path : `/${path}`;
};

/**
 * Route pattern for anything scoped to one universe, for useMatch. Built here
 * rather than in a component so the prefix still lives in exactly one file, and
 * unencoded because ':id' is a pattern segment, not a value.
 */
export const UNIVERSE_ROUTE_PATTERN = join(EDITORIAL_BASE, 'universes', ':id');

/**
 * Segments that sit where a universe id would but are not one. `universes/new`
 * matches the `universes/:id` pattern, which otherwise makes the shell believe
 * it is inside a universe called "new" and render its navigation.
 */
const RESERVED_UNIVERSE_SEGMENTS = new Set(['new']);

export const isUniverseId = (value: string | undefined | null): value is string =>
  Boolean(value) && !RESERVED_UNIVERSE_SEGMENTS.has(String(value));

export const dashboardPath = (): string => EDITORIAL_BASE || '/';

export const universesPath = (): string => join(EDITORIAL_BASE, 'universes');

export const libraryPath = (): string => join(EDITORIAL_BASE, 'library');

export const searchPath = (): string => join(EDITORIAL_BASE, 'search');

export const compendiumPath = (): string => join(EDITORIAL_BASE, 'compendium');

export const newUniversePath = (): string => join(EDITORIAL_BASE, 'universes', 'new');

export const universePath = (universeId: string): string =>
  join(EDITORIAL_BASE, 'universes', encodeURIComponent(universeId));

export const universeSectionPath = (universeId: string, section: UniverseSection): string =>
  join(universePath(universeId), section);

export const readerPath = (universeId: string, workId: string): string =>
  join(universePath(universeId), 'read', encodeURIComponent(workId));
