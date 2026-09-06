import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useEncyclopedia } from '../useEncyclopedia';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import Surface from '../components/Surface';
import { CanonRowItem, ProtectedBadge } from '../components/CanonRows';
import { isProtected, text } from '../canonFields';
import { universeSectionPath } from '../paths';
import type { UniverseSection } from '../paths';
import type { CanonRow, EncyclopediaCatalog } from '../api';

/**
 * The index does not flatten the specialised lenses: every category links into
 * the lens that owns it, so a result opens the surface built for that kind of
 * entity rather than a generic detail page.
 */
const CATEGORIES: Array<{
  key: keyof EncyclopediaCatalog;
  label: string;
  lens: UniverseSection | null;
}> = [
  { key: 'characters', label: 'Characters', lens: 'characters' },
  { key: 'locations', label: 'Places', lens: 'geography' },
  { key: 'factions', label: 'Factions', lens: 'societies' },
  { key: 'timelineEvents', label: 'Events', lens: 'timeline' },
  { key: 'bestiary', label: 'Creatures', lens: 'bestiary' },
  { key: 'technologies', label: 'Technologies', lens: null },
  { key: 'signals', label: 'Signals', lens: null },
  { key: 'religions', label: 'Religions', lens: 'societies' },
  { key: 'languages', label: 'Languages', lens: 'societies' },
  { key: 'arcs', label: 'Arcs', lens: null },
];

const nameOf = (row: CanonRow) => text(row, 'name', 'title') || 'Untitled';
const detailOf = (row: CanonRow) => text(row, 'description', 'summary', 'role', 'category');

export default function Encyclopedia() {
  const { status, data, error, retry, universeId } = useEncyclopedia();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | keyof EncyclopediaCatalog>('all');

  const groups = useMemo(() => {
    if (!data) return [];
    const term = query.trim().toLowerCase();
    return CATEGORIES
      .filter((c) => category === 'all' || category === c.key)
      .map((c) => ({
        ...c,
        rows: data.catalog[c.key].filter((row) =>
          !term || `${nameOf(row)} ${detailOf(row)}`.toLowerCase().includes(term)),
      }))
      .filter((g) => g.rows.length > 0);
  }, [data, query, category]);

  if (status === 'loading') {
    return <Surface name="encyclopedia"><LoadingState label="Reading the catalogue…" /></Surface>;
  }
  if (status === 'error') {
    return (
      <Surface name="encyclopedia">
        <ErrorState title="Could not load the encyclopedia" error={error} onRetry={retry} />
      </Surface>
    );
  }

  const matches = groups.reduce((n, g) => n + g.rows.length, 0);

  return (
    <Surface name="encyclopedia">
      <div className="editorial-section-header">
        <h1 className="editorial-section-title">Encyclopedia</h1>
      </div>

      <div className="editorial-encyclopedia-filter">
        <div className="editorial-form-group">
          <label className="editorial-form-label" htmlFor="canon-filter">Filter</label>
          <input
            id="canon-filter"
            type="search"
            value={query}
            placeholder="Name or description"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="editorial-form-group">
          <label className="editorial-form-label" htmlFor="canon-category">Category</label>
          <select
            id="canon-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as typeof category)}
          >
            <option value="all">Everything</option>
            {CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>

      {matches === 0 ? (
        <EmptyState
          title={query ? 'Nothing matches that' : 'No canon recorded yet'}
          description={query
            ? `No entity in this universe matches “${query}”.`
            : 'This universe has no canon entities yet.'}
        />
      ) : (
        groups.map((group) => (
          <section className="editorial-band" key={group.key}>
            <div className="editorial-section-header">
              <h2 className="editorial-section-title">
                {group.label} <span className="editorial-activity-row__time">{group.rows.length}</span>
              </h2>
              {group.lens && (
                <Link to={universeSectionPath(universeId, group.lens)}>
                  Open the {group.label.toLowerCase()} lens
                </Link>
              )}
            </div>
            <div className="editorial-scanning-list">
              {group.rows.slice(0, 40).map((row) => (
                <CanonRowItem
                  key={`${group.key}-${String(row.id)}`}
                  title={nameOf(row)}
                  detail={detailOf(row).slice(0, 180)}
                  badge={<ProtectedBadge on={isProtected(row)} />}
                  to={group.lens ? universeSectionPath(universeId, group.lens) : undefined}
                />
              ))}
            </div>
            {group.rows.length > 40 && (
              <p className="editorial-empty-state__desc">
                Showing 40 of {group.rows.length}. Narrow with the filter above.
              </p>
            )}
          </section>
        ))
      )}
    </Surface>
  );
}
