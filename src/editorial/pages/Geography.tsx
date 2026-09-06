import { useMemo } from 'react';
import { useEncyclopedia } from '../useEncyclopedia';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import Surface from '../components/Surface';
import { CanonRowItem, ProtectedBadge } from '../components/CanonRows';
import { isProtected, text } from '../canonFields';
import type { CanonRow } from '../api';

const regionOf = (row: CanonRow) =>
  text(row, 'regionType', 'region_type') || 'unclassified';

export default function Geography() {
  const { status, data, error, retry } = useEncyclopedia();

  /** Grouped by region type: the hierarchy the locations table actually records. */
  const regions = useMemo(() => {
    const rows = data?.catalog.locations ?? [];
    const byRegion = new Map<string, CanonRow[]>();
    for (const row of rows) {
      const key = regionOf(row);
      if (!byRegion.has(key)) byRegion.set(key, []);
      byRegion.get(key)!.push(row);
    }
    return [...byRegion.entries()].sort((a, b) => b[1].length - a[1].length);
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

  if (regions.length === 0) {
    return (
      <Surface name="geography">
        <EmptyState
          title="No places yet"
          description="Regions, settlements and sites recorded for this universe will appear here, grouped by region type."
        />
      </Surface>
    );
  }

  return (
    <Surface name="geography">
      <div className="editorial-section-header">
        <h1 className="editorial-section-title">Geography</h1>
      </div>

      {regions.map(([region, rows]) => (
        <section className="editorial-band" key={region}>
          <div className="editorial-section-header">
            <h2 className="editorial-section-title">
              {region} <span className="editorial-activity-row__time">{rows.length}</span>
            </h2>
          </div>
          <div className="editorial-scanning-list">
            {rows.map((row) => {
              const x = row.coordinatesX ?? row.coordinates_x;
              const y = row.coordinatesY ?? row.coordinates_y;
              const placed = typeof x === 'number' && typeof y === 'number';
              return (
                <CanonRowItem
                  key={String(row.id)}
                  title={text(row, 'name') || 'Unnamed place'}
                  detail={text(row, 'description').slice(0, 200)}
                  badge={<ProtectedBadge on={isProtected(row)} />}
                  meta={[
                    placed ? `mapped at ${x}, ${y}` : 'not yet placed on the map',
                    text(row, 'politicalNotes', 'political_notes')
                      ? `control: ${text(row, 'politicalNotes', 'political_notes').slice(0, 90)}`
                      : null,
                  ].filter(Boolean).join(' · ')}
                />
              );
            })}
          </div>
        </section>
      ))}
    </Surface>
  );
}
