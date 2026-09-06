import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { editorialApi, type CanonRow } from '../api';
import { useAsync } from '../useAsync';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import Surface from '../components/Surface';
import { ProtectedBadge } from '../components/CanonRows';
import { isProtected, text } from '../canonFields';

const parentOf = (row: CanonRow) => text(row, 'parentId', 'parent_id') || null;
const label = (row: CanonRow) => text(row, 'name') || 'Unnamed place';

/** The kind a place is, preferring the celestial classification where it has one. */
const kindOf = (row: CanonRow) =>
  text(row, 'celestialType', 'celestial_type') || text(row, 'regionType', 'region_type') || 'place';

const num = (row: CanonRow, ...keys: string[]): number | null => {
  for (const key of keys) {
    const v = row[key];
    if (typeof v === 'number') return v;
  }
  return null;
};

export default function Geography() {
  const { id = '' } = useParams();
  const { status, data, error, retry } = useAsync(
    (signal) => editorialApi.listLocations(id, signal), [id],
  );
  const [path, setPath] = useState<string[]>([]);

  const { byId, childrenOf, roots } = useMemo(() => {
    const rows = data ?? [];
    const byId = new Map(rows.map((r) => [String(r.id), r]));
    const childrenOf = new Map<string | null, CanonRow[]>();
    for (const row of rows) {
      const key = parentOf(row);
      if (!childrenOf.has(key)) childrenOf.set(key, []);
      childrenOf.get(key)!.push(row);
    }
    for (const list of childrenOf.values()) list.sort((a, b) => label(a).localeCompare(label(b)));
    return { byId, childrenOf, roots: childrenOf.get(null) ?? [] };
  }, [data]);

  if (status === 'loading') {
    return <Surface name="geography"><LoadingState label="Reading the territory…" /></Surface>;
  }
  if (status === 'error') {
    return (
      <Surface name="geography">
        <ErrorState title="Could not load geography" error={error} onRetry={retry} />
      </Surface>
    );
  }

  if (roots.length === 0) {
    return (
      <Surface name="geography">
        <EmptyState
          title="No places yet"
          description="Systems, worlds and the sites on them appear here as a hierarchy you can descend."
        />
      </Surface>
    );
  }

  const current = path.length > 0 ? byId.get(path[path.length - 1]) ?? null : null;
  const showing = current ? childrenOf.get(String(current.id)) ?? [] : roots;
  const trail = path.map((pid) => byId.get(pid)).filter(Boolean) as CanonRow[];

  const descendantCount = (row: CanonRow): number => {
    const kids = childrenOf.get(String(row.id)) ?? [];
    return kids.reduce((n, k) => n + 1 + descendantCount(k), 0);
  };

  return (
    <Surface name="geography">
      <div className="editorial-section-header">
        <h1 className="editorial-section-title">Geography</h1>
        <span className="editorial-activity-row__time">{(data ?? []).length} places</span>
      </div>

      {/* Where you are in the hierarchy: system, then body, then site. */}
      <nav className="editorial-topbar__breadcrumbs" aria-label="Location hierarchy">
        <button
          type="button"
          className="editorial-button editorial-button--quiet"
          onClick={() => setPath([])}
          disabled={path.length === 0}
        >
          Everything
        </button>
        {trail.map((node, i) => (
          <span key={String(node.id)}>
            <span className="editorial-topbar__breadcrumb-separator" aria-hidden="true"> / </span>
            <button
              type="button"
              className="editorial-button editorial-button--quiet"
              onClick={() => setPath(path.slice(0, i + 1))}
              disabled={i === trail.length - 1}
            >
              {label(node)}
            </button>
          </span>
        ))}
      </nav>

      {current && (
        <section className="editorial-band">
          <h2 className="editorial-section-title">
            {label(current)}
            <ProtectedBadge on={isProtected(current)} />
          </h2>
          <p className="editorial-activity-row__time">
            {[
              kindOf(current),
              text(current, 'starClass', 'star_class') && `class ${text(current, 'starClass', 'star_class')}`,
              text(current, 'hazardTier', 'hazard_tier') && `hazard ${text(current, 'hazardTier', 'hazard_tier')}`,
              text(current, 'races') && `inhabitants: ${text(current, 'races')}`,
            ].filter(Boolean).join(' · ')}
          </p>
          {text(current, 'description') && (
            <p className="editorial-briefing__summary">{text(current, 'description')}</p>
          )}
          {text(current, 'politicalNotes', 'political_notes') && (
            <p className="editorial-activity-row__time">
              Control: {text(current, 'politicalNotes', 'political_notes')}
            </p>
          )}
        </section>
      )}

      <section className="editorial-band">
        <div className="editorial-section-header">
          <h2 className="editorial-section-title">
            {current ? 'Within this place' : 'Systems and bodies'}
          </h2>
          <span className="editorial-activity-row__time">{showing.length}</span>
        </div>

        {showing.length === 0 ? (
          <EmptyState
            title="Nothing recorded inside this place"
            description="Sites within it will appear here once they are charted."
          />
        ) : (
          <div className="editorial-scanning-list">
            {showing.map((row) => {
              const inside = childrenOf.get(String(row.id)) ?? [];
              const gx = num(row, 'gridX', 'grid_x');
              const gy = num(row, 'gridY', 'grid_y');
              const placed = (gx ?? 0) !== 0 || (gy ?? 0) !== 0;
              return (
                <div className="editorial-action-row" key={String(row.id)}>
                  <div className="editorial-action-row__detail">
                    <span className="editorial-activity-row__title">
                      {label(row)}
                      <ProtectedBadge on={isProtected(row)} />
                    </span>
                    <span className="editorial-activity-row__time">
                      {[
                        kindOf(row),
                        inside.length > 0 && `${descendantCount(row)} inside`,
                        placed ? `mapped at ${gx}, ${gy}` : 'not yet placed on the map',
                      ].filter(Boolean).join(' · ')}
                    </span>
                    {text(row, 'description') && (
                      <span className="editorial-activity-row__time">
                        {text(row, 'description').slice(0, 160)}
                      </span>
                    )}
                  </div>
                  {inside.length > 0 && (
                    <button
                      type="button"
                      className="editorial-button editorial-button--quiet"
                      onClick={() => setPath([...path, String(row.id)])}
                    >
                      Descend
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </Surface>
  );
}
