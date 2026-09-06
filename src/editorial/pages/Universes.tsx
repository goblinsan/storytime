import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { editorialApi } from '../api';
import { useAsync } from '../useAsync';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import Surface from '../components/Surface';
import { newUniversePath, universePath } from '../paths';
import type { UniverseSummary } from '../types';

type SortKey = 'active' | 'name' | 'canon';

const canonTotal = (u: UniverseSummary) =>
  Object.values(u.canonCounts).reduce((a, b) => a + b, 0);

const SORTS: Record<SortKey, (a: UniverseSummary, b: UniverseSummary) => number> = {
  active: (a, b) => (b.lastActiveAt ?? '').localeCompare(a.lastActiveAt ?? ''),
  name: (a, b) => a.title.localeCompare(b.title),
  canon: (a, b) => canonTotal(b) - canonTotal(a),
};

export default function Universes() {
  const { status, data, error, retry } = useAsync(
    (signal) => editorialApi.listUniverses(signal), [],
  );
  const [sort, setSort] = useState<SortKey>('active');

  const universes = useMemo(
    () => (data ? [...data].sort(SORTS[sort]) : []),
    [data, sort],
  );

  if (status === 'loading') {
    return <Surface name="universes"><LoadingState label="Reading the codex…" /></Surface>;
  }
  if (status === 'error') {
    return (
      <Surface name="universes">
        <ErrorState title="Could not load universes" error={error} onRetry={retry} />
      </Surface>
    );
  }

  if (universes.length === 0) {
    return (
      <Surface name="universes">
      <EmptyState
        title="No universes yet"
        description="Create the first universe to begin charting its canon."
      >
        <Link className="editorial-button" to={newUniversePath()}>Create a universe</Link>
      </EmptyState>
      </Surface>
    );
  }

  return (
    <Surface name="universes">
      <div className="editorial-section-header">
        <h1 className="editorial-section-title">Universes</h1>
        <div className="editorial-form-group">
          <label className="editorial-form-label" htmlFor="universe-sort">Sort by</label>
          <select
            id="universe-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            <option value="active">Last active</option>
            <option value="name">Name</option>
            <option value="canon">Canon volume</option>
          </select>
        </div>
      </div>

      <div className="editorial-scanning-list">
        {universes.map((universe) => {
          const c = universe.canonCounts;
          return (
            <div className="editorial-action-row" key={universe.id}>
              <div className="editorial-action-row__detail">
                <Link to={universePath(universe.id)}>{universe.title}</Link>
                {universe.description && (
                  <span className="editorial-activity-row__time">
                    {universe.description.slice(0, 140)}
                  </span>
                )}
                <span className="editorial-activity-row__time">
                  {c.characters} characters · {c.locations} places · {c.factions} factions
                  {' · '}{c.timelineEvents} events · {c.bestiaryEntries} creatures
                  {universe.worksCount > 0 && ` · ${universe.worksCount} ${universe.worksCount === 1 ? 'work' : 'works'}`}
                </span>
              </div>
              <Link to={universePath(universe.id)} aria-label={`Open ${universe.title}`}>Open</Link>
            </div>
          );
        })}
      </div>

      <Link className="editorial-button" to={newUniversePath()}>New universe</Link>
    </Surface>
  );
}
