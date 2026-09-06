import { useMemo, useState } from 'react';
import { editorialApi, type CanonRow, type Lineage } from '../api';
import { useAsync } from '../useAsync';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import Surface from '../components/Surface';
import { ProtectedBadge } from '../components/CanonRows';
import { isProtected, text } from '../canonFields';
import { useParams } from 'react-router-dom';

type Importance = 'principal' | 'supporting' | 'background';
const IMPORTANCE: Importance[] = ['principal', 'supporting', 'background'];

const importanceOf = (row: CanonRow): Importance => {
  const raw = text(row, 'importance').toLowerCase();
  return (IMPORTANCE as string[]).includes(raw) ? (raw as Importance) : 'supporting';
};

const list = (row: CanonRow, key: string): string[] => {
  const value = row[key];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch { /* a plain string is one item */ }
    return [value];
  }
  return [];
};

function Dossier({ character, lineage }: { character: CanonRow; lineage?: Lineage }) {
  const timeframe = [text(character, 'activeTimeframeStart'), text(character, 'activeTimeframeEnd')]
    .filter(Boolean).join(' – ');

  const sections: Array<[string, string | string[]]> = [
    ['Motivation', text(character, 'motivation')],
    ['Background', text(character, 'background')],
    ['Traits', list(character, 'traits')],
    ['Tendencies', list(character, 'tendencies')],
    ['Core skills', list(character, 'coreSkills')],
    ['Special abilities', list(character, 'specialAbilities')],
    ['Notable moments', list(character, 'notableMoments')],
  ];

  return (
    <div className="editorial-family-node editorial-character-dossier">
      <h2 className="editorial-section-title">
        {text(character, 'name')}
        <ProtectedBadge on={isProtected(character)} />
      </h2>

      <p className="editorial-activity-row__time">
        {[
          text(character, 'role'),
          importanceOf(character),
          lineage?.name,
          timeframe && `active ${timeframe}`,
          text(character, 'location'),
          text(character, 'sharedArchetype') && `archetype: ${text(character, 'sharedArchetype')}`,
        ].filter(Boolean).join(' · ')}
      </p>

      {text(character, 'description') && (
        <p className="editorial-briefing__summary">{text(character, 'description')}</p>
      )}

      {sections.map(([label, value]) => {
        const empty = Array.isArray(value) ? value.length === 0 : !value;
        if (empty) return null;
        return (
          <div className="editorial-form-group" key={label}>
            <span className="editorial-form-label">{label}</span>
            {Array.isArray(value)
              ? <p className="editorial-activity-row__time">{value.join(' · ')}</p>
              : <p className="editorial-activity-row__time">{value}</p>}
          </div>
        );
      })}
    </div>
  );
}

export default function Characters() {
  const { id = '' } = useParams();
  const cast = useAsync((signal) => editorialApi.listCharacters(id, signal), [id]);
  const tree = useAsync((signal) => editorialApi.getFamilyTree(id, signal), [id]);

  // Principal cast is the default view. A universe with 66 characters is a
  // laundry list if it opens on everyone, and the cast is what an author works.
  const [tier, setTier] = useState<Importance | 'all'>('principal');
  const [house, setHouse] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const lineages = tree.data?.lineages ?? [];

  /** Which house each character belongs to, from the lineage membership. */
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
      principal: rows.filter((r) => importanceOf(r) === 'principal').length,
      supporting: rows.filter((r) => importanceOf(r) === 'supporting').length,
      background: rows.filter((r) => importanceOf(r) === 'background').length,
    };
  }, [cast.data]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (cast.data ?? [])
      .filter((row) => tier === 'all' || importanceOf(row) === tier)
      .filter((row) => house === 'all' || houseOf.get(String(row.id))?.id === house)
      .filter((row) => !term
        || `${text(row, 'name')} ${text(row, 'role')} ${text(row, 'description')}`.toLowerCase().includes(term))
      .sort((a, b) => text(a, 'name').localeCompare(text(b, 'name')));
  }, [cast.data, tier, house, query, houseOf]);

  const selected = visible.find((r) => String(r.id) === selectedId)
    ?? (cast.data ?? []).find((r) => String(r.id) === selectedId)
    ?? visible[0];

  if (cast.status === 'loading') {
    return <Surface name="characters"><LoadingState label="Reading the cast…" /></Surface>;
  }
  if (cast.status === 'error') {
    return (
      <Surface name="characters">
        <ErrorState title="Could not load characters" error={cast.error} onRetry={cast.retry} />
      </Surface>
    );
  }

  return (
    <Surface name="characters">
      <div className="editorial-section-header">
        <h1 className="editorial-section-title">Characters</h1>
        <span className="editorial-activity-row__time">
          {counts.principal} principal · {counts.supporting} supporting · {counts.background} background
        </span>
      </div>

      <div className="editorial-encyclopedia-filter">
        <div className="editorial-form-group">
          <span className="editorial-form-label">Cast</span>
          <div className="editorial-reader-typography-panel__btn-group">
            {(['principal', 'supporting', 'background', 'all'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTier(t)}
                aria-pressed={tier === t}
                className={tier === t ? 'editorial-button' : 'editorial-button editorial-button--quiet'}
              >
                {t === 'all' ? `All ${counts.all}` : `${t} ${counts[t]}`}
              </button>
            ))}
          </div>
        </div>

        {lineages.length > 0 && (
          <div className="editorial-form-group">
            <label className="editorial-form-label" htmlFor="cast-house">House or clan</label>
            <select id="cast-house" value={house} onChange={(e) => setHouse(e.target.value)}>
              <option value="all">Every house</option>
              {lineages.map((l) => (
                <option key={l.id} value={l.id}>{l.name} ({l.memberCount})</option>
              ))}
            </select>
          </div>
        )}

        <div className="editorial-form-group">
          <label className="editorial-form-label" htmlFor="cast-search">Find</label>
          <input
            id="cast-search"
            type="search"
            value={query}
            placeholder="Name, role or description"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title="Nobody matches that"
          description={`No ${tier === 'all' ? '' : `${tier} `}character${house === 'all' ? '' : ' in that house'} matches. Widen the filters, or try All.`}
        />
      ) : (
        <div className="editorial-family-workspace editorial-character-layout">
          <div className="editorial-scanning-list">
            {visible.map((row) => {
              const lineage = houseOf.get(String(row.id));
              const active = selected && String(selected.id) === String(row.id);
              return (
                <button
                  type="button"
                  key={String(row.id)}
                  className={`editorial-action-row editorial-character-row${active ? ' editorial-character-row--active' : ''}`}
                  onClick={() => setSelectedId(String(row.id))}
                  aria-pressed={active}
                >
                  <span className="editorial-action-row__detail">
                    <span className="editorial-activity-row__title">
                      {text(row, 'name')}
                      <ProtectedBadge on={isProtected(row)} />
                    </span>
                    <span className="editorial-activity-row__time">
                      {[text(row, 'role'), lineage?.name, importanceOf(row)]
                        .filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {selected && <Dossier character={selected} lineage={houseOf.get(String(selected.id))} />}
        </div>
      )}
    </Surface>
  );
}
