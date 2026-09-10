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
import SurfaceMasthead from '../components/SurfaceMasthead';

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
              {/* A row here names something that just changed, and the useful
                  next move is always to go and look at it. `?open=` is the
                  same address the encyclopedia's register uses, so the lens
                  scrolls to the record and focuses it rather than merely
                  being the page it lives on. */}
              {row.lens ? (
                <Link
                  className="editorial-ledger__title"
                  to={`${universeSectionPath(universeId, row.lens as UniverseSection)}`
                    + `?open=${encodeURIComponent(row.id)}`}
                >
                  {row.title || 'Untitled'}
                </Link>
              ) : (
                <span className="editorial-ledger__title">{row.title || 'Untitled'}</span>
              )}
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

  const { project } = data;

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
      <SurfaceMasthead
        title={project.title}
        action={waiting ? (
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
        status={waiting ? 'About a minute.' : ''}
      >
        {failed && <span className="editorial-field__failed" role="alert">{failed}</span>}
      </SurfaceMasthead>

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

        {/* The lens list and the grounding were both here and both said
            somewhere else better: the sidebar already lists every lens with
            its count, and the direction and guardrails are the whole of the
            Direction page. A front door that repeats the nav beside it is
            asking to be read twice and believed once. */}
        <Activity universeId={universeId} />
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
