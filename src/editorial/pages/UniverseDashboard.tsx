import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { editorialApi, type ActivityRow, type CanonRequest, type SurveyFinding } from '../api';
import { useAsync, useRefreshWhile } from '../useAsync';
import { useEncyclopedia } from '../useEncyclopedia';
import { ErrorState, LoadingState } from '../components/StateViews';
import Surface from '../components/Surface';
import { universeSectionPath } from '../paths';
import type { UniverseSection } from '../paths';
import { ProposedChanges } from '../components/ProposedChanges';

/**
 * The front door to a universe.
 *
 * It is opened at the start of a working session and its job is to be left:
 * say what this universe is, what moved, what is waiting on a decision, and
 * get out of the way. The order is by actionability rather than by importance,
 * because the question somebody arrives with is "what was I doing", not "what
 * is this place".
 *
 * It was a single column of prose, then briefly two columns of prose, which was
 * worse. The reading measure meant half a wide window sat empty, and filling
 * that with more body copy only doubled how much undifferentiated text was on
 * screen at once. What belongs beside a reading column is not more reading.
 */

const LENSES: Array<{ section: UniverseSection; label: string; countKey: string }> = [
  { section: 'characters', label: 'Characters', countKey: 'characters' },
  { section: 'geography', label: 'Geography', countKey: 'locations' },
  { section: 'timeline', label: 'Timeline', countKey: 'timelineEvents' },
  { section: 'societies', label: 'Societies', countKey: 'factions' },
  { section: 'bestiary', label: 'Bestiary', countKey: 'bestiary' },
  { section: 'works', label: 'Works', countKey: 'derivatives' },
];

/** How long ago, in the coarsest unit that is still true. */
function since(iso: string): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return '';
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

/**
 * The premise, at the length a front door can afford.
 *
 * It ran to 383px of body copy as the first thing on the page: a reading task
 * where an identification was wanted. Two lines answer "which universe is this"
 * and the rest is one click away, for the times you do want to read it again.
 */
function Standfirst({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [clamped, setClamped] = useState(false);
  const para = useRef<HTMLParagraphElement>(null);

  // Whether there is in fact any more. A one-line premise was still given a
  // "More" control that revealed nothing when clicked -- and measuring only on
  // mount meant the answer went stale the moment the window changed size, since
  // the clamp itself only applies below 1100px.
  useEffect(() => {
    const el = para.current;
    if (!el) return undefined;

    const measure = () => {
      // `scrollHeight > clientHeight` does not detect a line clamp: unlike a
      // max-height, `-webkit-line-clamp` reports no overflow, so the two were
      // equal and the control never appeared on the one width that needs it.
      // Lift the clamp, read the real height, put it back.
      if (getComputedStyle(el).webkitLineClamp === 'none') {
        setClamped(false);
        return;
      }
      const held = el.style.webkitLineClamp;
      el.style.webkitLineClamp = 'unset';
      const whole = el.scrollHeight;
      el.style.webkitLineClamp = held;
      setClamped(whole > el.clientHeight + 1);
    };

    measure();
    // The clamp only applies below 1100px, so the answer changes with the
    // window and not only with the text.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text]);

  if (!text.trim()) return null;

  return (
    <div className="editorial-standfirst">
      <p
        className="editorial-standfirst__text"
        data-open={open ? 'true' : undefined}
        ref={para}
      >
        {text}
      </p>
      {(clamped || open) && (
        <button type="button" className="editorial-link" onClick={() => setOpen(!open)}>
          {open ? 'Less' : 'More'}
        </button>
      )}
    </div>
  );
}

/**
 * What this universe is for, and the rules whoever writes next is held to.
 *
 * All three already existed and were visible only on the form that edits them,
 * which is where you go once you already know what they say.
 */
function Grounding({ universeId }: { universeId: string }) {
  const [showAll, setShowAll] = useState(false);
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
      {/* Empty, it shows the three fields it is asking for rather than one
          paragraph about them. A 55ch note inside a full-width band always
          reads as content shoved to the left, and this way the empty state has
          the same shape as the filled one and says what each field is for. */}
      {empty && (
        <dl className="editorial-grounding">
          <div className="editorial-grounding__item">
            <dt>Standing direction</dt>
            <dd className="editorial-grounding__absent">
              Not set. What this universe is always working toward.
            </dd>
          </div>
          <div className="editorial-grounding__item">
            <dt>Current focus</dt>
            <dd className="editorial-grounding__absent">
              Not set. What matters right now, changed often.
            </dd>
          </div>
          <div className="editorial-grounding__item">
            <dt>Guardrails</dt>
            <dd className="editorial-grounding__absent">
              None. What anything writing into this universe may not do. Agents are held to these
              before they draft.
            </dd>
          </div>
        </dl>
      )}
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
                {(showAll ? guardrails : guardrails.slice(0, 2)).map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
              {guardrails.length > 2 && (
                <button type="button" className="editorial-link" onClick={() => setShowAll(!showAll)}>
                  {showAll ? 'Fewer' : `All ${guardrails.length}`}
                </button>
              )}
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}

/**
 * What moved, newest first.
 *
 * This claimed to be "recently updated" and listed only characters, in catalog
 * order, with no dates, because places, factions and events carried no
 * timestamps until migration 024. Records written before that cannot be placed
 * in time, and the number of them is shown rather than hidden: a feed that
 * silently covers part of a universe is worse than one that says which part.
 */
function Activity({ universeId }: { universeId: string }) {
  const activity = useAsync((signal) => editorialApi.getActivity(universeId, signal), [universeId]);
  if (activity.status !== 'ready') return null;
  const { rows, undated, dated } = activity.data;

  return (
    <section className="editorial-band">
      <div className="editorial-section-header">
        <h2 className="editorial-section-title">What moved</h2>
        <Link to={universeSectionPath(universeId, 'encyclopedia')}>Encyclopedia</Link>
      </div>
      {rows.length === 0 ? (
        <p className="editorial-ledger__note">
          Nothing has been written or changed since this universe started keeping time.
        </p>
      ) : (
        <ul className="editorial-ledger">
          {rows.map((row: ActivityRow) => (
            <li className="editorial-ledger__row" key={`${row.kind}-${row.id}`}>
              <span className="editorial-ledger__kind">{row.kind}</span>
              <span className="editorial-ledger__title">{row.title || 'Untitled'}</span>
              <span className="editorial-ledger__when">{since(row.at)}</span>
            </li>
          ))}
        </ul>
      )}
      {/* Both truths in one place, under the list they are about. The count of
          dated records used to sit in the section header as "All 24", which
          read as belonging to whatever section came next on the row and never
          said what the number counted. */}
      {(dated > rows.length || undated > 0) && (
        <p className="editorial-ledger__note">
          {dated > rows.length && `Showing the ${rows.length} most recent of ${dated} dated records. `}
          {undated > 0 && `${undated} older ${undated === 1 ? 'record has' : 'records have'} `
            + 'no date recorded, so they cannot be placed here; they appear once something '
            + 'touches them.'}
        </p>
      )}
    </section>
  );
}

/**
 * Everything in this universe, and the way in.
 *
 * One list rather than two. There used to be a row of six large numbers under
 * the title and the same six numbers again a page below attached to links, so
 * the loudest type on the page was a duplicate, and on a thin universe it was
 * four zeros set in 24px bold. A number is more useful beside the door it opens.
 */
function Index({ universeId, counts }: { universeId: string; counts: Record<string, number> }) {
  return (
    <section className="editorial-band">
      <div className="editorial-section-header">
        <h2 className="editorial-section-title">In this universe</h2>
      </div>
      <ul className="editorial-index">
        {LENSES.map(({ section, label, countKey }) => (
          <li className="editorial-index__row" key={section}>
            <Link className="editorial-index__link" to={universeSectionPath(universeId, section)}>
              {label}
            </Link>
            <span className="editorial-index__count">{(counts[countKey] ?? 0).toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * A survey, read once and thrown away.
 *
 * It is asked for, so it does not sit on the page waiting to be wanted: it
 * arrives over the page and leaves. That is the case a dialog is actually right
 * for -- a transient thing somebody just requested, which would otherwise hold
 * permanent room for something that is empty most of the time.
 *
 * Findings are struck off one at a time and that progress is written back to
 * the draft, because the realistic use is doing one on Saturday and coming back
 * on Tuesday. Throwing it away records `rejected`, never `accepted`: nothing
 * here was written into canon, and filing it as accepted would pollute every
 * query over accepted drafts.
 */
function SurveyDialog({
  request, universeId, onProgress, onClose, onDiscard,
}: {
  request: CanonRequest;
  universeId: string;
  onProgress: (done: string[]) => void;
  onClose: () => void;
  onDiscard: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Where focus was, so it can go back there. Landing on <body> after close
    // returns a keyboard user to the top of the document.
    const opener = document.activeElement as HTMLElement | null;
    heading.current?.focus();

    // On the document, not the dialog: handled on the overlay it stopped
    // working the moment focus left the sheet, which was also the moment there
    // was no other way out.
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };

    // Keep Tab inside. Without this the page behind stays reachable, which
    // makes `aria-modal` a claim that is not true: a screen reader is told the
    // background is inert while a keyboard walks straight into it.
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !sheet.current) return;
      const focusable = sheet.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === heading.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      } else if (!sheet.current.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', escape);
    document.addEventListener('keydown', trap);
    return () => {
      document.removeEventListener('keydown', escape);
      document.removeEventListener('keydown', trap);
      opener?.focus?.();
    };
  }, [onClose]);

  const proposed = request.payload.proposed as { state?: string; findings?: SurveyFinding[] };
  const findings = proposed?.findings ?? [];
  const done: string[] = Array.isArray(request.payload.done) ? request.payload.done as string[] : [];

  return (
    <div
      className="editorial-overlay"
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="editorial-overlay__sheet" ref={sheet} role="dialog" aria-modal="true" aria-labelledby="survey-heading">
        <div className="editorial-section-header">
          <h2 className="editorial-section-title" id="survey-heading" ref={heading} tabIndex={-1}>
            Where this needs work
          </h2>
          <button type="button" className="editorial-link" onClick={onClose}>Close</button>
        </div>

        {proposed?.state && <p className="editorial-survey__state">{proposed.state}</p>}

        <ol className="editorial-survey__list">
          {findings.map((finding) => {
            const struck = done.includes(finding.title);
            return (
              <li
                className="editorial-survey__finding"
                key={finding.title}
                data-done={struck ? 'true' : undefined}
              >
                <h3 className="editorial-survey__title">{finding.title}</h3>
                <p className="editorial-survey__detail">{finding.detail}</p>
                <div className="editorial-survey__actions">
                  {finding.where && (
                    <Link to={universeSectionPath(universeId, finding.where as UniverseSection)}>
                      Open {finding.where}
                    </Link>
                  )}
                  <button
                    type="button"
                    className="editorial-link"
                    onClick={() => onProgress(struck
                      ? done.filter((t) => t !== finding.title)
                      : [...done, finding.title])}
                  >
                    {struck ? 'Not done after all' : 'Done'}
                  </button>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="editorial-field__actions">
          <button type="button" className="editorial-button editorial-button--secondary" onClick={onDiscard}>
            Throw this away
          </button>
        </div>
      </div>
    </div>
  );
}

export default function UniverseDashboard() {
  const { status, data, error, retry, universeId } = useEncyclopedia();
  const surveys = useAsync((signal) => editorialApi.listSurveys(universeId, signal), [universeId]);
  const [asking, setAsking] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  const rows: CanonRequest[] = surveys.status === 'ready' ? surveys.data : [];
  const ready = rows.find((r) => r.payload?.proposed);
  const waiting = rows.some((r) => !r.payload?.proposed);
  useRefreshWhile(waiting, surveys.retry);

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

  const { project, counts } = data;

  const ask = async () => {
    setAsking(true);
    setFailed(null);
    try {
      await editorialApi.askForSurvey(universeId);
      surveys.retry();
    } catch (e) {
      setFailed(`Not asked: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setAsking(false); }
  };

  const progress = async (row: CanonRequest, done: string[]) => {
    try {
      await editorialApi.markSurveyProgress(row, done);
      surveys.retry();
    } catch (e) {
      setFailed(`Not saved: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const discard = async (row: CanonRequest) => {
    setReading(false);
    try {
      await editorialApi.resolveCanonRequest(row.id, 'rejected');
      surveys.retry();
    } catch (e) {
      setFailed(`Not thrown away: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <Surface name="universe-dashboard">
      <header className="editorial-masthead">
        <div className="editorial-masthead__line">
          <h1 className="editorial-masthead__title">{project.title}</h1>
          {waiting ? (
            // Kept mounted and disabled rather than swapped out, so focus does
            // not fall to the body mid-wait, and so it can say what it costs.
            <button type="button" className="editorial-button editorial-button--secondary" disabled>
              Reading the universe…
            </button>
          ) : ready ? (
            <button
              type="button"
              className="editorial-button editorial-button--secondary"
              onClick={() => setReading(true)}
            >
              Read the survey
            </button>
          ) : (
            <button
              type="button"
              className="editorial-button editorial-button--secondary"
              disabled={asking}
              onClick={ask}
            >
              {asking ? 'Asking…' : 'Collaborate'}
            </button>
          )}
        </div>

        <p className="editorial-masthead__status" role="status">
          {waiting ? 'About a minute.' : ''}
        </p>
        {failed && <span className="editorial-field__failed" role="alert">{failed}</span>}
      </header>

      <ProposedChanges universeId={universeId} />

      {/* Two columns, paired by what they are rather than by length. The
          premise and the standing direction are both "what this universe is",
          and the ledger and the index are both lists you scan. Each column
          keeps its own measure, so this is not the two-columns-of-prose that
          failed before -- it is a reading column beside a scanning one, twice. */}
      <div className="editorial-overview">
        {/* The premise takes the whole width. Nothing sits beside it. */}
        <div className="editorial-overview__premise">
          <Standfirst text={project.description ?? ''} />
        </div>

        <div className="editorial-pair">
          <Activity universeId={universeId} />
          <Index universeId={universeId} counts={counts} />
        </div>

        <Grounding universeId={universeId} />
      </div>


      {reading && ready && (
        <SurveyDialog
          request={ready}
          universeId={universeId}
          onProgress={(done) => progress(ready, done)}
          onClose={() => setReading(false)}
          onDiscard={() => discard(ready)}
        />
      )}
    </Surface>
  );
}
