import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { editorialApi, type CanonRow, type Lineage, type LineageMember } from '../api';
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

/** The census is a sentence, so it spells its numbers. It read "Six … 55 …
 *  five" while the table stopped at twelve, which is two registers in one
 *  line. A cast large enough to pass ninety-nine takes the numeral. */
const spell = (n: number): string => {
  if (n < WORDS.length) return WORDS[n];
  if (n < 100) {
    const tens = TENS[Math.floor(n / 10)];
    const unit = n % 10;
    return unit ? `${tens}-${WORDS[unit].toLowerCase()}` : tens;
  }
  return String(n);
};

/** The authored label for a tier. `principal` and `supporting` are database
 *  values and read like them beside the word `everyone`. */
const TIER_LABEL: Record<Tier | 'all', string> = {
  principal: 'principals',
  supporting: 'supporting',
  background: 'background',
  all: 'everyone',
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

interface Kin {
  house?: Lineage;
  parents: LineageMember[];
  spouses: LineageMember[];
  children: LineageMember[];
  siblings: LineageMember[];
}

function Relations({
  kin, onChoose,
}: { kin: Kin; onChoose: (id: string) => void }) {
  const rows: Array<[string, LineageMember[]]> = [
    ['Parents', kin.parents],
    ['Married', kin.spouses],
    ['Children', kin.children],
    ['Siblings', kin.siblings],
  ];
  const any = rows.some(([, people]) => people.length > 0);
  if (!any && !kin.house) return null;

  return (
    <div className="editorial-dossier__field">
      <span className="editorial-dossier__label">Lineage</span>
      {kin.house && (
        <p className="editorial-dossier__value editorial-kin__house">{kin.house.name}</p>
      )}
      {/* A definition list, not four sentences: the relation and the people it
          holds are a term and its values, and the pane has the vertical room
          the comma-separated version was saving. */}
      <dl className="editorial-kin">
        {rows.map(([label, people]) => people.length > 0 && (
          <div className="editorial-kin__row" key={label}>
            <dt className="editorial-kin__relation">{label}</dt>
            <dd className="editorial-kin__people">
              {people.map((person, i) => (
                <span key={person.id}>
                  {i > 0 && ', '}
                  <button
                    type="button"
                    className="editorial-link"
                    onClick={() => onChoose(person.id)}
                  >
                    {person.name ?? person.id}
                  </button>
                </span>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Dossier({
  person, kin, onChoose, headingRef,
}: {
  person: CanonRow; kin: Kin; onChoose: (id: string) => void;
  headingRef?: React.Ref<HTMLHeadingElement>;
}) {
  const years = lifespan(person);
  const standing = [text(person, 'role'), kin.house?.name, years && `active ${years}`]
    .filter(Boolean).join(' · ');

  const background = text(person, 'background');
  const description = text(person, 'description');
  const motivation = text(person, 'motivation');
  const extra = description.trim() === background.trim() ? '' : description;

  // Only fields this dataset actually carries. Rendering a fixed schema is what
  // left seven of eight headings empty on nearly every character.
  const sets: Array<[string, string[]]> = ([
    ['Traits', listOf(person, 'traits')],
    ['Tendencies', listOf(person, 'tendencies')],
    ['Core skills', listOf(person, 'coreSkills')],
    ['Notable moments', listOf(person, 'notableMoments')],
  ] as Array<[string, string[]]>).filter(([, v]) => v.length > 0);

  return (
    <article className="editorial-dossier" aria-labelledby="editorial-dossier-name">
      {/* The live region is the identity, not the whole article: wrapping the
          record re-announced every field on each selection. */}
      <div aria-live="polite">
        <h2 className="editorial-dossier__name" id="editorial-dossier-name" ref={headingRef} tabIndex={-1}>
          {text(person, 'name')}
        </h2>
        <p className="editorial-dossier__standing">{standing}</p>
      </div>

      {background && (
        <div className="editorial-dossier__field">
          <p className="editorial-dossier__value">{background}</p>
        </div>
      )}

      {motivation && (
        <div className="editorial-dossier__field">
          <span className="editorial-dossier__label">Wants</span>
          <p className="editorial-dossier__value">{motivation}</p>
        </div>
      )}

      <Relations kin={kin} onChoose={onChoose} />

      {extra && (
        <div className="editorial-dossier__field">
          <span className="editorial-dossier__label">Also</span>
          <p className="editorial-dossier__value">{extra}</p>
        </div>
      )}

      {sets.map(([label, values]) => (
        <div className="editorial-dossier__field" key={label}>
          <span className="editorial-dossier__label">{label}</span>
          <ul className="editorial-dossier__list">
            {values.map((v, i) => <li key={i}>{v}</li>)}
          </ul>
        </div>
      ))}

      {isProtected(person) && (
        <p className="editorial-dossier__flag">
          Protected. Agents may propose changes to this record but not make them.
        </p>
      )}
    </article>
  );
}

export default function Characters() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const cast = useAsync((signal) => editorialApi.listCharacters(id, signal), [id]);
  const tree = useAsync((signal) => editorialApi.getFamilyTree(id, signal), [id]);

  // Held in the URL so a dossier is linkable and the back button works.
  const tier = (params.get('cast') ?? 'principal') as Tier | 'all';
  const query = params.get('q') ?? '';
  const chosenId = params.get('who');

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
    // Replacing on every change collapsed a four-generation walk into one
    // history entry, so Back threw the reader out of the surface entirely.
    // Only the debounced keystrokes replace.
    setParams(merged, { replace });
  };

  useEffect(() => {
    if (draft === query) return;
    const t = setTimeout(() => update({ q: draft, who: null }, { replace: true }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  // Stable identity, or every memo below recomputes on each render.
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

  // Two sets, because they answer two different questions. The census speaks
  // for the universe and must never be narrowed by a filter: it read "No
  // principals carry this universe" over a universe with six, in the app's most
  // authoritative voice, because a search had hidden them.
  const totals = useMemo(() => tally(cast.data ?? []), [cast.data]);

  // The tier counts follow the query, so a tier never claims people the search
  // excludes.
  const counts = useMemo(
    () => tally((cast.data ?? []).filter((r) => !matches || matches.has(String(r.id)))),
    [cast.data, matches],
  );

  /** The name as the rail shows it: the house is already the group heading. */
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
      g.people.sort((a, b) =>
        givenName(a, g.house).localeCompare(givenName(b, g.house)));
    }
    // The API's own house order, not an id string sort.
    return [...byHouse.values()].sort((a, b) =>
      (a.house ? order.get(a.house.id) ?? 99 : 100) - (b.house ? order.get(b.house.id) ?? 99 : 100));
  }, [cast.data, tier, matches, houseOf, lineages]);

  const everyone = groups.flatMap((g) => g.people);
  // A link to a renamed or deleted character used to open the first person in
  // the list under the requested id, presenting someone else's canon as the
  // record that was asked for.
  const missing = Boolean(chosenId && cast.data && !byId.has(chosenId));
  const chosen = (chosenId && byId.get(chosenId)) || everyone[0];

  const railRef = useRef<HTMLDivElement | null>(null);
  const dossierRef = useRef<HTMLHeadingElement | null>(null);
  const followed = useRef(false);
  useEffect(() => {
    if (!chosen) return;
    railRef.current
      ?.querySelector(`[data-person="${CSS.escape(String(chosen.id))}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [chosen]);

  // A cross-reference unmounts the button that was focused, which drops focus to
  // <body> and sends the next Tab back through all 66 rail entries.
  useEffect(() => {
    if (!followed.current) return;
    followed.current = false;
    dossierRef.current?.focus();
  }, [chosen]);

  /**
   * The rail is a list, so it takes list keys. With a roving tabindex the only
   * way in is Tab, and the only way along it was the mouse.
   */
  const typed = useRef({ buffer: '', at: 0 });
  const onRailKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const entries = [...(railRef.current?.querySelectorAll<HTMLButtonElement>('[data-person]') ?? [])];
    if (entries.length === 0) return;
    const here = entries.indexOf(document.activeElement as HTMLButtonElement);

    const step = (to: number) => {
      event.preventDefault();
      const target = entries[Math.max(0, Math.min(entries.length - 1, to))];
      target?.focus();
      target?.scrollIntoView({ block: 'nearest' });
    };

    switch (event.key) {
      case 'ArrowDown': return step(here + 1);
      case 'ArrowUp': return step(here < 0 ? entries.length - 1 : here - 1);
      case 'Home': return step(0);
      case 'End': return step(entries.length - 1);
      default: break;
    }

    // Type-ahead. A rail of 66 names is a place you jump into, not scroll.
    if (event.key.length !== 1 || event.metaKey || event.ctrlKey || event.altKey) return;
    const now = Date.now();
    typed.current.buffer = now - typed.current.at > 700 ? event.key : typed.current.buffer + event.key;
    typed.current.at = now;
    const term = typed.current.buffer.toLowerCase();
    const from = here < 0 ? 0 : here + (typed.current.buffer.length > 1 ? 0 : 1);
    const order = [...entries.slice(from), ...entries.slice(0, from)];
    const hit = order.find((el) => (el.dataset.name ?? '').toLowerCase().startsWith(term));
    if (hit) step(entries.indexOf(hit));
  };

  const kin: Kin = useMemo(() => {
    if (!chosen) return { parents: [], spouses: [], children: [], siblings: [] };
    const member = memberOf.get(String(chosen.id));
    const people = (ids?: string[]) =>
      (ids ?? []).map((i) => memberOf.get(String(i))).filter(Boolean) as LineageMember[];
    return {
      house: houseOf.get(String(chosen.id)),
      parents: people(member?.parents),
      spouses: people(member?.spouses),
      children: people(member?.children),
      siblings: people(member?.siblings),
    };
  }, [chosen, memberOf, houseOf]);

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

          {narrowed && everyone.length > 0 && (
            <p className="editorial-census__showing">
              Showing {everyone.length === totals.all
                ? `all ${spell(totals.all).toLowerCase()}`
                : `${spell(everyone.length).toLowerCase()} of ${spell(totals.all).toLowerCase()}`}
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
                  // A tier holding nobody is not a route anywhere. All four
                  // used to read "0" and stay live, offering four ways to the
                  // same empty page.
                  disabled={counts[t] === 0 && tier !== t}
                  onClick={() => update({ cast: t === 'principal' ? null : t })}
                >
                  {/* Label then count, the same way round every time. It read
                      "6 principal" beside "all 66", two different orders. */}
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
        </header>

        {everyone.length === 0 ? (
          <p className="editorial-cast-nobody">
            {/* The escape hatch used to be gated on the query-filtered counts,
                so in the one case it was written for -- a query matching
                nobody -- the guard was 0 and the button never rendered. */}
            {!query && 'No characters recorded for this universe yet.'}
            {query && counts.all > 0 && (
              <>No {tier === 'all' ? 'one' : TIER_LABEL[tier]} answers to “{query}”.{' '}
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
          <div className="editorial-panes">
            <nav
              className="editorial-pane editorial-pane--rail"
              ref={railRef}
              aria-label={`The cast, ${everyone.length} ${everyone.length === 1 ? 'person' : 'people'}`}
              onKeyDown={onRailKeyDown}
            >
              {groups.map((group, gi) => (
                <section key={group.house?.id ?? `unaffiliated-${gi}`}>
                  {/* h3, not h2: these label groups inside the rail. At h2 they
                      sat at the same level as the record itself, so a screen
                      reader's heading list gave five house names and a person
                      with nothing saying which was the record. */}
                  <h3 className="editorial-house">{group.house?.name ?? 'Unaffiliated'}</h3>
                  {group.people.map((person) => {
                    const full = text(person, 'name');
                    const house = group.house?.name.split(' ').pop() ?? '';
                    const given = givenName(person, group.house);
                    const selected = chosen && String(chosen.id) === String(person.id);
                    return (
                      <button
                        key={String(person.id)}
                        type="button"
                        data-person={String(person.id)}
                        data-name={given}
                        // Roving tabindex: one stop for the whole rail. Tabbing
                        // through 66 buttons to reach the record beside them is
                        // not navigation, it is a penalty.
                        tabIndex={selected ? 0 : -1}
                        className="editorial-button editorial-button--row editorial-cast-entry"
                        aria-pressed={selected}
                        onClick={() => update({ who: String(person.id) })}
                      >
                        <span className="editorial-cast-entry__name">
                          {given}
                          {given !== full && <span className="editorial-cast-entry__house"> {house}</span>}
                        </span>
                        <span className="editorial-cast-entry__role">{text(person, 'role')}</span>
                      </button>
                    );
                  })}
                </section>
              ))}
            </nav>

            <div className="editorial-pane editorial-pane--dossier">
              {missing && (
                <p className="editorial-dossier__notice" role="status">
                  No character is recorded under “{chosenId}”. Showing{' '}
                  {chosen ? text(chosen, 'name') : 'the first entry'} instead.
                </p>
              )}
              {chosen && (
                <Dossier
                  person={chosen}
                  kin={kin}
                  headingRef={dossierRef}
                  onChoose={(personId) => {
                    followed.current = true;
                    // Following a relation must land you somewhere you can see:
                    // widen the cast, and clear a query that would hide them.
                    const person = byId.get(personId);
                    const visible = person
                      && (tier === 'all' || tierOf(person) === tier)
                      && (!matches || matches.has(personId));
                    update({ who: personId, cast: visible ? undefined : 'all', q: visible ? undefined : null });
                  }}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </Surface>
  );
}
