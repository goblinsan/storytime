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

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven',
  'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];
const spell = (n: number) => (n < WORDS.length ? WORDS[n] : String(n));

/** A character's years, which live on the row as integers. */
function lifespan(row: CanonRow): string {
  const from = text(row, 'activeTimeframeStart', 'active_timeframe_start');
  const to = text(row, 'activeTimeframeEnd', 'active_timeframe_end');
  if (from && to) return `${from} to ${to}`;
  return from || to || '';
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
      {rows.map(([label, people]) => people.length > 0 && (
        <p className="editorial-dossier__value" key={label}>
          <span className="editorial-kin__relation">{label}</span>
          {people.map((person, i) => (
            <span key={person.id}>
              {i > 0 && ', '}
              <button
                type="button"
                className="editorial-kin__link"
                onClick={() => onChoose(person.id)}
              >
                {person.name ?? person.id}
              </button>
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}

function Dossier({
  person, kin, onChoose,
}: { person: CanonRow; kin: Kin; onChoose: (id: string) => void }) {
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
    <article className="editorial-dossier" aria-live="polite">
      <h2 className="editorial-dossier__name">{text(person, 'name')}</h2>
      <p className="editorial-dossier__standing">{standing}</p>

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

  const update = (next: Record<string, string | null | undefined>) => {
    const merged = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      // undefined means "leave this parameter alone". Writing it through
      // stringified to "undefined" and emptied the whole view.
      if (v === undefined) continue;
      if (v === null || v === '') merged.delete(k); else merged.set(k, v);
    }
    setParams(merged, { replace: true });
  };

  useEffect(() => {
    if (draft === query) return;
    const t = setTimeout(() => update({ q: draft, who: null }), 250);
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

  // Counts follow the query, so a tier never claims people the search excludes.
  const counts = useMemo(() => {
    const rows = (cast.data ?? []).filter((r) => !matches || matches.has(String(r.id)));
    return {
      all: rows.length,
      principal: rows.filter((r) => tierOf(r) === 'principal').length,
      supporting: rows.filter((r) => tierOf(r) === 'supporting').length,
      background: rows.filter((r) => tierOf(r) === 'background').length,
    };
  }, [cast.data, matches]);

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
      g.people.sort((a, b) => text(a, 'name').localeCompare(text(b, 'name')));
    }
    // The API's own house order, not an id string sort.
    return [...byHouse.values()].sort((a, b) =>
      (a.house ? order.get(a.house.id) ?? 99 : 100) - (b.house ? order.get(b.house.id) ?? 99 : 100));
  }, [cast.data, tier, matches, houseOf, lineages]);

  const everyone = groups.flatMap((g) => g.people);
  const chosen = (chosenId && byId.get(chosenId)) || everyone[0];

  const railRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!chosen) return;
    railRef.current
      ?.querySelector(`[data-person="${CSS.escape(String(chosen.id))}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [chosen]);

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

  const elsewhere = counts.all - counts[tier === 'all' ? 'all' : tier];

  return (
    <Surface name="characters">
      <div className="editorial-surface--panes">
        <header className="editorial-surface__fixed">
          <h1 className="editorial-census">
            <em>{spell(counts.principal)}</em> {counts.principal === 1 ? 'principal carries' : 'principals carry'} this universe
            {counts.supporting > 0 && `, ${spell(counts.supporting).toLowerCase()} more stand behind them`}
            {counts.background > 0 && `, and ${spell(counts.background).toLowerCase()} wait at the edges`}.
          </h1>

          <div className="editorial-cast-tiers">
            <div className="editorial-cast-tiers__group" role="group" aria-label="Which cast">
              {([...TIERS, 'all'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className="editorial-cast-tier"
                  aria-pressed={tier === t}
                  onClick={() => update({ cast: t === 'principal' ? null : t, who: null })}
                >
                  {t === 'all' ? `all ${counts.all}` : `${counts[t]} ${t}`}
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
            {query
              ? <>No {tier === 'all' ? 'one' : `${tier} character`} answers to “{query}”.{' '}
                {elsewhere > 0 && tier !== 'all' && (
                  <button type="button" className="editorial-kin__link" onClick={() => update({ cast: 'all' })}>
                    {spell(counts.all)} in the wider cast {counts.all === 1 ? 'does' : 'do'}
                  </button>
                )}</>
              : 'No characters recorded for this universe yet.'}
          </p>
        ) : (
          <div className="editorial-panes">
            <div className="editorial-pane editorial-pane--rail" ref={railRef}>
              {groups.map((group, gi) => (
                <section key={group.house?.id ?? `unaffiliated-${gi}`}>
                  <h3 className="editorial-house">{group.house?.name ?? 'Unaffiliated'}</h3>
                  {group.people.map((person) => {
                    const full = text(person, 'name');
                    const house = group.house?.name.split(' ').pop() ?? '';
                    const given = house && full.endsWith(house)
                      ? full.slice(0, full.length - house.length).trim() : full;
                    const selected = chosen && String(chosen.id) === String(person.id);
                    return (
                      <button
                        key={String(person.id)}
                        type="button"
                        data-person={String(person.id)}
                        className="editorial-cast-entry"
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
            </div>

            <div className="editorial-pane editorial-pane--dossier">
              {chosen && (
                <Dossier
                  person={chosen}
                  kin={kin}
                  onChoose={(personId) => {
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
