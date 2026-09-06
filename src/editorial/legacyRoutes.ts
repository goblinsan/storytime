import {
  dashboardPath, newUniversePath, readerPath, universePath, universeSectionPath, universesPath,
} from './paths';
import type { UniverseSection } from './paths';

export type LegacyTarget = 'dashboard' | 'universes' | 'universe' | 'universe-new' | 'reader';

/**
 * The legacy shell addressed a universe's sections with a ?tab= query. Each one
 * maps to the lens that owns that entity kind, so an old bookmark lands on the
 * purpose-built surface rather than a generic page.
 */
const TAB_TO_SECTION: Record<string, UniverseSection> = {
  characters: 'characters',
  cast: 'characters',
  locations: 'geography',
  geography: 'geography',
  map: 'geography',
  world: 'geography',
  timeline: 'timeline',
  history: 'timeline',
  events: 'timeline',
  factions: 'societies',
  societies: 'societies',
  religions: 'societies',
  languages: 'societies',
  bestiary: 'bestiary',
  creatures: 'bestiary',
  works: 'works',
  derivatives: 'works',
  media: 'media',
  settings: 'settings',
  encyclopedia: 'encyclopedia',
};

/** Where a legacy URL goes. Pure, so the mapping is testable without a router. */
export function legacyTargetPath(
  target: LegacyTarget,
  id: string | undefined,
  tab?: string | null,
): string {
  if (target === 'universe-new') return newUniversePath();
  if (target === 'universes') return universesPath();
  if (!id) return dashboardPath();
  if (target === 'dashboard') return dashboardPath();
  if (target === 'reader') return readerPath(id, id);

  const section = TAB_TO_SECTION[(tab ?? '').toLowerCase()];
  return section ? universeSectionPath(id, section) : universePath(id);
}
