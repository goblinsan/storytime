import { Link } from 'react-router-dom';
import { editorialApi } from '../api';
import { useAsync } from '../useAsync';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import Surface from '../components/Surface';
import { newUniversePath, universePath, universesPath } from '../paths';
import type { UniverseSummary } from '../types';

const canonTotal = (u: UniverseSummary) =>
  Object.values(u.canonCounts).reduce((a, b) => a + b, 0);

function relativeTime(iso?: string): string {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'never';
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'a month ago' : `${months} months ago`;
}

export default function Dashboard() {
  const { status, data, error, retry } = useAsync(
    (signal) => editorialApi.getGlobalDashboard(signal), [],
  );

  if (status === 'loading') {
    return <Surface name="dashboard"><LoadingState label="Reading the codex…" /></Surface>;
  }
  if (status === 'error') {
    return (
      <Surface name="dashboard">
        <ErrorState title="Could not load the codex" error={error} onRetry={retry} />
      </Surface>
    );
  }

  const { briefing, universes } = data;

  if (universes.length === 0) {
    return (
      <Surface name="dashboard">
      <EmptyState
        title="No universes yet"
        description="A universe is a world and its canon: geography, factions, timeline, bestiary and the continuity that holds them together. Derivative works come later, and they come from here."
      >
        <Link className="editorial-button" to={newUniversePath()}>Create the first universe</Link>
      </EmptyState>
      </Surface>
    );
  }

  const busiest = [...universes].sort((a, b) => canonTotal(b) - canonTotal(a));

  return (
    <Surface name="dashboard">
      <section className="editorial-band editorial-briefing">
        <h1 className="editorial-briefing__headline">{briefing.headline}</h1>
        <p className="editorial-briefing__summary">{briefing.summary}</p>

        <div className="editorial-briefing__metrics">
          <div className="editorial-briefing__metric">
            <div className="editorial-briefing__metric-value">{briefing.totalUniverses}</div>
            <div className="editorial-briefing__metric-label">Universes</div>
          </div>
          <div className="editorial-briefing__metric">
            <div className="editorial-briefing__metric-value">{briefing.totalCanonEntities.toLocaleString()}</div>
            <div className="editorial-briefing__metric-label">Canon entities</div>
          </div>
          <div className="editorial-briefing__metric">
            <div className="editorial-briefing__metric-value">{briefing.totalWorks}</div>
            <div className="editorial-briefing__metric-label">Derivative works</div>
          </div>
          <div className="editorial-briefing__metric">
            <div className="editorial-briefing__metric-value">{briefing.openConcernsCount}</div>
            <div className="editorial-briefing__metric-label">Open concerns</div>
          </div>
        </div>
      </section>

      <section className="editorial-band">
        <div className="editorial-section-header">
          <h2 className="editorial-section-title">Universes</h2>
          <Link to={universesPath()}>See all</Link>
        </div>

        <div className="editorial-scanning-list">
          {busiest.slice(0, 8).map((universe) => (
            <div className="editorial-action-row" key={universe.id}>
              <div className="editorial-action-row__detail">
                <Link to={universePath(universe.id)}>{universe.title}</Link>
                <span className="editorial-activity-row__time">
                  {canonTotal(universe).toLocaleString()} canon entities
                  {universe.worksCount > 0 && ` · ${universe.worksCount} ${universe.worksCount === 1 ? 'work' : 'works'}`}
                  {` · active ${relativeTime(universe.lastActiveAt)}`}
                </span>
              </div>
              <Link to={universePath(universe.id)} aria-label={`Open ${universe.title}`}>Open</Link>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="editorial-section-header">
          <h2 className="editorial-section-title">Concerns</h2>
        </div>
        <EmptyState
          title="Nothing flagged"
          description="Continuity concerns and repair proposals appear here once the editorial workspace records them. Nothing is being hidden — there is nothing recorded yet."
        />
      </section>
    </Surface>
  );
}
