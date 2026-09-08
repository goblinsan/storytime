import { Link } from 'react-router-dom';
import { editorialApi } from '../api';
import { useAsync } from '../useAsync';
import { useEncyclopedia } from '../useEncyclopedia';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import Surface from '../components/Surface';
import { CountsBar } from '../components/CanonRows';
import { universeSectionPath } from '../paths';
import type { UniverseSection } from '../paths';
import { ProposedChanges } from '../components/ProposedChanges';

const LENSES: Array<{ section: UniverseSection; label: string; countKey: string }> = [
  { section: 'characters', label: 'Characters', countKey: 'characters' },
  { section: 'geography', label: 'Geography', countKey: 'locations' },
  { section: 'timeline', label: 'Timeline', countKey: 'timelineEvents' },
  { section: 'societies', label: 'Societies', countKey: 'factions' },
  { section: 'bestiary', label: 'Bestiary', countKey: 'bestiary' },
  { section: 'works', label: 'Works', countKey: 'derivatives' },
];

/**
 * What this universe is, and the rules whoever writes next is held to.
 *
 * The overview used to be counts and links: how many characters, where to go
 * next. That is a table of contents, not a grounding -- somebody opening a
 * universe they have not touched in a month, or an agent about to write into
 * it, needs to read what the place IS before they need to know it has eleven
 * factions. The standing direction and the guardrails already existed; they
 * were only ever visible on the form that edits them, which is the one place
 * you go when you already know what they say.
 */
function Grounding({ universeId }: { universeId: string }) {
  const direction = useAsync((signal) => editorialApi.getDirection(universeId, signal), [universeId]);
  if (direction.status !== 'ready') return null;

  const { persistentGoal, temporaryFocus, guardrails } = direction.data;
  const empty = !persistentGoal.trim() && !temporaryFocus.trim() && guardrails.length === 0;

  return (
    <section className="editorial-band">
      <div className="editorial-section-header">
        <h2 className="editorial-section-title">Grounding</h2>
        <Link to={universeSectionPath(universeId, 'direction')}>Direction</Link>
      </div>
      {empty ? (
        <EmptyState
          title="Nothing standing yet"
          description="The direction says what this universe is always working toward, and the guardrails are what anything writing into it may not do. Both are read by agents before they draft."
        />
      ) : (
        <dl className="editorial-grounding">
          {persistentGoal.trim() && (
            <div className="editorial-grounding__item">
              <dt>Standing direction</dt>
              <dd>{persistentGoal}</dd>
            </div>
          )}
          {temporaryFocus.trim() && (
            <div className="editorial-grounding__item">
              <dt>Current focus</dt>
              <dd>{temporaryFocus}</dd>
            </div>
          )}
          {guardrails.length > 0 && (
            <div className="editorial-grounding__item">
              <dt>Guardrails</dt>
              <dd>
                <ul className="editorial-grounding__rules">
                  {guardrails.map((rule) => <li key={rule}>{rule}</li>)}
                </ul>
              </dd>
            </div>
          )}
        </dl>
      )}
    </section>
  );
}

export default function UniverseDashboard() {
  const { status, data, error, retry, universeId } = useEncyclopedia();

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

      <Grounding universeId={universeId} />

      <ProposedChanges universeId={universeId} />

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
