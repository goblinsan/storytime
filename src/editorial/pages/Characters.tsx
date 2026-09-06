import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { editorialApi, type CanonRow, type Lineage } from '../api';
import { useAsync } from '../useAsync';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
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

const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven',
  'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];
const spell = (n: number) => (n < NUMBER_WORDS.length ? NUMBER_WORDS[n] : String(n));

function Dossier({ person, house }: { person: CanonRow; house?: Lineage }) {
  const standing = [
    text(person, 'role'),
    house?.name,
    tierOf(person),
    [text(person, 'activeTimeframeStart'), text(person, 'activeTimeframeEnd')]
      .filter(Boolean).join(' to '),
    text(person, 'location'),
    isProtected(person) ? 'protected from automated change' : '',
  ].filter(Boolean).join(' · ');

  // Background and description are frequently the same sentence in this data;
  // printing both makes a dossier look padded rather than thorough.
  const background = text(person, 'background');
  const description = text(person, 'description');
  const prose: Array<[string, string]> = [
    ['Motivation', text(person, 'motivation')],
    ['Background', background],
    ['Description', description.trim() === background.trim() ? '' : description],
  ];

  const sets: Array<[string, string[]]> = [
    ['Traits', listOf(person, 'traits')],
    ['Tendencies', listOf(person, 'tendencies')],
    ['Core skills', listOf(person, 'coreSkills')],
    ['Special abilities', listOf(person, 'specialAbilities')],
    ['Notable moments', listOf(person, 'notableMoments')],
  ];

  return (
    <article>
      <h2 className="editorial-dossier__name">{text(person, 'name')}</h2>
      <p className="editorial-dossier__standing">{standing}</p>

      {prose.map(([label, value]) => value && (
        <div className="editorial-dossier__field" key={label}>
          <span className="editorial-dossier__label">{label}</span>
          <p className="editorial-dossier__value">{value}</p>
        </div>
      ))}

      {sets.map(([label, values]) => values.length > 0 && (
        <div className="editorial-dossier__field" key={label}>
          <span className="editorial-dossier__label">{label}</span>
          <ul className="editorial-dossier__list">
            {values.map((v, i) => <li key={i}>{v}</li>)}
          </ul>
        </div>
      ))}
    </article>
  );
}

export default function Characters() {
  const { id = '' } = useParams();
  const cast = useAsync((signal) => editorialApi.listCharacters(id, signal), [id]);
  const tree = useAsync((signal) => editorialApi.getFamilyTree(id, signal), [id]);

  const [tier, setTier] = useState<Tier | 'all'>('principal');
  const [query, setQuery] = useState('');
  const [chosenId, setChosenId] = useState<string | null>(null);

  const lineages = tree.data?.lineages ?? [];

  const houseOf = useMemo(() => {
    const map = new Map<string, Lineage>();
    for (const lineage of lineages) {
      for (const member of lineage.members ?? []) map.set(String(member.id), lineage);
    }
    return map;
  }, [lineages]);

  const counts = useMemo(() => {
    const rows = cast.data ?? [];
    return {
      all: rows.length,
      principal: rows.filter((r) => tierOf(r) === 'principal').length,
      supporting: rows.filter((r) => tierOf(r) === 'supporting').length,
      background: rows.filter((r) => tierOf(r) === 'background').length,
    };
  }, [cast.data]);

  /** Grouped by house, because the clan structure is how this cast is organised. */
  const groups = useMemo(() => {
    const term = query.trim().toLowerCase();
    const visible = (cast.data ?? [])
      .filter((r) => tier === 'all' || tierOf(r) === tier)
      .filter((r) => !term
        || `${text(r, 'name')} ${text(r, 'role')} ${text(r, 'description')}`.toLowerCase().includes(term));

    const byHouse = new Map<string, { house: Lineage | null; people: CanonRow[] }>();
    for (const person of visible) {
      const house = houseOf.get(String(person.id)) ?? null;
      const key = house?.id ?? '￿-unaffiliated';
      if (!byHouse.has(key)) byHouse.set(key, { house, people: [] });
      byHouse.get(key)!.people.push(person);
    }
    for (const group of byHouse.values()) {
      group.people.sort((a, b) => text(a, 'name').localeCompare(text(b, 'name')));
    }
    return [...byHouse.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, group]) => group);
  }, [cast.data, tier, query, houseOf]);

  const everyone = groups.flatMap((g) => g.people);
  const chosen = everyone.find((p) => String(p.id) === chosenId) ?? everyone[0];

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

  return (
    <Surface name="characters">
      <div className="editorial-surface--panes">
        <header className="editorial-surface__fixed">
          <p className="editorial-census">
            <em>{spell(counts.principal)}</em> {counts.principal === 1 ? 'principal carries' : 'principals carry'} this universe.
            {counts.supporting > 0 && ` ${spell(counts.supporting)} more stand behind them`}
            {counts.background > 0 && `, and ${spell(counts.background).toLowerCase()} at the edges`}
            {counts.supporting > 0 && '.'}
          </p>

          <div className="editorial-cast-tiers">
            {TIERS.map((t) => (
              <button
                key={t}
                type="button"
                className="editorial-cast-tier"
                aria-pressed={tier === t}
                onClick={() => setTier(t)}
              >
                {counts[t]} {t}
              </button>
            ))}
            <button
              type="button"
              className="editorial-cast-tier"
              aria-pressed={tier === 'all'}
              onClick={() => setTier('all')}
            >
              all {counts.all}
            </button>

            <input
              type="search"
              value={query}
              placeholder="Find a name"
              aria-label="Find a character"
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </header>

        {everyone.length === 0 ? (
          <EmptyState
            title="Nobody here"
            description={query
              ? `No one in the ${tier === 'all' ? 'cast' : `${tier} cast`} answers to “${query}”.`
              : 'No characters recorded for this universe yet.'}
          />
        ) : (
          <div className="editorial-panes">
            <div className="editorial-pane" aria-label="Cast">
              {groups.map((group, gi) => (
                <div key={group.house?.id ?? `unaffiliated-${gi}`}>
                  <h3 className="editorial-house">
                    {group.house?.name ?? 'Unaffiliated'}
                  </h3>
                  {group.people.map((person) => (
                    <button
                      key={String(person.id)}
                      type="button"
                      className="editorial-cast-entry"
                      aria-pressed={chosen && String(chosen.id) === String(person.id)}
                      onClick={() => setChosenId(String(person.id))}
                    >
                      <span className="editorial-cast-entry__name">{text(person, 'name')}</span>
                      <span className="editorial-cast-entry__role">{text(person, 'role')}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>

            <div className="editorial-pane" aria-label="Dossier">
              {chosen && <Dossier person={chosen} house={houseOf.get(String(chosen.id))} />}
            </div>
          </div>
        )}
      </div>
    </Surface>
  );
}
