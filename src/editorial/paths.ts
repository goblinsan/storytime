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
