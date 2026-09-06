import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { editorialApi } from '../api';
import { useAsync } from '../useAsync';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import Surface from '../components/Surface';
import { universeSectionPath } from '../paths';
import type { UniverseSection } from '../paths';
import type { CanonSearchResult, EditorialEntityType } from '../types';

/** Which lens owns each kind of entity, so a result opens the right surface. */
const LENS: Partial<Record<EditorialEntityType, UniverseSection>> = {
  character: 'characters',
  location: 'geography',
  faction: 'societies',
  timeline_event: 'timeline',
  bestiary: 'bestiary',
  technology: 'encyclopedia',
  mystery_signal: 'encyclopedia',
};

const TYPE_LABEL: Partial<Record<EditorialEntityType, string>> = {
  character: 'character', location: 'place', faction: 'faction',
  timeline_event: 'event', bestiary: 'creature',
  technology: 'technology', mystery_signal: 'signal',
};

export default function Search() {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const typeFilter = params.get('type') ?? 'all';

  // The URL is the source of truth, so a result set is a linkable address.
  // The input is local so typing does not push a history entry per keystroke.
  const [draft, setDraft] = useState(query);
  useEffect(() => { setDraft(query); }, [query]);

  useEffect(() => {
    if (draft === query) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (draft) next.set('q', draft); else next.delete('q');
      setParams(next, { replace: true });
    }, 250);
    return () => clearTimeout(timer);
  }, [draft, query, params, setParams]);

  const { status, data, error, retry } = useAsync(
    (signal) => (query ? editorialApi.searchCanon(query, { signal }) : Promise.resolve([])),
    [query],
  );

  const results = useMemo(
    () => (data ?? []).filter((r) => typeFilter === 'all' || r.entityType === typeFilter),
    [data, typeFilter],
  );

  const setType = (value: string) => {
    const next = new URLSearchParams(params);
    if (value === 'all') next.delete('type'); else next.set('type', value);
    setParams(next, { replace: true });
  };

  const body = () => {
    if (!query) {
      return (
        <EmptyState
          title="Search the canon"
          description="Every character, place, faction, event, creature, technology and signal across every universe. Results link into the lens that owns them."
        />
      );
    }
    if (status === 'loading') return <LoadingState label={`Searching for “${query}”…`} />;
    if (status === 'error') {
      return <ErrorState title="Search failed" error={error} onRetry={retry} />;
    }
    if (results.length === 0) {
      return (
        <EmptyState
          title="Nothing found"
          description={`No canon entity matches “${query}”${typeFilter === 'all' ? '' : ` in ${TYPE_LABEL[typeFilter as EditorialEntityType] ?? typeFilter}s`}.`}
        />
      );
    }
    return (
      <div className="editorial-scanning-list">
        {results.map((result: CanonSearchResult) => {
          const lens = LENS[result.entityType];
          return (
            <div className="editorial-action-row" key={`${result.universeId}-${result.entityType}-${result.id}`}>
              <div className="editorial-action-row__detail">
                <span className="editorial-activity-row__title">
                  {lens
                    ? <Link to={universeSectionPath(result.universeId, lens)}>{result.name}</Link>
                    : result.name}
                  {result.isProtected && (
                    <span className="editorial-activity-row__actor">protected</span>
                  )}
                </span>
                <span className="editorial-activity-row__time">
                  {TYPE_LABEL[result.entityType] ?? result.entityType} · {result.universeTitle}
                </span>
                {result.matchSnippet && (
                  <span className="editorial-activity-row__time">{result.matchSnippet}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Surface name="search">
      <div className="editorial-section-header">
        <h1 className="editorial-section-title">Search</h1>
        {query && status === 'ready' && (
          <span className="editorial-activity-row__time">
            {results.length} {results.length === 1 ? 'result' : 'results'}
          </span>
        )}
      </div>

      <div className="editorial-encyclopedia-filter">
        <div className="editorial-form-group">
          <label className="editorial-form-label" htmlFor="canon-search">Query</label>
          <input
            id="canon-search"
            type="search"
            value={draft}
            placeholder="A name, a place, a phrase"
            onChange={(e) => setDraft(e.target.value)}
          />
        </div>
        <div className="editorial-form-group">
          <label className="editorial-form-label" htmlFor="canon-type">Kind</label>
          <select id="canon-type" value={typeFilter} onChange={(e) => setType(e.target.value)}>
            <option value="all">Everything</option>
            {Object.entries(TYPE_LABEL).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      {body()}
    </Surface>
  );
}
