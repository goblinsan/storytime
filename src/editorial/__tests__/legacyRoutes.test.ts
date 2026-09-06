import { describe, expect, it } from 'vitest';
import { legacyTargetPath } from '../legacyRoutes';
import {
  EDITORIAL_BASE, dashboardPath, newUniversePath, universePath, universeSectionPath,
} from '../paths';

const U = 'u-void-requiem';

describe('legacy URL mapping', () => {
  it('sends the old index to the dashboard', () => {
    expect(legacyTargetPath('dashboard', undefined)).toBe(dashboardPath());
    expect(legacyTargetPath('dashboard', U)).toBe(dashboardPath());
  });

  it('sends the old create page to universe creation', () => {
    expect(legacyTargetPath('universe-new', undefined)).toBe(newUniversePath());
  });

  it('sends a legacy universe URL to its overview', () => {
    expect(legacyTargetPath('universe', U)).toBe(universePath(U));
  });

  it.each([
    ['characters', 'characters'],
    ['cast', 'characters'],
    ['locations', 'geography'],
    ['map', 'geography'],
    ['world', 'geography'],
    ['timeline', 'timeline'],
    ['history', 'timeline'],
    ['factions', 'societies'],
    ['religions', 'societies'],
    ['creatures', 'bestiary'],
    ['derivatives', 'works'],
    ['settings', 'settings'],
  ] as const)('maps the legacy ?tab=%s query onto the %s lens', (tab, section) => {
    expect(legacyTargetPath('universe', U, tab))
      .toBe(universeSectionPath(U, section));
  });

  it('is case-insensitive about the tab', () => {
    expect(legacyTargetPath('universe', U, 'Characters'))
      .toBe(universeSectionPath(U, 'characters'));
  });

  it('falls back to the overview for a tab that no longer exists', () => {
    expect(legacyTargetPath('universe', U, 'nonsense')).toBe(universePath(U));
  });

  it('never sends a legacy URL outside the editorial tree', () => {
    const targets = [
      legacyTargetPath('dashboard', U),
      legacyTargetPath('universe', U, 'characters'),
      legacyTargetPath('universe-new', U),
      legacyTargetPath('reader', 'work-1'),
    ];
    for (const path of targets) {
      expect(path === EDITORIAL_BASE || path.startsWith(`${EDITORIAL_BASE}/`)).toBe(true);
    }
  });

  it('degrades to the dashboard rather than a broken path when the id is missing', () => {
    expect(legacyTargetPath('universe', undefined)).toBe(dashboardPath());
    expect(legacyTargetPath('reader', '')).toBe(dashboardPath());
  });
});
