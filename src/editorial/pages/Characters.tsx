import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  editorialApi, type CanonRow, type DerivativeWork, type Lineage, type LineageMember,
  type MediaAsset,
} from '../api';
import type { CanonRequest } from '../api';
import { RecordFields } from '../components/RecordFields';
import { buildTies, tieKey, type Tie } from '../ties';
import { useAsync, useRefreshWhile } from '../useAsync';
import { ErrorState, LoadingState } from '../components/StateViews';
import Surface from '../components/Surface';
import { isProtected, text } from '../canonFields';

type Tier = 'principal' | 'supporting' | 'background';
const TIERS: Tier[] = ['principal', 'supporting', 'background'];

const tierOf = (row: CanonRow): Tier => {
  const raw = text(row, 'importance').toLowerCase();
  return (TIERS as string[]).includes(raw) ? (raw as Tier) : 'supporting';
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

/**
 * A span the canon says does not close, as opposed to one nobody has finished
 * writing. Both arrive as a missing end year, and the difference matters: an
 * unknown end means a year cannot rule somebody out, while an unending one
 * means every year after they begin has them in it.
 */
const isUnending = (person: CanonRow) => text(person, 'activeTimeframeOpen') === 'true'
  || (person as { activeTimeframeOpen?: unknown }).activeTimeframeOpen === true;

/** A character's years, which live on the row as integers. */
function lifespan(row: CanonRow): string {
  const from = text(row, 'activeTimeframeStart', 'active_timeframe_start');
  const to = text(row, 'activeTimeframeEnd', 'active_timeframe_end');
  // "onward" rather than "from", because the two say different things: one is
  // a span with no end, the other a span whose end nobody has written down.
  if (from && isUnending(row)) return `${from} onward`;
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

/**
 * How the cast can be arranged, and what each arrangement needs to exist.
 *
 * A dimension is offered only when the canon can answer it. Several worth
 * having cannot be answered at all in this data: no character carries a
 * location, and only one in nine has an end year, so "who was in the harbour in
 * 538" and "who was alive in the second century" are questions about canon that
 * has not been written rather than views that have not been built. Saying so on
 * the control is more use than leaving them off it, because it names what to fix.
 */
type Grouping = 'house' | 'era' | 'allegiance' | 'location';

const GROUPING_LABEL: Record<Grouping, string> = {
  house: 'House',
  era: 'Century active',
  allegiance: 'Allegiance',
  location: 'Location',
};

/**
 * Read out of the label map rather than written again. Adding a dimension
 * meant touching four lists, and the URL's was the one that got missed: the
 * chip existed, the grouping worked, and `by=location` was dropped on the way
 * in, so the control could not hold the state it set.
 */
const isGrouping = (value: string): value is Grouping => value in GROUPING_LABEL;

/**
 * A step area over a series, in a viewBox of `series.length` by 100, with the
 * floor at the bottom. Stepped rather than smoothed, because each value is one
 * year's count and interpolating between them would draw people who are not
 * there.
 */
function areaPoints(series: number[], peak: number): string {
  if (!series.length || peak <= 0) return '';
  const points: string[] = ['0,100'];
  series.forEach((n, i) => {
    const y = 100 - (n / peak) * 100;
    points.push(`${i},${y}`, `${i + 1},${y}`);
  });
  points.push(`${series.length},100`);
  return points.join(' ');
}

/** A year to the century it falls in: 120 is the second century. */
const centuryOf = (year: number) => Math.floor(year / 100) + 1;
const ordinal = (n: number) => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
};

interface RosterEntry { person: CanonRow; tier: Tier; billing: number }

/** A dimension and which way round its groups run. */
interface GroupBy { dimension: Grouping; descending: boolean }

interface Section {
  id: string;
  label: string;
  entries: RosterEntry[];
  groups: Section[];
}

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

/** The record: everything known about one person, in one place. */
function Record({
  person, ties, plates, term, house, nameRef, onChoose, onSaved,
  universeId, request, onAsked,
}: {
  person: CanonRow; ties: Tie[]; plates: MediaAsset[]; term: string;
  house: string; nameRef?: React.Ref<HTMLHeadingElement>; onChoose: (id: string) => void;
  onSaved: () => void;
  universeId: string; request?: CanonRequest; onAsked: () => void;
}) {
  const years = lifespan(person);
  const standing = [text(person, 'role'), house, years && `active ${years}`]
    .filter(Boolean).join(' · ');

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
                <li className="editorial-ties__item" key={tieKey(tie)}>
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

      <RecordFields
        person={person}
        term={term}
        marked={(text) => <Marked text={text} term={term} />}
        onSaved={onSaved}
        universeId={universeId}
        request={request}
        onAsked={onAsked}
      />

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
  /**
   * Canon somebody has asked for. Loaded once for the universe rather than per
   * record: the panel needs to know whether the person in front of it has an
   * outstanding request, and asking the server that on every selection would
   * be a request per click to answer a question about a handful of rows.
   */
  const canonRequests = useAsync((signal) => editorialApi.listCanonRequests(id, signal), [id]);
  // While anything has been asked for and not yet answered, keep looking: the
  // answer is written by something else, and the page has no other way to know.
  useRefreshWhile(
    (canonRequests.data ?? []).some((row) => !row.payload?.proposed),
    canonRequests.retry,
  );
  const requestFor = useMemo(() => new Map(
    (canonRequests.data ?? [])
      .filter((row) => row.payload?.characterId)
      .map((row) => [String(row.payload.characterId), row]),
  ), [canonRequests.data]);
  const works = useAsync((signal) => editorialApi.listWorks(id, signal), [id]);
  const factions = useAsync((signal) => editorialApi.listFactions(id, signal), [id]);
  const universe = useAsync((signal) => editorialApi.getUniverse(id, signal), [id]);

  // Held in the URL so a record is linkable and the back button works.
  const tier = (params.get('cast') ?? 'principal') as Tier | 'all';
  const query = params.get('q') ?? '';
  /**
   * "Alive in a year" is a filter, not a grouping, so it does not live in the
   * chip row. Grouping asks what to cut the cast by; this asks which cast to
   * cut. They compose -- location grouped, year filtered, is "who was at the
   * Ghost Hulk in 250" -- and pretending the second was the first is what put
   * a control that cannot group among the ones that do.
   */
  const yearParam = params.get('year');
  const year = yearParam !== null && /^-?\d+$/.test(yearParam) ? Number(yearParam) : null;
  const chosenId = params.get('who');
  /**
   * The work the cast is ordered for.
   *
   * The universe holds the answer, because it is a fact about the universe
   * rather than about one tab: held only in a URL it would differ between
   * windows and be forgotten on reload. `work` in the URL overrides it for a
   * shared link without changing what the universe is focused on -- and
   * `work=` explicitly asks for no work at all, which is not the same as
   * asking nothing.
   */
  const activeWorkId = universe.data?.activeWorkId ?? '';
  const workId = params.has('work') ? (params.get('work') ?? '') : activeWorkId;

  /**
   * The default arrangement depends on what is being looked at. A work's
   * principals are a running order, and grouping them by house destroys the
   * thing that makes them a cast; the rest of a universe is a population, and a
   * flat list of fifty-six people is what needed organising.
   */
  /**
   * Several dimensions at once, nested in the order they are listed, each with
   * its own direction: `by=era:desc,house` is centuries newest first, and each
   * century broken into houses. The order is the nesting and the nesting is
   * the meaning, so it is chosen rather than inherited from whichever chip was
   * pressed first.
   */
  const defaultGrouping: GroupBy[] = workId && tier === 'principal' ? [] : [{ dimension: 'house', descending: false }];
  const byParam = params.get('by');
  const grouping: GroupBy[] = byParam === null
    ? defaultGrouping
    : byParam.split(',').map((part) => {
      const [dimension, direction] = part.split(':');
      return { dimension: dimension as Grouping, descending: direction === 'desc' };
    }).filter((g) => isGrouping(g.dimension));

  const writeGrouping = (next: GroupBy[]) => update({
    by: next.map((g) => (g.descending ? `${g.dimension}:desc` : g.dimension)).join(','),
  });

  const toggleGrouping = (dimension: Grouping) => {
    writeGrouping(grouping.some((g) => g.dimension === dimension)
      ? grouping.filter((g) => g.dimension !== dimension)
      : [...grouping, { dimension, descending: false }]);
  };

  /** Move a dimension one place earlier, which moves it one level out. */
  const promoteGrouping = (dimension: Grouping) => {
    const at = grouping.findIndex((g) => g.dimension === dimension);
    if (at <= 0) return;
    const next = [...grouping];
    [next[at - 1], next[at]] = [next[at], next[at - 1]];
    writeGrouping(next);
  };

  const flipGrouping = (dimension: Grouping) => writeGrouping(grouping.map((g) => (
    g.dimension === dimension ? { ...g, descending: !g.descending } : g
  )));

  const billing = useAsync(
    (signal) => (workId ? editorialApi.listWorkCast(workId, signal) : Promise.resolve([])),
    [workId],
  );

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

    return buildTies(edges, nameOf);
  }, [graph.data, byId, memberOf]);

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return null;
    return new Set((cast.data ?? [])
      .filter((r) => `${text(r, 'name')} ${text(r, 'role')} ${text(r, 'description')}`
        .toLowerCase().includes(term))
      .map((r) => String(r.id)));
  }, [cast.data, query]);

  /**
   * The running order, and who counts as a principal in it.
   *
   * Importance is not a fact about a character. A universe read as one cast
   * with one hierarchy, so a story about Malakor could not put Malakor first
   * and a house he happens to belong to decided where he appeared.
   *
   * With a work selected, the work's own billing decides both order and
   * importance -- work_characters.importance overrides the character's own,
   * null meaning "however this character is normally recorded". A work billing
   * fewer than ten people has no supporting cast worth the name, so all of
   * them are principals.
   *
   * With no work selected there is no author's running order to read, so the
   * canon graph stands in for one: the most connected characters are the ones
   * the universe is about. The same ten-person rule applies to the universe.
   */
  const roster = useMemo(() => {
    const everyone = cast.data ?? [];
    const linkCount = (personId: string) => (tiesOf.get(personId) ?? []).length;
    const byConnection = (a: CanonRow, b: CanonRow) =>
      linkCount(String(b.id)) - linkCount(String(a.id))
      || text(a, 'name').localeCompare(text(b, 'name'));

    const billed = billing.data ?? [];
    const billedById = new Map(billed.map((m) => [String(m.characterId), m]));

    if (workId && billed.length > 0) {
      const inWork = billed
        .map((m) => byId.get(String(m.characterId)))
        .filter(Boolean) as CanonRow[];
      const inWorkIds = new Set(inWork.map((r) => String(r.id)));

      // Everyone the work does not name is still in the universe and still has
      // to be reachable. Selecting a story narrows what leads, not what exists:
      // billing the cast of one chapter must not make sixty other characters
      // unreachable from the surface that lists the characters.
      const elsewhere = everyone
        .filter((r) => !inWorkIds.has(String(r.id)))
        .sort(byConnection);

      const smallCast = inWork.length < 10;
      const tierFor = (person: CanonRow): Tier => {
        if (!inWorkIds.has(String(person.id))) {
          // Not in this work, so not a principal of it, whatever the character
          // row says. They keep whatever else they are recorded as.
          const stored = tierOf(person);
          return stored === 'principal' ? 'supporting' : stored;
        }
        if (smallCast) return 'principal';
        const declared = billedById.get(String(person.id))?.workImportance;
        return declared && (TIERS as string[]).includes(declared)
          ? (declared as Tier) : tierOf(person);
      };

      return [
        ...inWork.map((person, i) => ({ person, tier: tierFor(person), billing: i + 1 })),
        ...elsewhere.map((person) => ({ person, tier: tierFor(person), billing: 0 })),
      ];
    }

    const ordered = [...everyone].sort(byConnection);
    const smallUniverse = ordered.length < 10;
    const leading = new Set(ordered.slice(0, 10).map((r) => String(r.id)));
    const tierFor = (person: CanonRow): Tier => {
      if (smallUniverse || leading.has(String(person.id))) return 'principal';
      // Links decide who leads, so a stored 'principal' outside the ten does
      // not get to keep the billing -- that put eleven principals in a set of
      // ten and made the rule unreadable from the screen.
      const stored = tierOf(person);
      return stored === 'principal' ? 'supporting' : stored;
    };
    return ordered.map((person) => ({ person, tier: tierFor(person), billing: 0 }));
  }, [cast.data, byId, tiesOf, billing.data, workId]);

  const tally = (entries: Array<{ tier: Tier }>) => ({
    all: entries.length,
    principal: entries.filter((e) => e.tier === 'principal').length,
    supporting: entries.filter((e) => e.tier === 'supporting').length,
    background: entries.filter((e) => e.tier === 'background').length,
  });

  /**
   * Both count sets are scoped to whatever the running order is for. A work
   * billing three people has three principals, not the universe's six, and
   * filters saying otherwise made the surface describe a cast it was not
   * showing.
   */
  const totals = useMemo(() => tally(roster), [roster]);

  /**
   * Active in a given year: the year falls inside the recorded span. A missing
   * end year is an open span rather than a closed one -- somebody recorded as
   * active from 164 with no end is not evidence they stopped in 164 -- so the
   * only people a year excludes are the ones the canon can place outside it.
   */
  const inYear = useMemo(() => {
    if (year === null) return null;
    return (person: CanonRow) => {
      const from = Number(text(person, 'activeTimeframeStart'));
      if (!Number.isFinite(from)) return false;
      if (year < from) return false;
      // Unending, by canon rather than by omission: no year after they begin
      // can rule them out, so every later year has them in it.
      if (isUnending(person)) return true;
      const to = Number(text(person, 'activeTimeframeEnd'));
      return !Number.isFinite(to) || year <= to;
    };
  }, [year]);

  const counted = useMemo(
    () => roster.filter((r) => (!matches || matches.has(String(r.person.id)))
      && (!inYear || inYear(r.person))), [roster, matches, inYear],
  );
  const counts = useMemo(() => tally(counted), [counted]);
  const listed = useMemo(
    () => counted.filter((r) => tier === 'all' || r.tier === tier), [counted, tier],
  );
  const shown = listed.map((r) => r.person);
  const activeWork = (works.data ?? []).find((w) => w.id === workId);

  /** The census as one string, for the heading's accessible name. */
  const censusSentence = useMemo(() => {
    const opens = `${spell(totals.principal)} `
      + `${totals.principal === 1 ? 'principal carries' : 'principals carry'} `
      + `${activeWork ? activeWork.title : 'this universe'}`;
    if (activeWork) return `${opens}, of ${spell(totals.all).toLowerCase()} recorded in this universe.`;
    const behind = totals.supporting > 0
      ? `, ${spell(totals.supporting).toLowerCase()} more stand behind them` : '';
    const edges = totals.background > 0
      ? `, and ${spell(totals.background).toLowerCase()} wait at the edges` : '';
    return `${opens}${behind}${edges}.`;
  }, [totals, activeWork]);

  /**
   * Where a character stands WITH a faction -- not merely near one.
   *
   * There is no membership anywhere: factions carry no member list and
   * characters carry no faction, so the only thing the canon records is the
   * edges between the two. Reading all of them as allegiance filed Malakor
   * under the Vander-Thorne Cartel, whom he is in a feud with over his wife's
   * death, because a feud happened to be the last edge in the list.
   *
   * Being at war with somebody is not belonging to them. Only edges that mean
   * alignment count; conflict is left out, and it is already legible in the
   * record's own relationships. Where somebody stands with more than one, the
   * faction is chosen by name so the answer does not depend on row order.
   */
  const allegianceOf = useMemo(() => {
    const ALIGNED = new Set(['uneasy_alliance', 'allied', 'ally', 'alliance',
      'member_of', 'sworn_to', 'serves', 'loyal_to', 'patron_of']);
    const factionName = new Map((factions.data ?? []).map((f) => [String(f.id), text(f, 'name')]));
    const found = new Map<string, string[]>();
    for (const edge of graph.data ?? []) {
      if (!ALIGNED.has(edge.relationshipType)) continue;
      const [a, b] = [String(edge.sourceEntityId), String(edge.targetEntityId)];
      const [person, faction] = edge.sourceEntityType === 'character' ? [a, b] : [b, a];
      if (!factionName.has(faction)) continue;
      found.set(person, [...(found.get(person) ?? []), factionName.get(faction)!]);
    }
    return new Map([...found].map(([person, names]) => [person, [...names].sort()[0]]));
  }, [graph.data, factions.data]);

  /**
   * Which arrangements this canon can actually answer, with the reason when it
   * cannot. A control that silently omits a dimension teaches nothing; one that
   * shows it greyed with a count says what the universe is missing.
   */
  const groupings = useMemo(() => {
    const people = cast.data ?? [];
    const withHouse = people.filter((r) => houseOf.has(String(r.id))).length;
    const withYear = people.filter((r) => Number.isFinite(Number(text(r, 'activeTimeframeStart')))).length;
    const withAllegiance = people.filter((r) => allegianceOf.has(String(r.id))).length;
    const withLocation = people.filter((r) => text(r, 'location')
      || text(r, 'currentLocationId')).length;
    return [
      { id: 'house' as Grouping, available: withHouse > 0, note: `${withHouse} of ${people.length}` },
      { id: 'era' as Grouping, available: withYear > 0, note: `${withYear} of ${people.length}` },
      {
        id: 'allegiance' as Grouping,
        available: withAllegiance > 0,
        note: withAllegiance > 0
          ? `${withAllegiance} of ${people.length}`
          : 'no character is tied to a faction',
      },
      /* Offered as absences rather than hidden, because each names a gap in
         the canon rather than a gap in this surface.

         Neither is in the Grouping union: there is no code to group by them,
         so `available` stays false regardless of the data. What is measured is
         the REASON. Both notes were written by hand, which meant they would go
         on asserting an empty canon after somebody filled it in, and the note
         is the only thing on the control that explains the strike-through. */
      {
        id: 'location' as Grouping,
        available: withLocation > 0,
        note: withLocation > 0
          ? `${withLocation} of ${people.length}`
          : `no character has a location recorded, though ${people.length} could`,
      },

    ];
  }, [cast.data, houseOf, allegianceOf]);

  /**
   * What the recorded spans can actually answer, for the year filter to say.
   * A character with no end year has an open span, so a year can only ever
   * place them, never exclude them -- which is worth admitting on the control
   * rather than letting the count read as certainty.
   */
  const spans = useMemo(() => {
    const people = cast.data ?? [];
    const years = people
      .map((r) => Number(text(r, 'activeTimeframeStart')))
      .filter((n) => Number.isFinite(n));
    const ends = people
      .map((r) => Number(text(r, 'activeTimeframeEnd')))
      .filter((n) => Number.isFinite(n));
    const unending = people.filter((r) => isUnending(r)).length;
    const from = years.length ? Math.min(...years) : null;
    // The last year the canon actually reaches. An unending span has no last
    // year of its own, but the scrubber still has to end somewhere, and where
    // everybody else stops is the honest place: the unending are present at
    // every year on it anyway.
    const last = ends.length || years.length
      ? Math.max(...ends, ...years) : null;

    /**
     * How many people are active in each year of that range.
     *
     * The control was a number field, which asked for a year while saying
     * nothing about which years there were or where anybody was -- so the
     * answer to "when was this universe busy" was to guess, type, and read the
     * count. Drawn, it is the shape of the cast over time, and picking a year
     * is pointing at it.
     */
    const density: number[] = [];
    if (from !== null && last !== null) {
      for (let y = from; y <= last; y += 1) {
        density.push(people.filter((r) => {
          const start = Number(text(r, 'activeTimeframeStart'));
          if (!Number.isFinite(start) || y < start) return false;
          if (isUnending(r)) return true;
          const end = Number(text(r, 'activeTimeframeEnd'));
          return !Number.isFinite(end) || y <= end;
        }).length);
      }
    }
    const peak = density.length ? Math.max(...density) : 0;
    return {
      total: people.length,
      closed: ends.length,
      unending,
      // Neither closed nor deliberately open: nobody has finished writing it.
      unknown: people.length - ends.length - unending,
      from,
      last,
      density,
      peak,
      // Where the cast is thickest. The slider rests here when no year is
      // chosen, so the first nudge of an arrow key lands somewhere with people
      // in it rather than at the empty edge of the range.
      busiest: peak > 0 && from !== null ? from + density.indexOf(peak) : null,
    };
  }, [cast.data]);

  /** The dimensions the canon cannot answer, and why. */
  const unavailable = useMemo(() => groupings.filter((g) => !g.available), [groupings]);

  /**
   * The cast, cut by every dimension chosen, nested in the order they were
   * chosen. Recursive because "house then century" is houses each broken into
   * periods, not a flat list of house-century pairs -- the second reads as
   * arbitrary and loses the house as a thing you can see the size of.
   */
  /** The chips, in the order they take effect. */
  const orderedGroupings = useMemo(() => {
    const rank = (id: string) => {
      const at = grouping.findIndex((g) => g.dimension === id);
      return at === -1 ? grouping.length + groupings.findIndex((o) => o.id === id) : at;
    };
    return [...groupings].sort((a, b) => rank(a.id) - rank(b.id));
  }, [groupings, grouping]);

  const sections = useMemo(() => {
    const bucket = (entry: RosterEntry, dimension: Grouping) => {
      const personId = String(entry.person.id);
      if (dimension === 'house') {
        const house = houseOf.get(personId);
        return { key: house?.id ?? '', label: house?.name ?? 'Unaffiliated', sort: 0 };
      }
      if (dimension === 'era') {
        const year = Number(text(entry.person, 'activeTimeframeStart'));
        if (!Number.isFinite(year)) return { key: '', label: 'No years recorded', sort: 0 };
        const century = centuryOf(year);
        return { key: String(century), label: `${ordinal(century)} century`, sort: century };
      }
      if (dimension === 'location') {
        // The name is carried on the character beside the id, so grouping by
        // where somebody is does not need the geography catalogue fetched as
        // well. The id is the key, so two places that share a name stay apart.
        const where = text(entry.person, 'location');
        const at = text(entry.person, 'currentLocationId') || where;
        return { key: where ? at : '', label: where || 'No location recorded', sort: 0 };
      }
      const allegiance = allegianceOf.get(personId);
      return { key: allegiance ?? '', label: allegiance ?? 'No allegiance recorded', sort: 0 };
    };

    const split = (entries: RosterEntry[], dims: GroupBy[], path: string): Section[] => {
      if (dims.length === 0) return [];
      const [{ dimension, descending }, ...rest] = dims;
      const order: string[] = [];
      const buckets = new Map<string, { key: string; label: string; sort: number; entries: RosterEntry[] }>();
      for (const entry of entries) {
        const { key, label, sort } = bucket(entry, dimension);
        if (!buckets.has(label)) { buckets.set(label, { key, label, sort, entries: [] }); order.push(label); }
        buckets.get(label)!.entries.push(entry);
      }
      // Whatever has no answer sits last: it is a remainder, not a category.
      const named = order.filter((l) => buckets.get(l)!.key !== '');
      const unnamed = order.filter((l) => buckets.get(l)!.key === '');
      // A dimension with a natural order gets it; the rest keep the order the
      // roster put them in, which is the running order or the graph.
      if (dimension === 'era') named.sort((a, b) => buckets.get(a)!.sort - buckets.get(b)!.sort);
      if (descending) named.reverse();
      return [...named, ...unnamed].map((label) => {
        const b = buckets.get(label)!;
        const id = `${path}/${dimension}:${b.key || 'none'}`;
        return { id, label: b.label, entries: b.entries, groups: split(b.entries, rest, id) };
      });
    };

    if (grouping.length === 0) return [{ id: 'all', label: '', entries: listed, groups: [] }];
    return split(listed, grouping, '');
  }, [listed, grouping, houseOf, allegianceOf]);

  /**
   * What a group says about itself when it is shut.
   *
   * A count alone does not tell you whether to open it. The span of years its
   * people were active does, and every character has a start year, so it is
   * the one fact always available.
   */
  const summarise = (entries: RosterEntry[]) => {
    // The span the group covers: earliest anybody starts to latest anybody
    // stops. It read the start years at both ends, which was the only thing
    // available while seven people in sixty-six had an end year -- but it
    // printed as a range, so a group of people active from 164 to 504 said
    // "164 to 292" and meant "the years they each began".
    const starts = entries
      .map((e) => Number(text(e.person, 'activeTimeframeStart')))
      .filter((y) => Number.isFinite(y));
    const ends = entries
      .map((e) => Number(text(e.person, 'activeTimeframeEnd')))
      .filter((y) => Number.isFinite(y));
    const people = `${entries.length} ${entries.length === 1 ? 'person' : 'people'}`;
    if (starts.length === 0) return people;
    const from = Math.min(...starts);
    // One unending member and the group has no last year: it reaches from its
    // earliest start to whenever the story goes.
    if (entries.some((e) => isUnending(e.person))) return `${people} · ${from} onward`;
    const to = ends.length === entries.length ? Math.max(...ends) : null;
    if (to === null) {
      // Some spans are still open, so the group has no closing year to give.
      const latest = Math.max(...starts);
      return from === latest ? `${people} · from ${from}` : `${people} · from ${from} to ${latest}`;
    }
    return from === to ? `${people} · ${from}` : `${people} · ${from} to ${to}`;
  };

  const missing = Boolean(chosenId && cast.data && !byId.has(chosenId));
  const chosen = (chosenId && byId.get(chosenId)) || shown[0];

  /**
   * When the grouping order changes the chips change places, and a control that
   * teleports makes you re-read the row to find out what happened. Their old
   * positions are measured before the paint and each one is animated from where
   * it was, so the eye can follow the thing it just moved.
   */
  const chipRowRef = useRef<HTMLElement | null>(null);
  const chipRefs = useRef(new Map<string, HTMLElement | null>());
  const chipPositions = useRef(new Map<string, number>());
  const groupingKey = grouping.map((g) => `${g.dimension}:${g.descending}`).join(',');

  const lastGroupingKey = useRef<string | null>(null);

  /**
   * Runs after every commit rather than only when the order changes. The chips
   * do not exist on the first commit -- the cast is still loading and the
   * surface is a spinner -- so an effect keyed on the order alone recorded
   * nothing, and every later move measured against a blank slate and sat still.
   */
  useLayoutEffect(() => {
    const moved = lastGroupingKey.current !== null && lastGroupingKey.current !== groupingKey;
    lastGroupingKey.current = groupingKey;

    const reduced = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const previous = chipPositions.current;
    const next = new Map<string, number>();

    for (const [id, element] of chipRefs.current) {
      if (!element) continue;
      const { left } = element.getBoundingClientRect();
      next.set(id, left);
      const before = previous.get(id);
      if (!moved || reduced || before === undefined || Math.abs(before - left) < 1) continue;
      element.animate(
        [{ transform: `translateX(${before - left}px)` }, { transform: 'none' }],
        { duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      );
    }
    chipPositions.current = next;
  });

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

  /**
   * Long lists arrive shut.
   *
   * Sixty-six names under five headings is the same wall the grouping was
   * meant to break up. Above a screenful the groups close, each saying enough
   * about itself to decide whether to open it. The group holding whoever is
   * being read stays open, or selecting somebody would hide them.
   */
  const collapseByDefault = listed.length > 20 && grouping.length > 0;
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const holdsChosen = (group: Section) =>
    Boolean(chosen) && group.entries.some((e) => String(e.person.id) === String(chosen.id));
  const isOpen = (group: Section) =>
    toggled[group.id] ?? (!collapseByDefault || holdsChosen(group));

  const renderRows = (group: Section) => group.entries.map(({ person, billing: place }, position) => {
    const personId = String(person.id);
    const house = houseOf.get(personId) ?? null;
    const { given, surname } = splitName(person, house);
    const selected = chosen && String(chosen.id) === personId;
    // Where the work's cast ends and the rest of the universe begins. Only
    // meaningful in a running order: a grouping already says why a name is
    // where it is.
    const firstBeyond = grouping.length === 0
      && place === 0 && (group.entries[position - 1]?.billing ?? 0) > 0;
    return (
      <Fragment key={personId}>
        {firstBeyond && <h2 className="editorial-house">Elsewhere in this universe</h2>}
        <button
          type="button"
          data-person={personId}
          data-name={given}
          tabIndex={selected ? 0 : -1}
          className="editorial-button editorial-button--row"
          aria-pressed={selected}
          onClick={() => update({ who: personId })}
        >
          {/* Always present, so a numbered row and an unnumbered one start their
              names at the same place. Without the empty gutter the list has two
              left edges depending on whether a work happens to bill somebody. */}
          <span className="editorial-cast-row__billing">{place > 0 ? place : ''}</span>
          <span className="editorial-cast-row__text">
            <span className="editorial-cast-row__name">
              <Marked text={given} term={query} />
              {surname && <span className="editorial-cast-row__house"> {surname}</span>}
            </span>
            <span className="editorial-cast-row__role">
              <Marked text={text(person, 'role')} term={query} />
            </span>
          </span>
        </button>
      </Fragment>
    );
  });

  const renderGroup = (group: Section, depth: number): React.ReactNode => {
    if (!group.label) return <Fragment key={group.id}>{renderRows(group)}</Fragment>;
    const open = isOpen(group);
    return (
      <section className="editorial-cast-group" data-depth={depth} key={group.id}>
        <h2 className="editorial-house">
          <button
            type="button"
            className="editorial-button editorial-button--ghost editorial-house__toggle"
            aria-expanded={open}
            onClick={() => setToggled((was) => ({ ...was, [group.id]: !open }))}
          >
            <span className="editorial-house__mark" aria-hidden="true" data-open={open || undefined} />
            <span className="editorial-house__name">{group.label}</span>
            <span className="editorial-house__summary">{summarise(group.entries)}</span>
          </button>
        </h2>
        {open && (group.groups.length > 0
          ? group.groups.map((child) => renderGroup(child, depth + 1))
          : renderRows(group))}
      </section>
    );
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
          {/* Named explicitly, because the work is chosen from inside the
              sentence and a <select> contributes every one of its options to
              the heading its contents would otherwise compose: the accessible
              name read "Ten principals carry this universethis universeThe
              Harrowed VeilChapter 5..." through all nine works. The label is
              the sentence as a reader hears it; the select is still in the
              tree beneath it, as a combobox with its own label. */}
          <h1 className="editorial-census" aria-label={censusSentence}>
            <em>{spell(totals.principal)}</em> {totals.principal === 1 ? 'principal carries' : 'principals carry'}{' '}
            {/* The work is chosen here rather than in the toolbar below. The
                sentence already names it, and what it names is not a property
                of this list -- it is what the whole universe is focused on, so
                a control for it sitting among the controls that arrange one
                column was reading a level too low. */}
            <span className="editorial-census__pick">
              <cite className="editorial-census__work" aria-hidden="true">
                {activeWork ? activeWork.title : 'this universe'}
              </cite>
              <select
                className="editorial-census__select"
                aria-label="Which work the cast is ordered for"
                value={workId}
                onChange={(e) => {
                  const next = e.target.value;
                  // Choosing here changes what the universe is focused on, not
                  // just what this tab shows.
                  void editorialApi.setActiveWork(id, next || null).then(() => universe.retry());
                  update({ work: next, who: null });
                }}
              >
                {/* No work selected is a real answer, not an empty one: the
                    canon graph decides the order instead. */}
                <option value="">this universe</option>
                {(works.data ?? []).map((work: DerivativeWork) => (
                  <option key={work.id} value={work.id}>{work.title || 'Untitled work'}</option>
                ))}
              </select>
            </span>
            {activeWork
              ? `, of ${spell(totals.all).toLowerCase()} recorded in this universe.`
              : (
                <>
                  {totals.supporting > 0 && `, ${spell(totals.supporting).toLowerCase()} more stand behind them`}
                  {totals.background > 0 && `, and ${spell(totals.background).toLowerCase()} wait at the edges`}.
                </>
              )}
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

        {/* The controls are outside this branch on purpose.

            They used to live inside it, so narrowing the cast to nobody
            unmounted the thing doing the narrowing: typing a second digit into
            the year took the field out of the document mid-keystroke, focus
            fell to the body, and the filter could not be edited at all. A
            control that can empty a list has to outlive the empty list. */}
          <>
            <div className="editorial-cast-controls">
            <div className="editorial-cast-controls__inner">
            <div className="editorial-picker editorial-picker--set" role="group" aria-label="Group the cast by">
              <span className="editorial-picker__label">Grouped by</span>
              <span className="editorial-groupby-row" ref={chipRowRef}>
              {/* Chips rather than a menu, because more than one can be on at
                  once and the order they were switched on is the nesting. */}
              {/* Rendered in the order they apply: the chosen dimensions first,
                  in nesting order, then the rest. Otherwise moving a dimension
                  changes a number on a chip that has not moved, and the control
                  disagrees with the thing it controls. */}
              {orderedGroupings.map((option) => {
                const dimension = option.id as Grouping;
                const at = grouping.findIndex((g) => g.dimension === dimension);
                const on = at >= 0;
                const label = GROUPING_LABEL[dimension];
                return (
                  <span
                    className="editorial-groupby"
                    key={option.id}
                    data-dimension={option.id}
                    ref={(el) => { chipRefs.current.set(option.id, el); }}
                    data-on={on || undefined}
                  >
                    {/* Promotion sits before the name because moving a dimension
                        earlier is moving it further out, and out is left. */}
                    {on && at > 0 && (
                      <button
                        type="button"
                        className="editorial-button editorial-button--toggle editorial-groupby__move"
                        aria-label={`Group by ${label} before ${GROUPING_LABEL[grouping[at - 1].dimension]}`}
                        onClick={() => promoteGrouping(dimension)}
                      >
                        ‹
                      </button>
                    )}
                    <button
                      type="button"
                      className="editorial-button editorial-button--toggle"
                      aria-pressed={on}
                      disabled={!option.available}
                      title={option.note || undefined}
                      onClick={() => toggleGrouping(dimension)}
                    >
                      <span>{label}</span>
                      {on && grouping.length > 1 && (
                        <span className="editorial-cast-tier__count">{at + 1}</span>
                      )}
                    </button>
                    {on && (
                      <button
                        type="button"
                        className="editorial-button editorial-button--toggle editorial-groupby__flip"
                        aria-label={grouping[at].descending
                          ? `Show ${label} in ascending order`
                          : `Show ${label} in descending order`}
                        aria-pressed={grouping[at].descending}
                        onClick={() => flipGrouping(dimension)}
                      >
                        {grouping[at].descending ? '↓' : '↑'}
                      </button>
                    )}
                  </span>
                );
              })}
              </span>
            </div>
            {/* A year is a filter on the cast, so it sits beside the grouping
                rather than in it. Composed with a grouping it answers the
                question this was built for: who was at a given place in a
                given year. */}
            {spans.from !== null && spans.last !== null && (
              <div className="editorial-picker editorial-scrub" data-on={year !== null || undefined}>
                <label className="editorial-picker__label" htmlFor="cast-year">Active in year</label>
                <span className="editorial-scrub__track">
                  {/* The cast over time, drawn once. aria-hidden because the
                      slider beside it already says the same thing in words. */}
                  <svg
                    className="editorial-scrub__density"
                    viewBox={`0 0 ${spans.density.length} 100`}
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    {/* One filled area, not a bar per year. Two hundred and
                        thirty rects stretched into two hundred pixels are
                        sub-pixel wide, so they anti-alias into a pale hatch and
                        the curve reads as texture rather than as a shape. */}
                    <polygon points={areaPoints(spans.density, spans.peak)} />
                  </svg>
                  <input
                    id="cast-year"
                    className="editorial-scrub__range"
                    type="range"
                    min={spans.from}
                    max={spans.last}
                    step={1}
                    value={year ?? spans.busiest ?? spans.from}
                    aria-valuetext={year === null
                      ? 'any year'
                      : `${year}, ${counts.all} ${counts.all === 1 ? 'person' : 'people'} active`}
                    onChange={(e) => update({ year: e.target.value, who: null })}
                  />
                </span>
                <output className="editorial-scrub__readout" htmlFor="cast-year">
                  {year === null
                    ? <span className="editorial-scrub__any">any year</span>
                    : <>{year} · {counts.all}</>}
                </output>
                {year !== null && (
                  <button
                    type="button"
                    className="editorial-link editorial-scrub__clear"
                    onClick={() => update({ year: null, who: null })}
                  >
                    Clear
                  </button>
                )}
              </div>
            )}

            {year !== null && (spans.unending > 0 || spans.unknown > 0) && (
              <p className="editorial-groupby-gap">
                {spans.unending > 0 && (
                  <>{spans.unending} of {spans.total}{' '}
                    {spans.unending === 1 ? 'is' : 'are'} recorded as unending, so every year
                    after they begin has them in it</>
                )}
                {spans.unending > 0 && spans.unknown > 0 && '; '}
                {spans.unknown > 0 && (
                  <>{spans.unknown} of {spans.total} have no end year written down, so a year
                    can place them but never rule them out</>
                )}
                .
              </p>
            )}

            {/* Why the struck-through ones are struck through, in the page.
                The reason lived only in a title attribute, which is mouse-only,
                delayed, absent on touch and unreliable for a screen reader --
                so the control showed two dead buttons and explained itself to
                almost nobody. A dimension the canon cannot answer is a fact
                about the universe worth reading, not a tooltip. */}
            {unavailable.length > 0 && (
              <p className="editorial-groupby-gap">
                {unavailable.map((option, i) => (
                  <Fragment key={option.id}>
                    {i > 0 && (i === unavailable.length - 1 ? ' and ' : '; ')}
                    <span className="editorial-groupby-gap__name">
                      {GROUPING_LABEL[option.id as Grouping]}
                    </span>
                    {': '}{option.note}
                  </Fragment>
                ))}
                .
              </p>
            )}
            </div>
            </div>

          <div className="editorial-panes">
            <div className="editorial-cast-column">
            {/* The controls that arrange the list, attached to the list they
                arrange. Spread across the header they read as page furniture
                and say nothing about what they govern. */}
            <nav
              className="editorial-pane editorial-pane--cast"
              ref={castRef}
              aria-label={`The cast, ${shown.length} ${shown.length === 1 ? 'person' : 'people'}`}
              onKeyDown={onCastKeyDown}
            >
              {shown.length > 0 ? sections.map((section) => renderGroup(section, 0)) : (
                <p className="editorial-cast-nobody">
                  {!query && year === null && 'No characters recorded for this universe yet.'}
                  {!query && year !== null && (
                    <>Nobody recorded is active in {year}.{' '}
                      <button
                        type="button"
                        className="editorial-link"
                        onClick={() => update({ year: null, who: null })}
                      >
                        Any year
                      </button>{' '}
                      brings back all {spell(counts.all || totals.all).toLowerCase()}.
                    </>
                  )}
                  {query && counts.all > 0 && (
                    <>No {tier === 'all' ? 'one' : TIER_NOUN[tier]} answers to “{query}”.{' '}
                      <button type="button" className="editorial-link" onClick={() => update({ cast: 'all' })}>
                        {spell(counts.all)} in the wider cast {counts.all === 1 ? 'does' : 'do'}
                      </button>.
                    </>
                  )}
                  {query && counts.all === 0 && (
                    <>Nobody{year === null ? ' in this universe' : ` active in ${year}`} answers to
                      {' '}“{query}”.{' '}
                      <button type="button" className="editorial-link" onClick={() => { setDraft(''); update({ q: null }); }}>
                        Clear the search
                      </button> to see all {spell(totals.all).toLowerCase()}.
                    </>
                  )}
                </p>
              )}
            </nav>
            </div>

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
                  onSaved={cast.retry}
                  universeId={id}
                  request={requestFor.get(String(chosen.id))}
                  onAsked={canonRequests.retry}
                />
              )}
            </div>
          </div>
          </>
      </div>
    </Surface>
  );
}
