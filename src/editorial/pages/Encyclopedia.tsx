import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { editorialApi, type CanonRow, type IndexRow } from '../api';
import { useAsync } from '../useAsync';
import { useEncyclopedia } from '../useEncyclopedia';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import Surface from '../components/Surface';
import { CANON_FIELDS, gapsIn, text } from '../canonFields';
import { universeSectionPath } from '../paths';
import type { UniverseSection } from '../paths';

/**
 * The front matter of one universe.
 *
 * It used to be the lenses with their organising ideas removed. Every lens
 * loads the same payload from the same hook and then applies one idea --
 * geography sorts by depth, the bestiary groups by niche, the timeline runs by
 * date -- and this page applied none, rendering the raw category buckets in the
 * order the categories happen to be declared. Ninety-three rows resolved to
 * five destinations, so clicking a name took you to the lens holding all
 * sixty-six of them.
 *
 * It has three jobs that are its own:
 *
 *   The canon with no lens. Technologies, signals and arcs appear nowhere else
 *   in the app -- Search routes those types back here -- and they were the five
 *   rows on the page with no links at all, below ninety-three that duplicated
 *   other surfaces.
 *
 *   A register. Everything, newest change first, where a row opens the record
 *   rather than the lens it lives in.
 *
 *   What is unfinished, across the whole catalogue, which is a question no lens
 *   can answer because each one sees a single kind.
 *
 * Finding text is not one of them. Search is cross-universe, addressable and
 * returns its own snippets; this page reimplemented a worse version of it in
 * two browser controls.
 */

const KIND_LABEL: Record<string, string> = {
  character: 'Characters',
  place: 'Places',
  faction: 'Factions',
  event: 'Events',
  creature: 'Creatures',
  technology: 'Technologies',
  signal: 'Signals',
  arc: 'Arcs',
};

/** The kinds nothing else in the app shows. */
const UNFILED = new Set(['technology', 'signal', 'arc']);

/** How long ago, in the coarsest unit that is still true. */
function since(iso: string | null): string {
  if (!iso) return '';
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
 * One entry in the register.
 *
 * The detail was cut at 180 characters in JavaScript, which produced no
 * ellipsis because the string simply stopped -- "Her healing s" -- and set one
 * line to a 200-character measure at the smallest type in the system. It is
 * clamped in CSS now, at a measure, and the width goes to columns instead.
 */
function Entry({ row, universeId }: { row: IndexRow; universeId: string }) {
  const to = row.lens
    ? `${universeSectionPath(universeId, row.lens as UniverseSection)}?open=${encodeURIComponent(row.id)}`
    : null;

  return (
    <li className="editorial-register__row">
      <span className="editorial-register__kind">{row.kind}</span>
      <span className="editorial-register__body">
        <span className="editorial-register__name">
          {to ? <Link to={to}>{row.title || 'Untitled'}</Link> : (row.title || 'Untitled')}
          {row.isProtected && (
            <span className="editorial-register__flag" title="Protected from automated changes">
              protected
            </span>
          )}
        </span>
        {row.detail && <span className="editorial-register__detail">{row.detail}</span>}
      </span>
      <span className="editorial-register__when">{since(row.at)}</span>
    </li>
  );
}

/**
 * What the canon is missing, across every character at once.
 *
 * No lens can answer this: each sees one kind, and a gap is only visible when
 * you count the same field across all of them. `gapsIn` already knew how; it
 * had only ever been asked about one record at a time.
 */
function Gaps({ universeId }: { universeId: string }) {
  const cast = useAsync((signal) => editorialApi.listCharacters(universeId, signal), [universeId]);
  const [asking, setAsking] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);

  const missing = useMemo(() => {
    const rows: CanonRow[] = cast.data ?? [];
    if (!rows.length) return [];
    const counts = new Map<string, { label: string; who: CanonRow[] }>();
    for (const row of rows) {
      for (const spec of gapsIn(row)) {
        if (!counts.has(spec.key)) counts.set(spec.key, { label: spec.label, who: [] });
        counts.get(spec.key)!.who.push(row);
      }
    }
    return [...counts.entries()]
      .map(([key, v]) => ({ key, label: v.label, who: v.who }))
      .sort((a, b) => b.who.length - a.who.length);
  }, [cast.data]);

  if (cast.status !== 'ready') return null;

  const ask = async (key: string, who: CanonRow[]) => {
    setAsking(key);
    setSaid(null);
    try {
      // One request per record, which is what the queue is shaped for. Capped,
      // because this is the one control on the page that can start sixty-six
      // agent runs with a single click.
      const batch = who.slice(0, 10);
      for (const row of batch) {
        await editorialApi.askForCanon(universeId, String(row.id), [key]);
      }
      setSaid(`Asked for ${CANON_FIELDS.find((f) => f.key === key)?.label ?? key} on `
        + `${batch.length} of ${who.length}. They arrive in the drafts queue.`);
    } catch (e) {
      setSaid(`Not asked: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setAsking(null); }
  };

  return (
    <section className="editorial-band">
      <div className="editorial-section-header">
        <h2 className="editorial-section-title">What is unfinished</h2>
      </div>

      {missing.length === 0 ? (
        <p className="editorial-register__note">Every character has every field written.</p>
      ) : (
        <ul className="editorial-gaps">
          {missing.map((gap) => (
            <li className="editorial-gaps__row" key={gap.key}>
              <span className="editorial-gaps__count">{gap.who.length}</span>
              <span className="editorial-gaps__what">
                {`${gap.who.length === 1 ? 'record has' : 'records have'} no ${gap.label.toLowerCase()}`}
              </span>
              <button
                type="button"
                className="editorial-link"
                disabled={asking !== null}
                onClick={() => ask(gap.key, gap.who)}
              >
                {asking === gap.key ? 'Asking…' : 'Collaborate'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {said && <p className="editorial-register__note" role="status">{said}</p>}
    </section>
  );
}

export default function Encyclopedia() {
  const { status, data, error, retry, universeId } = useEncyclopedia();
  const index = useAsync((signal) => editorialApi.getIndex(universeId, signal), [universeId]);
  const [kind, setKind] = useState<string | null>(null);

  if (status === 'loading' || index.status === 'loading') {
    return <Surface name="encyclopedia"><LoadingState label="Reading the register…" /></Surface>;
  }
  if (status === 'error') {
    return (
      <Surface name="encyclopedia">
        <ErrorState title="Could not load the encyclopedia" error={error} onRetry={retry} />
      </Surface>
    );
  }
  if (index.status === 'error') {
    return (
      <Surface name="encyclopedia">
        <ErrorState title="Could not read the register" error={index.error} onRetry={index.retry} />
      </Surface>
    );
  }

  const { dated, undated } = index.data;
  const everything = [...dated, ...undated];
  const unfiled = everything.filter((r) => UNFILED.has(r.kind));

  // Only the kinds this universe actually holds. Offering a category that is
  // empty is how the old page told an author with a hundred and twenty-four
  // records that their universe held nothing.
  const present = [...new Set(everything.map((r) => r.kind))]
    .sort((a, b) => (KIND_LABEL[a] ?? a).localeCompare(KIND_LABEL[b] ?? b));
  const countOf = (k: string) => everything.filter((r) => r.kind === k).length;

  const shown = kind ? dated.filter((r) => r.kind === kind) : dated;
  const shownUndated = kind ? undated.filter((r) => r.kind === kind) : undated;

  return (
    <Surface name="encyclopedia">
      <header className="editorial-masthead">
        <div className="editorial-masthead__line">
          <h1 className="editorial-masthead__title">{text(data.project as CanonRow, 'title') || 'Encyclopedia'}</h1>
          <Link className="editorial-link" to={`/editorial/search?q=&universe=${encodeURIComponent(universeId)}`}>
            Search everything
          </Link>
        </div>
        <p className="editorial-register__standfirst">
          {`Everything recorded in this universe: ${everything.length} entries, most recently changed first. `}
          {'A row opens the record itself, in whichever lens keeps it.'}
        </p>
      </header>

      {unfiled.length > 0 && (
        <section className="editorial-band">
          <div className="editorial-section-header">
            <h2 className="editorial-section-title">Kept only here</h2>
          </div>
          <p className="editorial-register__note">
            Technologies, signals and arcs have no lens of their own. This is the only surface that
            shows them.
          </p>
          <ul className="editorial-register">
            {unfiled.map((row) => <Entry key={`${row.kind}-${row.id}`} row={row} universeId={universeId} />)}
          </ul>
        </section>
      )}

      <section className="editorial-band">
        <div className="editorial-section-header">
          <h2 className="editorial-section-title">The register</h2>
          <div className="editorial-picker editorial-picker--set" role="group" aria-label="Show one kind">
            <button
              type="button"
              className="editorial-link editorial-groupby"
              data-on={kind === null ? 'true' : undefined}
              aria-pressed={kind === null}
              onClick={() => setKind(null)}
            >
              Everything
              <span className="editorial-groupby__count">{everything.length}</span>
            </button>
            {present.map((k) => (
              <button
                type="button"
                className="editorial-link editorial-groupby"
                key={k}
                data-on={kind === k ? 'true' : undefined}
                aria-pressed={kind === k}
                onClick={() => setKind(kind === k ? null : k)}
              >
                {KIND_LABEL[k] ?? k}
                <span className="editorial-groupby__count">{countOf(k)}</span>
              </button>
            ))}
          </div>
        </div>

        <p className="editorial-register__note" role="status">
          {`Showing ${shown.length + shownUndated.length} of ${everything.length}.`}
        </p>

        {shown.length === 0 && shownUndated.length === 0 ? (
          <EmptyState
            title={kind ? `No ${(KIND_LABEL[kind] ?? kind).toLowerCase()} recorded` : 'Nothing recorded yet'}
            description={kind
              ? 'This universe holds none of these. Everything it does hold is under the other kinds above.'
              : 'Anything written or generated for this universe will appear here.'}
          />
        ) : (
          <ul className="editorial-register">
            {shown.map((row) => <Entry key={`${row.kind}-${row.id}`} row={row} universeId={universeId} />)}
          </ul>
        )}

        {shownUndated.length > 0 && (
          <>
            <p className="editorial-register__note">
              {`${shownUndated.length} older ${shownUndated.length === 1 ? 'record' : 'records'} `
                + 'have no date recorded, so they cannot be placed in the order above.'}
            </p>
            <ul className="editorial-register">
              {shownUndated.map((row) => (
                <Entry key={`${row.kind}-${row.id}`} row={row} universeId={universeId} />
              ))}
            </ul>
          </>
        )}
      </section>

      <Gaps universeId={universeId} />
    </Surface>
  );
}
