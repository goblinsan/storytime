import { useEncyclopedia } from '../useEncyclopedia';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import Surface from '../components/Surface';
import { CanonRowItem, ProtectedBadge } from '../components/CanonRows';
import { useOpenTarget } from '../useOpenTarget';
import { isProtected, text } from '../canonFields';
import SurfaceMasthead from '../components/SurfaceMasthead';
import type { CanonRow } from '../api';

export default function Societies() {
  const { status, data, error, retry } = useEncyclopedia();
  const { isOpen } = useOpenTarget();

  if (status === 'loading') {
    return <Surface name="societies"><LoadingState label="Reading the societies…" /></Surface>;
  }
  if (status === 'error') {
    return (
      <Surface name="societies">
        <ErrorState title="Could not load societies" error={error} onRetry={retry} />
      </Surface>
    );
  }

  const { factions, religions, languages } = data.catalog;
  const total = factions.length + religions.length + languages.length;

  if (total === 0) {
    return (
      <Surface name="societies">
        <EmptyState
          title="No societies yet"
          description="Factions, faiths and languages recorded for this universe will appear here."
        />
      </Surface>
    );
  }

  return (
    <Surface name="societies">
      <SurfaceMasthead title={text(data.project as CanonRow, 'title') || 'Societies'} />

      {factions.length > 0 && (
        <section className="editorial-band">
          <div className="editorial-section-header">
            <h2 className="editorial-section-title">
              Factions <span className="editorial-activity-row__time">{factions.length}</span>
            </h2>
          </div>
          <div className="editorial-scanning-list">
            {factions.map((row) => (
              <CanonRowItem
                key={String(row.id)}
                open={isOpen(String(row.id))}
                title={text(row, 'name') || 'Unnamed faction'}
                detail={text(row, 'description').slice(0, 200)}
                badge={<ProtectedBadge on={isProtected(row)} />}
                meta={[
                  text(row, 'goals') ? `goals: ${text(row, 'goals').slice(0, 90)}` : null,
                  text(row, 'economicLeverage', 'economic_leverage')
                    ? `leverage: ${text(row, 'economicLeverage', 'economic_leverage').slice(0, 70)}`
                    : null,
                  text(row, 'doctrine') ? `doctrine: ${text(row, 'doctrine').slice(0, 70)}` : null,
                ].filter(Boolean).join(' · ') || undefined}
              />
            ))}
          </div>
        </section>
      )}

      {religions.length > 0 && (
        <section className="editorial-band">
          <div className="editorial-section-header">
            <h2 className="editorial-section-title">
              Faith and doctrine <span className="editorial-activity-row__time">{religions.length}</span>
            </h2>
          </div>
          <div className="editorial-scanning-list">
            {religions.map((row) => (
              <CanonRowItem
                key={String(row.id)}
                open={isOpen(String(row.id))}
                title={text(row, 'name') || 'Unnamed religion'}
                detail={text(row, 'beliefs').slice(0, 220)}
                meta={text(row, 'deities') ? `deities: ${text(row, 'deities').slice(0, 120)}` : undefined}
              />
            ))}
          </div>
        </section>
      )}

      {languages.length > 0 && (
        <section className="editorial-band">
          <div className="editorial-section-header">
            <h2 className="editorial-section-title">
              Languages <span className="editorial-activity-row__time">{languages.length}</span>
            </h2>
          </div>
          <div className="editorial-scanning-list">
            {languages.map((row) => (
              <CanonRowItem
                key={String(row.id)}
                open={isOpen(String(row.id))}
                title={text(row, 'name') || 'Unnamed language'}
                detail={text(row, 'grammar').slice(0, 200)}
              />
            ))}
          </div>
        </section>
      )}
    </Surface>
  );
}
