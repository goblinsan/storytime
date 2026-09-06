import { useState } from 'react';
import { editorialApi } from '../api';
import { useAsync } from '../useAsync';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import Surface from '../components/Surface';
import { CanonRowItem } from '../components/CanonRows';
import { text } from '../canonFields';

type Segment = 'characters' | 'bestiary';

export default function Compendium() {
  const [segment, setSegment] = useState<Segment>('characters');
  const [query, setQuery] = useState('');

  const { status, data, error, retry } = useAsync(
    (signal) => (segment === 'characters'
      ? editorialApi.listSharedCharacters(signal)
      : editorialApi.listSharedBestiary(signal)),
    [segment],
  );

  const term = query.trim().toLowerCase();
  const rows = (data ?? []).filter((row) =>
    !term || `${text(row, 'name')} ${text(row, 'summary', 'description')}`.toLowerCase().includes(term));

  return (
    <Surface name="compendium">
      <div className="editorial-section-header">
        <h1 className="editorial-section-title">Shared compendium</h1>
      </div>

      <p className="editorial-briefing__summary">
        Archetypes that exist above any one universe. A universe adopts one as a
        linked variant, keeping the shared invariant facts while its own history,
        role and ecology diverge locally.
      </p>

      <div className="editorial-encyclopedia-filter">
        <div className="editorial-form-group">
          <label className="editorial-form-label" htmlFor="compendium-segment">Kind</label>
          <select
            id="compendium-segment"
            value={segment}
            onChange={(e) => setSegment(e.target.value as Segment)}
          >
            <option value="characters">Characters</option>
            <option value="bestiary">Creatures</option>
          </select>
        </div>
        <div className="editorial-form-group">
          <label className="editorial-form-label" htmlFor="compendium-filter">Filter</label>
          <input
            id="compendium-filter"
            type="search"
            value={query}
            placeholder="Name or summary"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {status === 'loading' && <LoadingState label="Reading the shared canon…" />}
      {status === 'error' && (
        <ErrorState title="Could not load the compendium" error={error} onRetry={retry} />
      )}
      {status === 'ready' && rows.length === 0 && (
        <EmptyState
          title={query ? 'Nothing matches that' : 'Nothing shared yet'}
          description={query
            ? `No shared ${segment === 'characters' ? 'character' : 'creature'} matches “${query}”.`
            : 'A character or creature promoted out of a universe becomes a shared archetype other universes can adopt.'}
        />
      )}
      {status === 'ready' && rows.length > 0 && (
        <div className="editorial-compendium-layout">
          <div className="editorial-scanning-list">
            {rows.map((row) => (
              <CanonRowItem
                key={String(row.id)}
                title={text(row, 'name') || 'Unnamed'}
                detail={text(row, 'summary', 'description').slice(0, 220)}
                meta={[
                  text(row, 'archetype') ? `archetype: ${text(row, 'archetype')}` : null,
                  text(row, 'category') ? `category: ${text(row, 'category')}` : null,
                ].filter(Boolean).join(' · ') || undefined}
              />
            ))}
          </div>
        </div>
      )}
    </Surface>
  );
}
