import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  editorialApi, type CanonRow, type Lineage, type LineageMember, type MediaAsset,
} from '../api';
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

/**
 * The filter labels.
 *
 * `principal`, `supporting` and `background` are the values in the importance
 * column, and these read as those values for as long as they were lowercase --
 * a control labelled in the database's voice rather than the reader's.
 */
const TIER_LABEL: Record<Tier | 'all', string> = {
  principal: 'Principals', supporting: 'Supporting', background: 'Background', all: 'Everyone',
};
const TIER_NOUN: Record<Tier, string> = {
  principal: 'principal', supporting: 'supporting character', background: 'background character',
};

/**
 * How an edge in the canon graph reads from each end.
 *
 * The graph holds far more than genealogy -- protective bonds, feuds,
 * skirmishes, uneasy alliances -- and nothing on this surface had ever read it.
 * A directed type reads differently depending on which end you are standing at,
 * so both are written down rather than inferred.
 */
const EDGE_LABEL: Record<string, { forward: string; back: string }> = {
  parent: { forward: 'parent of', back: 'child of' },
  parent_of: { forward: 'parent of', back: 'child of' },
  child_of: { forward: 'child of', back: 'parent of' },
  ancestor: { forward: 'ancestor of', back: 'descended from' },
  guardian_of: { forward: 'guardian of', back: 'ward of' },
  spouse: { forward: 'married to', back: 'married to' },
  sibling: { forward: 'sibling of', back: 'sibling of' },
  family: { forward: 'kin of', back: 'kin of' },
  protective_bond: { forward: 'protects', back: 'protected by' },
  hostile: { forward: 'hostile to', back: 'hostile to' },
  feud: { forward: 'feuding with', back: 'feuding with' },
  active_skirmish: { forward: 'in open conflict with', back: 'in open conflict with' },
  cold_war: { forward: 'in cold war with', back: 'in cold war with' },
  trade_war: { forward: 'in trade war with', back: 'in trade war with' },
  uneasy_alliance: { forward: 'uneasily allied with', back: 'uneasily allied with' },
};

const readEdge = (type: string, forward: boolean) => {
  const known = EDGE_LABEL[type];
  if (known) return forward ? known.forward : known.back;
  return type.replace(/_/g, ' ');
};

/** A character's years, which live on the row as integers. */
function lifespan(row: CanonRow): string {
  const from = text(row, 'activeTimeframeStart', 'active_timeframe_start');
  const to = text(row, 'activeTimeframeEnd', 'active_timeframe_end');
  if (from && to) return `${from} to ${to}`;
  if (from) return `from ${from}`;
  return to ? `until ${to}` : '';
}

/**
 * The name as the index shows it, split from the house it repeats.
 *
 * The surname is only detached when the name actually ends with it. "Adelard
 * Zephyrine Senior" does not, so re-appending the house span produced
 * "Adelard Zephyrine Senior Zephyrine".
 */
const splitName = (person: CanonRow, house?: Lineage | null) => {
  const full = text(person, 'name');
  const surname = house?.name.split(' ').pop() ?? '';
  if (surname && full.endsWith(surname) && full.length > surname.length) {
    return { given: full.slice(0, full.length - surname.length).trim(), surname };
  }
  return { given: full, surname: '' };
};

const givenName = (person: CanonRow, house?: Lineage | null) => splitName(person, house).given;

const escapeForRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The searched words, marked where they appear. */
function Marked({ text: value, term }: { text: string; term: string }) {
  const needle = term.trim();
  if (!needle) return <>{value}</>;
  const parts = value.split(new RegExp(`(${escapeForRegExp(needle)})`, 'ig'));
  return (
    <>
      {parts.map((part, i) => (
        part.toLowerCase() === needle.toLowerCase()
          ? <mark className="editorial-mark" key={i}>{part}</mark>
          : <span key={i}>{part}</span>
      ))}
    </>
  );
}

/** An asset id as the harness writes it into prose: "(asset <uuid>, file.png)". */
const PROSE_ASSET = /asset\s+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;

/**
 * Reference art in the record: one plate at a time, with the rest as a strip
 * beneath it.
 *
 * Laying every asset out side by side wasted 79% of the row it sat in -- one
 * 144px image in 672px of column, with the identity it belongs to pushed below
 * it. A character can carry a portrait, a variant and their ship, and those are
 * alternatives to look at rather than a gallery to scan past.
 *
 * The plate is a fixed shape cropped from the upper part of the frame: art
 * arrives at whatever aspect it was drawn at, and letting each set its own
 * height makes the identity column jump as you switch between them.
 */
function Portrait({ assets, of }: { assets: MediaAsset[]; of: string }) {
  const [broken, setBroken] = useState<ReadonlySet<string>>(new Set());
  const [active, setActive] = useState(0);
  const shown = assets.filter((a) => !broken.has(a.id));
  if (shown.length === 0) return null;
  const current = shown[Math.min(active, shown.length - 1)];
  const describe = (a: MediaAsset) => a.caption || a.title || of;

  return (
    <figure className="editorial-record__portrait">
      <img
        className="editorial-portrait"
        src={current.url}
        alt={describe(current)}
        onError={() => setBroken((was) => new Set(was).add(current.id))}
      />
      {shown.length > 1 && (
        <div className="editorial-record__thumbs" role="group" aria-label={`Reference art for ${of}`}>
          {shown.map((asset, i) => (
            <button
              key={asset.id}
              type="button"
              className="editorial-button editorial-button--icon editorial-record__thumb"
              aria-pressed={asset.id === current.id}
              aria-label={describe(asset)}
              onClick={() => setActive(i)}
            >
              <img
                className="editorial-portrait"
                src={asset.url}
                alt=""
                aria-hidden="true"
                loading="lazy"
                onError={() => setBroken((was) => new Set(was).add(asset.id))}
              />
            </button>
          ))}
        </div>
      )}
      {shown.length > 1 && (
        <figcaption className="editorial-record__caption">{describe(current)}</figcaption>
      )}
    </figure>
  );
}

interface Tie { otherId: string; otherName: string; reads: string; family: boolean }

const FAMILY_TYPES = new Set(['parent', 'parent_of', 'child_of', 'ancestor', 'spouse',
  'sibling', 'family']);

/** The record: everything known about one person, in one place. */
function Record({
  person, ties, plates, term, house, nameRef, onChoose,
}: {
  person: CanonRow; ties: Tie[]; plates: MediaAsset[]; term: string;
  house: string; nameRef?: React.Ref<HTMLHeadingElement>; onChoose: (id: string) => void;
}) {
  const years = lifespan(person);
  const background = text(person, 'background');
  const description = text(person, 'description');
  const motivation = text(person, 'motivation');
  const tendencies = text(person, 'tendencies');
  const extra = description.trim() === background.trim() ? '' : description;
  const standing = [text(person, 'role'), house, years && `active ${years}`]
    .filter(Boolean).join(' · ');

  const sets: Array<[string, string[]]> = ([
    ['Traits', listOf(person, 'traits')],
    ['Core skills', listOf(person, 'coreSkills')],
    ['Notable moments', listOf(person, 'notableMoments')],
  ] as Array<[string, string[]]>).filter(([, v]) => v.length > 0);


  return (
    <article className="editorial-record" aria-labelledby="editorial-record-name">
      {/* Picture and identity together. The portrait used to sit alone on a row
          672px wide, wasting 528px of it, with the name pushed above and the
          relationships below. */}
      <div className="editorial-record__head" data-has-art={plates.length > 0 ? 'true' : undefined}>
        <Portrait assets={plates} of={text(person, 'name')} />

        <div className="editorial-record__identity">
          <div aria-live="polite">
            <h2 className="editorial-record__name" id="editorial-record-name" ref={nameRef} tabIndex={-1}>
              {text(person, 'name')}
            </h2>
            <p className="editorial-record__standing">{standing}</p>
          </div>

          {ties.length > 0 && (
            <ul className="editorial-ties">
              {ties.map((tie) => (
                <li className="editorial-ties__item" key={`${tie.reads}-${tie.otherId}`}>
                  <span className="editorial-ties__reads">{tie.reads}</span>{' '}
                  <button type="button" className="editorial-link" onClick={() => onChoose(tie.otherId)}>
                    {tie.otherName}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {background && <p className="editorial-record__prose"><Marked text={background} term={term} /></p>}
      {extra && <p className="editorial-record__prose"><Marked text={extra} term={term} /></p>}

      {(motivation || tendencies) && (
        <section className="editorial-record__section">
          {motivation && (
            <>
              <h3 className="editorial-record__label">Wants</h3>
              <p className="editorial-record__prose"><Marked text={motivation} term={term} /></p>
            </>
          )}
          {tendencies && (
            <>
              <h3 className="editorial-record__label">Tends to</h3>
              <p className="editorial-record__prose"><Marked text={tendencies} term={term} /></p>
            </>
          )}
        </section>
      )}

      {sets.map(([label, values]) => (
        <section className="editorial-record__section" key={label}>
          <h3 className="editorial-record__label">{label}</h3>
          <p className="editorial-record__prose">{values.join(', ')}</p>
        </section>
      ))}

      {isProtected(person) && (
        <p className="editorial-record__flag">
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
  const media = useAsync((signal) => editorialApi.listMedia(id, signal), [id]);
  const graph = useAsync((signal) => editorialApi.listRelationships(id, signal), [id]);

  // Held in the URL so a record is linkable and the back button works.
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
   * Which art belongs to whom. The subject on the asset is the real answer and
   * is tried first; the second path exists because the harness catalogues a
   * reference by writing it into the prose, and an asset recorded that way can
   * end up with no subject on its row. That sentence is a link the harness
   * itself wrote, so reading it is not a guess.
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
    /**
     * Which plate leads.
     *
     * media_assets has no notion of a primary image, so until it does the order
     * was whatever the rows came back in -- the right picture by luck rather
     * than by rule. The rule: hand-supplied reference before anything generated
     * from it, then the plate whose caption adds no qualifier, because that is
     * the canonical one and a variant is named for how it differs ("human
     * reference", "young", "unmasked"). Ties break on the caption so the answer
     * is the same on every load.
     */
    const qualifierWeight = (asset: MediaAsset) =>
      (asset.caption || asset.title || '').trim().split(/\s+/).filter(Boolean).length;

    const ordered = (found: MediaAsset[]) =>
      [...found].sort((a, b) =>
        (a.kind === 'reference' ? 0 : 1) - (b.kind === 'reference' ? 0 : 1)
        || qualifierWeight(a) - qualifierWeight(b)
        || (a.caption || a.title || '').localeCompare(b.caption || b.title || ''));

    return (person: CanonRow): MediaAsset[] => {
      const direct = bySubject.get(String(person.id));
      if (direct?.length) return ordered(direct);
      const prose = `${text(person, 'background')} ${text(person, 'description')}`;
      const seen = new Set<string>();
      const found: MediaAsset[] = [];
      for (const match of prose.matchAll(PROSE_ASSET)) {
        const assetId = match[1].toLowerCase();
        const asset = byAssetId.get(assetId);
        if (asset && !seen.has(assetId)) { seen.add(assetId); found.push(asset); }
      }
      return ordered(found);
    };
  }, [media.data]);

  /** Every edge touching a character, read from that character's end. */
  const tiesOf = useMemo(() => {
    const edges = (graph.data ?? []).filter(
      (e) => e.sourceEntityType === 'character' && e.targetEntityType === 'character',
    );
    const nameOf = (personId: string) =>
      (byId.get(personId) && text(byId.get(personId)!, 'name'))
      || memberOf.get(personId)?.name
      || personId;

    const index = new Map<string, Tie[]>();
    const add = (owner: string, tie: Tie) =>
      index.set(owner, [...(index.get(owner) ?? []), tie]);

    for (const edge of edges) {
      const [a, b] = [String(edge.sourceEntityId), String(edge.targetEntityId)];
      const family = FAMILY_TYPES.has(edge.relationshipType);
      add(a, { otherId: b, otherName: nameOf(b), reads: readEdge(edge.relationshipType, true), family });
      add(b, { otherId: a, otherName: nameOf(a), reads: readEdge(edge.relationshipType, false), family });
    }
    return index;
  }, [graph.data, byId, memberOf]);

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

  // The census speaks for the universe and is never narrowed by a filter.
  const totals = useMemo(() => tally(cast.data ?? []), [cast.data]);
  const counts = useMemo(
    () => tally((cast.data ?? []).filter((r) => !matches || matches.has(String(r.id)))),
    [cast.data, matches],
  );

  const principals = useMemo(
    () => new Set((cast.data ?? []).filter((r) => tierOf(r) === 'principal').map((r) => String(r.id))),
    [cast.data],
  );

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
    return [...byHouse.values()].sort((a, b) =>
      (a.house ? order.get(a.house.id) ?? 99 : 100) - (b.house ? order.get(b.house.id) ?? 99 : 100));
  }, [cast.data, tier, matches, houseOf, lineages]);

  const shown = groups.flatMap((g) => g.people);
  const missing = Boolean(chosenId && cast.data && !byId.has(chosenId));
  const chosen = (chosenId && byId.get(chosenId)) || shown[0];

  const castRef = useRef<HTMLElement | null>(null);
  const recordRef = useRef<HTMLHeadingElement | null>(null);
  const followed = useRef(false);

  useEffect(() => {
    if (!chosen) return;
    castRef.current
      ?.querySelector(`[data-person="${CSS.escape(String(chosen.id))}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [chosen]);

  // Following a relation unmounts the control that was clicked, which drops
  // focus to <body>; move it to the record that replaced it.
  useEffect(() => {
    if (!followed.current) return;
    followed.current = false;
    recordRef.current?.focus();
  }, [chosen]);

  const choose = (personId: string) => {
    followed.current = true;
    // Landing somewhere you cannot see is worse than not moving: widen the cast
    // and clear a query that would hide them.
    const person = byId.get(personId);
    const visible = person
      && (tier === 'all' || tierOf(person) === tier)
      && (!matches || matches.has(personId));
    update({ who: personId, cast: visible ? undefined : 'all', q: visible ? undefined : null });
  };

  /** The cast column is a list, so it takes list keys. */
  const typed = useRef({ buffer: '', at: 0 });
  const onCastKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const rows = [...(castRef.current?.querySelectorAll<HTMLElement>('[data-person]') ?? [])];
    if (rows.length === 0) return;
    const here = rows.indexOf(document.activeElement as HTMLElement);
    const step = (to: number) => {
      event.preventDefault();
      rows[Math.max(0, Math.min(rows.length - 1, to))]?.focus();
    };
    switch (event.key) {
      case 'ArrowDown': return step(here + 1);
      case 'ArrowUp': return step(here < 0 ? rows.length - 1 : here - 1);
      case 'Home': return step(0);
      case 'End': return step(rows.length - 1);
      default: break;
    }
    if (event.key.length !== 1 || event.metaKey || event.ctrlKey || event.altKey) return;
    const now = Date.now();
    typed.current.buffer = now - typed.current.at > 700 ? event.key : typed.current.buffer + event.key;
    typed.current.at = now;
    const needle = typed.current.buffer.toLowerCase();
    const from = here < 0 ? 0 : here + (typed.current.buffer.length > 1 ? 0 : 1);
    const order = [...rows.slice(from), ...rows.slice(0, from)];
    const hit = order.find((el) => (el.dataset.name ?? '').toLowerCase().startsWith(needle));
    if (hit) step(rows.indexOf(hit));
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

  return (
    <Surface name="characters">
      {/* On a narrow screen this is one column, so the cast and the record
          cannot both be on it: the record would sit below sixty-six rows. The
          list is the view until you choose someone, and the record is the view
          after that, with a way back. Above 900px both are always present and
          this attribute does nothing. */}
      <div className="editorial-family-workspace" data-mobile-view={chosenId ? 'record' : 'cast'}>
        <header className="editorial-surface__fixed">
          <h1 className="editorial-census">
            <em>{spell(totals.principal)}</em> {totals.principal === 1 ? 'principal carries' : 'principals carry'} this universe
            {totals.supporting > 0 && `, ${spell(totals.supporting).toLowerCase()} more stand behind them`}
            {totals.background > 0 && `, and ${spell(totals.background).toLowerCase()} wait at the edges`}.
          </h1>

          <div className="editorial-cast-tiers">
            <div className="editorial-cast-tiers__group" role="group" aria-label="Which cast">
              {([...TIERS, 'all'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className="editorial-button editorial-button--toggle"
                  aria-pressed={tier === t}
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
        </header>

        {shown.length === 0 ? (
          <p className="editorial-cast-nobody">
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
          <div className="editorial-panes">
            <nav
              className="editorial-pane editorial-pane--cast"
              ref={castRef}
              aria-label={`The cast, ${shown.length} ${shown.length === 1 ? 'person' : 'people'}`}
              onKeyDown={onCastKeyDown}
            >
              {groups.map((group, gi) => (
                <section key={group.house?.id ?? `unaffiliated-${gi}`}>
                  <h2 className="editorial-house">{group.house?.name ?? 'Unaffiliated'}</h2>
                  {group.people.map((person) => {
                    const personId = String(person.id);
                    const { given, surname } = splitName(person, group.house);
                    const selected = chosen && String(chosen.id) === personId;
                    // How they stand to the principals, which is what makes a
                    // name in a list mean something.
                    const toPrincipals = (tiesOf.get(personId) ?? [])
                      .filter((t) => principals.has(t.otherId) && t.otherId !== personId);
                    return (
                      <button
                        key={personId}
                        type="button"
                        data-person={personId}
                        data-name={given}
                        tabIndex={selected ? 0 : -1}
                        className="editorial-button editorial-button--row"
                        aria-pressed={selected}
                        onClick={() => update({ who: personId })}
                      >
                        <span className="editorial-cast-row__text">
                          <span className="editorial-cast-row__name">
                            <Marked text={given} term={query} />
                            {surname && <span className="editorial-cast-row__house"> {surname}</span>}
                          </span>
                          <span className="editorial-cast-row__role">
                            <Marked text={text(person, 'role')} term={query} />
                          </span>
                          {toPrincipals.length > 0 && (
                            <span className="editorial-cast-row__ties">
                              {toPrincipals.slice(0, 2).map((t) => `${t.reads} ${t.otherName}`).join(' · ')}
                              {/* "+3" said nothing: a bare number beside two names
                                  does not read as "three more relationships". */}
                              {toPrincipals.length > 2
                                && ` · and ${toPrincipals.length - 2} more`}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </section>
              ))}
            </nav>

            <div className="editorial-pane editorial-pane--record">
              <button
                type="button"
                className="editorial-button editorial-button--ghost editorial-back-to-cast"
                onClick={() => update({ who: null })}
              >
                ← The cast
              </button>
              {missing && (
                <p className="editorial-cast-notice" role="status">
                  No character is recorded under “{chosenId}”. Showing{' '}
                  {chosen ? text(chosen, 'name') : 'the first entry'} instead.
                </p>
              )}
              {chosen && (
                <Record
                  person={chosen}
                  ties={tiesOf.get(String(chosen.id)) ?? []}
                  plates={platesFor(chosen)}
                  term={query}
                  house={houseOf.get(String(chosen.id))?.name ?? ''}
                  nameRef={recordRef}
                  onChoose={choose}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </Surface>
  );
}
