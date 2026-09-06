import { Link } from 'react-router-dom';
import { useEncyclopedia } from '../useEncyclopedia';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import Surface from '../components/Surface';
import { CountsBar } from '../components/CanonRows';
import LoreNotes from '../components/LoreNotes';
import { editorialApi } from '../api';
import { useAsync } from '../useAsync';
import { universeSectionPath } from '../paths';
import type { UniverseSection } from '../paths';

const LENSES: Array<{ section: UniverseSection; label: string; countKey: string }> = [
  { section: 'characters', label: 'Characters', countKey: 'characters' },
  { section: 'geography', label: 'Geography', countKey: 'locations' },
  { section: 'timeline', label: 'Timeline', countKey: 'timelineEvents' },
  { section: 'societies', label: 'Societies', countKey: 'factions' },
  { section: 'bestiary', label: 'Bestiary', countKey: 'bestiary' },
  { section: 'works', label: 'Works', countKey: 'derivatives' },
];

export default function UniverseDashboard() {
  const { status, data, error, retry, universeId } = useEncyclopedia();
  const profile = useAsync(
    (signal) => editorialApi.getUniverseProfile(universeId, signal), [universeId],
  );

  if (status === 'loading') {
    return <Surface name="universe-dashboard"><LoadingState label="Reading this universe…" /></Surface>;
  }
  if (status === 'error') {
    return (
      <Surface name="universe-dashboard">
        <ErrorState title="Could not load this universe" error={error} onRetry={retry} />
      </Surface>
    );
  }

  const { project, counts, catalog } = data;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <Surface name="universe-dashboard">
      <header className="editorial-universe-header">
        <div className="editorial-universe-header__top">
          <h1 className="editorial-universe-header__title">{project.title}</h1>
        </div>
        {project.description && (
          <p className="editorial-universe-header__direction">{project.description}</p>
        )}
        <CountsBar counts={[
          ['Characters', counts.characters ?? 0],
          ['Places', counts.locations ?? 0],
          ['Factions', counts.factions ?? 0],
          ['Events', counts.timelineEvents ?? 0],
          ['Creatures', counts.bestiary ?? 0],
          ['Works', counts.derivatives ?? 0],
        ]} />
      </header>

      {profile.status === 'ready' && profile.data.notes && (
        <LoreNotes notes={profile.data.notes} />
      )}

      <section className="editorial-band">
        <div className="editorial-section-header">
          <h2 className="editorial-section-title">Lenses</h2>
        </div>
        <div className="editorial-scanning-list">
          {LENSES.map(({ section, label, countKey }) => (
            <div className="editorial-action-row" key={section}>
              <div className="editorial-action-row__detail">
                <Link to={universeSectionPath(universeId, section)}>{label}</Link>
                <span className="editorial-activity-row__time">
                  {(counts[countKey] ?? 0).toLocaleString()} recorded
                </span>
              </div>
              <Link to={universeSectionPath(universeId, section)} aria-label={`Open ${label}`}>Open</Link>
            </div>
          ))}
        </div>
      </section>

      <section className="editorial-band">
        <div className="editorial-section-header">
          <h2 className="editorial-section-title">Recently updated</h2>
          <Link to={universeSectionPath(universeId, 'encyclopedia')}>Encyclopedia</Link>
        </div>
        {total === 0 ? (
          <EmptyState
            title="No canon recorded yet"
            description="This universe has no characters, places, factions or events yet. Anything generated or authored will appear here."
          />
        ) : (
          <div className="editorial-scanning-list">
            {catalog.characters.slice(0, 5).map((row) => (
              <div className="editorial-activity-row" key={String(row.id)}>
                <span className="editorial-activity-row__time">character</span>
                <span className="editorial-activity-row__actor">canon</span>
                <span className="editorial-activity-row__title">{String(row.name ?? '')}</span>
                <Link to={universeSectionPath(universeId, 'characters')}>View</Link>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="editorial-section-header">
          <h2 className="editorial-section-title">Concerns</h2>
        </div>
        <EmptyState
          title="Nothing flagged"
          description="Continuity concerns and repair proposals appear here once the editorial workspace records them."
        />
      </section>
    </Surface>
  );
}
