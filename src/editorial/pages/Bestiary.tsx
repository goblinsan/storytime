import { useMemo } from 'react';
import { useEncyclopedia } from '../useEncyclopedia';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import Surface from '../components/Surface';
import { CanonRowItem, ProtectedBadge } from '../components/CanonRows';
import { useOpenTarget } from '../useOpenTarget';
import { isProtected, text } from '../canonFields';
import type { CanonRow } from '../api';
import SurfaceMasthead from '../components/SurfaceMasthead';

const nicheOf = (row: CanonRow) =>
  text(row, 'ecologicalNiche', 'ecological_niche') || text(row, 'category') || 'unclassified';

export default function Bestiary() {
  const { status, data, error, retry } = useEncyclopedia();
  const { isOpen } = useOpenTarget();

  /** Grouped by ecological niche: the bestiary is an ecology, not a monster list. */
  const niches = useMemo(() => {
    const rows = data?.catalog.bestiary ?? [];
    const grouped = new Map<string, CanonRow[]>();
    for (const row of rows) {
      const key = nicheOf(row);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(row);
    }
    return [...grouped.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [data]);

  if (status === 'loading') {
    return <Surface name="bestiary"><LoadingState label="Reading the bestiary…" /></Surface>;
  }
  if (status === 'error') {
    return (
      <Surface name="bestiary">
        <ErrorState title="Could not load the bestiary" error={error} onRetry={retry} />
      </Surface>
    );
  }

  if (niches.length === 0) {
    return (
      <Surface name="bestiary">
        <EmptyState
          title="No creatures yet"
          description="Creatures recorded for this universe will appear here, grouped by ecological niche."
        />
      </Surface>
    );
  }

  return (
    <Surface name="bestiary">
      <SurfaceMasthead title={text(data.project as CanonRow, 'title') || 'Bestiary'} />

      {niches.map(([niche, rows]) => (
        <section className="editorial-band editorial-ecological-niche" key={niche}>
          <div className="editorial-section-header">
            <h2 className="editorial-section-title">
              {niche} <span className="editorial-activity-row__time">{rows.length}</span>
            </h2>
          </div>
          <div className="editorial-scanning-list">
            {rows.map((row) => (
              <CanonRowItem
                key={String(row.id)}
                open={isOpen(String(row.id))}
                title={text(row, 'name') || 'Unnamed creature'}
                detail={text(row, 'description').slice(0, 200)}
                badge={<ProtectedBadge on={isProtected(row)} />}
                meta={[
                  text(row, 'status') ? `threat: ${text(row, 'status')}` : null,
                  text(row, 'tactics') ? `tactics: ${text(row, 'tactics').slice(0, 80)}` : null,
                  row.isSharedVariant === true ? 'adopted from shared canon' : null,
                ].filter(Boolean).join(' · ') || undefined}
              />
            ))}
          </div>
        </section>
      ))}
    </Surface>
  );
}
