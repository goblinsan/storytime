import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { editorialApi, type CanonRow, type Lineage, type LineageMember, type MediaAsset } from '../api';
import { useAsync } from '../useAsync';
import { ErrorState, LoadingState } from '../components/StateViews';
import Surface from '../components/Surface';
import { isProtected, text } from '../canonFields';

type Tier = 'principal' | 'supporting' | 'background';
const TIERS: Tier[] = ['principal', 'supporting', 'background'];

const tierOf = (row: CanonRow): Tier => {
  const raw = text(row, 'importance').toLowerCase();
  return (TIERS as string[]).includes(raw) ? (raw as Tier) : 'supporting';
};

const listOf = (row: CanonRow, key: string): string[] => {
  const value = row[key];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch { /* a plain string is a single entry */ }
    return [value];
  }
  return [];
};

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight',
  'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy',
  'Eighty', 'Ninety'];

/** The census is a sentence, so it spells its numbers. */
const spell = (n: number): string => {
  if (n < WORDS.length) return WORDS[n];
  if (n < 100) {
    const tens = TENS[Math.floor(n / 10)];
    const unit = n % 10;
    return unit ? `${tens}-${WORDS[unit].toLowerCase()}` : tens;
  }
  return String(n);
};

/** `principal` and `supporting` are database values and read like them. */
const TIER_LABEL: Record<Tier | 'all', string> = {
  principal: 'principals',
  supporting: 'supporting',
  background: 'background',
  all: 'everyone',
};

/** The filter's label is a heading; a sentence needs a noun. */
const TIER_NOUN: Record<Tier, string> = {
  principal: 'principal',
  supporting: 'supporting character',
  background: 'background character',
};

/** A character's years, which live on the row as integers. */
function lifespan(row: CanonRow): string {
  const from = text(row, 'activeTimeframeStart', 'active_timeframe_start');
  const to = text(row, 'activeTimeframeEnd', 'active_timeframe_end');
  if (from && to) return `${from} to ${to}`;
  // "active 280" read as a single year rather than an open span.
  if (from) return `from ${from}`;
  return to ? `until ${to}` : '';
}

const entryId = (id: string) => `person-${id}`;
const houseId = (id: string) => `house-${id}`;

/** An asset id as the harness writes it into prose: "(asset <uuid>, file.png)". */
const PROSE_ASSET = /asset\s+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;

/**
 * A character's reference art, set as plates.
 *
 * The media studio has recorded a subject on every asset since migration 018
 * (`subject_type = 'character'`), and nothing on this surface ever read it, so
 * a picture of someone could be in the canon and still be invisible while you
 * read about them.
 *
 * Every plate is the same shape. Reference art arrives at whatever aspect it
 * was drawn at, and letting each one set its own height makes a column of
 * sixty-six entries ragged; the crop favours the upper part of the frame, where
 * a face usually is. One asset takes the column, several share it, because a
 * character can legitimately have a portrait, a variant and their ship, and
 * choosing between those by filename would be guessing.
 *
 * An asset whose file has gone missing removes itself rather than leaving a
 * broken glyph in the middle of a reference work.
 */
function Plates({ assets, of }: { assets: MediaAsset[]; of: string }) {
  const [broken, setBroken] = useState<ReadonlySet<string>>(new Set());
  const shown = assets.filter((a) => !broken.has(a.id)).slice(0, 4);
  if (shown.length === 0) return null;
  return (
    <div className="editorial-entry__plates" data-plates={shown.length > 1 ? 'many' : 'one'}>
      {shown.map((asset) => (
        <img
          key={asset.id}
          className="editorial-entry__portrait"
          src={asset.url}
          alt={asset.caption || asset.title || of}
          loading="lazy"
          onError={() => setBroken((was) => new Set(was).add(asset.id))}
        />
      ))}
    </div>
  );
}

interface Kin {
  house?: Lineage;
  parents: LineageMember[];
  spouses: LineageMember[];
  children: LineageMember[];
  siblings: LineageMember[];
}

function Relations({ kin, onFollow }: { kin: Kin; onFollow: (id: string) => void }) {
  const rows: Array<[string, LineageMember[]]> = [
    ['Parents', kin.parents],
    ['Married', kin.spouses],
    ['Children', kin.children],
    ['Siblings', kin.siblings],
  ];
  const shown = rows.filter(([, people]) => people.length > 0);
  if (shown.length === 0) return null;

  return (
    <dl className="editorial-kin">
      {shown.map(([label, people]) => (
        <div className="editorial-kin__row" key={label}>
          <dt className="editorial-kin__relation">{label}</dt>
          <dd className="editorial-kin__people">
            {people.map((person, i) => (
              <span key={person.id}>
                {i > 0 && ', '}
                <button type="button" className="editorial-link" onClick={() => onFollow(person.id)}>
                  {person.name ?? person.id}
                </button>
              </span>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * One character, whole.
 *
 * This used to be a name in a rail that revealed a record in a pane beside it.
 * The pane filled 42% of its height for every character in the universe and
 * always would: measured across all 66, every record is a name, a standing
 * line, one paragraph of about 300 characters and a lineage. Motivation is
 * recorded for three of them and traits for two. There was no detail behind
 * the click, so the click bought nothing and cost sixty-six of them to read
 * the cast.
 *
 * A reference work sets this as an entry: the name and its particulars in a
 * narrow column, the prose beside it. The names still line up to be scanned,
 * which is what the rail was for, and nothing is hidden behind selection.
 */
function Entry({
  person, kin, given, house, anchored, plates, onFollow, nameRef,
}: {
  person: CanonRow; kin: Kin; given: string; house: string; anchored: boolean;
  plates: MediaAsset[]; onFollow: (id: string) => void;
  nameRef?: React.Ref<HTMLHeadingElement>;
}) {
  const years = lifespan(person);
  const background = text(person, 'background');
  const description = text(person, 'description');
  const motivation = text(person, 'motivation');
  const extra = description.trim() === background.trim() ? '' : description;

  const sets: Array<[string, string[]]> = ([
    ['Traits', listOf(person, 'traits')],
    ['Tendencies', listOf(person, 'tendencies')],
    ['Core skills', listOf(person, 'coreSkills')],
    ['Notable moments', listOf(person, 'notableMoments')],
  ] as Array<[string, string[]]>).filter(([, v]) => v.length > 0);

  return (
    <article
      className="editorial-entry"
      id={entryId(String(person.id))}
      data-anchored={anchored ? 'true' : undefined}
    >
      <div className="editorial-entry__particulars">
        <Plates assets={plates} of={`${given} ${house}`.trim()} />
        <h3 className="editorial-entry__name" ref={nameRef} tabIndex={-1}>
          {given}
          {house && <span className="editorial-entry__house"> {house}</span>}
        </h3>
        <p className="editorial-entry__standing">
          {[text(person, 'role'), years && `active ${years}`].filter(Boolean).join(' · ')}
        </p>
        <Relations kin={kin} onFollow={onFollow} />
        {isProtected(person) && (
          <p className="editorial-entry__flag">
            Protected. Agents may propose changes but not make them.
          </p>
        )}
      </div>

      <div className="editorial-entry__record">
        {background && <p className="editorial-entry__prose">{background}</p>}
        {extra && <p className="editorial-entry__prose">{extra}</p>}
        {motivation && (
          <p className="editorial-entry__prose">
            <span className="editorial-entry__label">Wants</span> {motivation}
          </p>
        )}
        {sets.map(([label, values]) => (
          <p className="editorial-entry__prose" key={label}>
            <span className="editorial-entry__label">{label}</span> {values.join(', ')}
          </p>
        ))}
      </div>
    </article>
  );
}

export default function Characters() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const cast = useAsync((signal) => editorialApi.listCharacters(id, signal), [id]);
  const tree = useAsync((signal) => editorialApi.getFamilyTree(id, signal), [id]);
  const media = useAsync((signal) => editorialApi.listMedia(id, signal), [id]);

  // Held in the URL so an entry is linkable and the back button works.
  const tier = (params.get('cast') ?? 'principal') as Tier | 'all';
  const query = params.get('q') ?? '';
  const anchoredId = params.get('who');

  const [draft, setDraft] = useState(query);
  useEffect(() => { setDraft(query); }, [query]);

  const update = (
    next: Record<string, string | null | undefined>,
    { replace = false }: { replace?: boolean } = {},
  ) => {
    const merged = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      // undefined means "leave this parameter alone". Writing it through
      // stringified to "undefined" and emptied the whole view.
      if (v === undefined) continue;
      if (v === null || v === '') merged.delete(k); else merged.set(k, v);
    }
    setParams(merged, { replace });
  };

  useEffect(() => {
    if (draft === query) return;
    const t = setTimeout(() => update({ q: draft, who: null }, { replace: true }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const lineages = useMemo(() => tree.data?.lineages ?? [], [tree.data]);

  const { houseOf, memberOf } = useMemo(() => {
    const houseOf = new Map<string, Lineage>();
    const memberOf = new Map<string, LineageMember>();
    for (const lineage of lineages) {
      for (const member of lineage.members ?? []) {
        houseOf.set(String(member.id), lineage);
        memberOf.set(String(member.id), member);
      }
    }
    return { houseOf, memberOf };
  }, [lineages]);

  const byId = useMemo(
    () => new Map((cast.data ?? []).map((r) => [String(r.id), r])), [cast.data],
  );

  /**
   * Which art belongs to whom.
   *
   * The subject on the asset is the real answer and is tried first. The second
   * path exists because the generation harness records a reference by writing
   * it into the prose -- "Reference portrait on file (asset <uuid>,
   * malakor-vane-reference.png)" -- and an asset catalogued that way can end up
   * with no subject set on the row. That sentence is a link the harness itself
   * wrote, so reading it is not a guess. It is only consulted when nothing
   * names the character directly.
   */
  const platesFor = useMemo(() => {
    const assets = media.data ?? [];
    const byAssetId = new Map(assets.map((a) => [String(a.id), a]));
    const bySubject = new Map<string, MediaAsset[]>();
    for (const asset of assets) {
      if (asset.subject?.type !== 'character') continue;
      const key = String(asset.subject.id);
      bySubject.set(key, [...(bySubject.get(key) ?? []), asset]);
    }
    // Hand-supplied reference before anything generated from it.
    const ordered = (found: MediaAsset[]) =>
      [...found].sort((a, b) => (a.kind === 'reference' ? 0 : 1) - (b.kind === 'reference' ? 0 : 1));

    return (person: CanonRow): MediaAsset[] => {
      const direct = bySubject.get(String(person.id));
      if (direct?.length) return ordered(direct);

      const prose = `${text(person, 'background')} ${text(person, 'description')}`;
      const seen = new Set<string>();
      const found: MediaAsset[] = [];
      for (const match of prose.matchAll(PROSE_ASSET)) {
        const id = match[1].toLowerCase();
        const asset = byAssetId.get(id);
        if (asset && !seen.has(id)) { seen.add(id); found.push(asset); }
      }
      return ordered(found);
    };
  }, [media.data]);

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return null;
    return new Set((cast.data ?? [])
      .filter((r) => `${text(r, 'name')} ${text(r, 'role')} ${text(r, 'description')}`
        .toLowerCase().includes(term))
      .map((r) => String(r.id)));
  }, [cast.data, query]);

  const tally = (rows: CanonRow[]) => ({
    all: rows.length,
    principal: rows.filter((r) => tierOf(r) === 'principal').length,
    supporting: rows.filter((r) => tierOf(r) === 'supporting').length,
    background: rows.filter((r) => tierOf(r) === 'background').length,
  });

  // The census speaks for the universe and must never be narrowed by a filter:
  // it read "No principals carry this universe" over a universe with six.
  const totals = useMemo(() => tally(cast.data ?? []), [cast.data]);
  const counts = useMemo(
    () => tally((cast.data ?? []).filter((r) => !matches || matches.has(String(r.id)))),
    [cast.data, matches],
  );

  /** The name as the index shows it: the house is already the group heading. */
  const givenName = (person: CanonRow, house?: Lineage | null) => {
    const full = text(person, 'name');
    const surname = house?.name.split(' ').pop() ?? '';
    return surname && full.endsWith(surname)
      ? full.slice(0, full.length - surname.length).trim() : full;
  };

  const groups = useMemo(() => {
    const visible = (cast.data ?? [])
      .filter((r) => tier === 'all' || tierOf(r) === tier)
      .filter((r) => !matches || matches.has(String(r.id)));

    const order = new Map(lineages.map((l, i) => [l.id, i]));
    const byHouse = new Map<string, { house: Lineage | null; people: CanonRow[] }>();
    for (const person of visible) {
      const house = houseOf.get(String(person.id)) ?? null;
      const key = house?.id ?? '￿';
      if (!byHouse.has(key)) byHouse.set(key, { house, people: [] });
      byHouse.get(key)!.people.push(person);
    }
    for (const g of byHouse.values()) {
      g.people.sort((a, b) => givenName(a, g.house).localeCompare(givenName(b, g.house)));
    }
    // The API's own house order, not an id string sort.
    return [...byHouse.values()].sort((a, b) =>
      (a.house ? order.get(a.house.id) ?? 99 : 100) - (b.house ? order.get(b.house.id) ?? 99 : 100));
  }, [cast.data, tier, matches, houseOf, lineages]);

  const shown = groups.flatMap((g) => g.people);

  // A link to a renamed or deleted character used to open the first person in
  // the list under the requested id, presenting someone else's canon as the
  // record that was asked for.
  const missing = Boolean(anchoredId && cast.data && !byId.has(anchoredId));

  const kinOf = (person: CanonRow): Kin => {
    const member = memberOf.get(String(person.id));
    const people = (ids?: string[]) =>
      (ids ?? []).map((i) => memberOf.get(String(i))).filter(Boolean) as LineageMember[];
    return {
      house: houseOf.get(String(person.id)),
      parents: people(member?.parents),
      spouses: people(member?.spouses),
      children: people(member?.children),
      siblings: people(member?.siblings),
    };
  };

  const indexRef = useRef<HTMLDivElement | null>(null);
  const anchoredRef = useRef<HTMLHeadingElement | null>(null);

  // An anchored entry is brought into view and given focus, so following a
  // cross-reference moves the reader rather than only the scrollbar. Focus used
  // to land on <body> when the button that was clicked unmounted.
  useEffect(() => {
    if (!anchoredId || !indexRef.current) return;
    const el = indexRef.current.querySelector(`#${CSS.escape(entryId(anchoredId))}`);
    if (!el) return;
    el.scrollIntoView({ block: 'start' });
    anchoredRef.current?.focus({ preventScroll: true });
  }, [anchoredId, tier, query, shown.length]);

  const follow = (personId: string) => {
    // Following a relation must land you somewhere you can see: widen the cast,
    // and clear a query that would hide them.
    const person = byId.get(personId);
    const visible = person
      && (tier === 'all' || tierOf(person) === tier)
      && (!matches || matches.has(personId));
    update({ who: personId, cast: visible ? undefined : 'all', q: visible ? undefined : null });
  };

  const jumpToHouse = (key: string) => {
    indexRef.current?.querySelector(`#${CSS.escape(key)}`)?.scrollIntoView({ block: 'start' });
  };

  if (cast.status === 'loading') {
    return <Surface name="characters"><LoadingState label="Reading the cast…" /></Surface>;
  }
  if (cast.status === 'error') {
    return (
      <Surface name="characters">
        <ErrorState title="Could not load the cast" error={cast.error} onRetry={cast.retry} />
      </Surface>
    );
  }

  const narrowed = Boolean(query) || tier !== 'all';

  return (
    <Surface name="characters">
      <div className="editorial-surface--panes">
        <header className="editorial-surface__fixed">
          <h1 className="editorial-census">
            <em>{spell(totals.principal)}</em> {totals.principal === 1 ? 'principal carries' : 'principals carry'} this universe
            {totals.supporting > 0 && `, ${spell(totals.supporting).toLowerCase()} more stand behind them`}
            {totals.background > 0 && `, and ${spell(totals.background).toLowerCase()} wait at the edges`}.
          </h1>

          {narrowed && shown.length > 0 && (
            <p className="editorial-census__showing">
              Showing {shown.length === totals.all
                ? `all ${spell(totals.all).toLowerCase()}`
                : `${spell(shown.length).toLowerCase()} of ${spell(totals.all).toLowerCase()}`}
              {query && <> matching “{query}”</>}.
            </p>
          )}

          <div className="editorial-cast-tiers">
            <div className="editorial-cast-tiers__group" role="group" aria-label="Which cast">
              {([...TIERS, 'all'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className="editorial-button editorial-button--toggle"
                  aria-pressed={tier === t}
                  // A tier holding nobody is not a route anywhere.
                  disabled={counts[t] === 0 && tier !== t}
                  onClick={() => update({ cast: t === 'principal' ? null : t })}
                >
                  <span>{TIER_LABEL[t]}</span>
                  <span className="editorial-cast-tier__count">{counts[t]}</span>
                </button>
              ))}
            </div>

            <input
              className="editorial-cast-search"
              type="search"
              value={draft}
              placeholder="Name, role or history"
              aria-label="Search the cast"
              onChange={(e) => setDraft(e.target.value)}
            />
          </div>

          {groups.length > 1 && (
            <nav className="editorial-houses" aria-label="Jump to a house">
              {groups.map((group, gi) => {
                const key = houseId(group.house?.id ?? `unaffiliated-${gi}`);
                return (
                  <button
                    key={key}
                    type="button"
                    className="editorial-button editorial-button--ghost editorial-houses__jump"
                    onClick={() => jumpToHouse(key)}
                  >
                    {group.house?.name ?? 'Unaffiliated'}
                    <span className="editorial-cast-tier__count">{group.people.length}</span>
                  </button>
                );
              })}
            </nav>
          )}
        </header>

        {missing && (
          <p className="editorial-cast-notice" role="status">
            No character is recorded under “{anchoredId}”.
          </p>
        )}

        {shown.length === 0 ? (
          <p className="editorial-cast-nobody">
            {/* The escape hatch used to be gated on the query-filtered counts,
                so in the one case it was written for -- a query matching
                nobody -- the guard was 0 and the button never rendered. */}
            {!query && 'No characters recorded for this universe yet.'}
            {query && counts.all > 0 && (
              <>No {tier === 'all' ? 'one' : TIER_NOUN[tier]} answers to “{query}”.{' '}
                <button type="button" className="editorial-link" onClick={() => update({ cast: 'all' })}>
                  {spell(counts.all)} in the wider cast {counts.all === 1 ? 'does' : 'do'}
                </button>.
              </>
            )}
            {query && counts.all === 0 && (
              <>Nobody in this universe answers to “{query}”.{' '}
                <button type="button" className="editorial-link" onClick={() => { setDraft(''); update({ q: null }); }}>
                  Clear the search
                </button> to see all {spell(totals.all).toLowerCase()}.
              </>
            )}
          </p>
        ) : (
          <div className="editorial-pane editorial-cast-index" ref={indexRef}>
            {groups.map((group, gi) => (
              <section key={group.house?.id ?? `unaffiliated-${gi}`}>
                <h2 className="editorial-house" id={houseId(group.house?.id ?? `unaffiliated-${gi}`)}>
                  {group.house?.name ?? 'Unaffiliated'}
                </h2>
                {group.people.map((person) => {
                  const personId = String(person.id);
                  const anchored = personId === anchoredId;
                  return (
                    <Entry
                      key={personId}
                      person={person}
                      kin={kinOf(person)}
                      given={givenName(person, group.house)}
                      house={group.house?.name.split(' ').pop() ?? ''}
                      anchored={anchored}
                      plates={platesFor(person)}
                      onFollow={follow}
                      nameRef={anchored ? anchoredRef : undefined}
                    />
                  );
                })}
              </section>
            ))}
          </div>
        )}
      </div>
    </Surface>
  );
}
