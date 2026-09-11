import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  editorialApi, type CanonRequest, type Creature, type CreatureInDepth,
} from '../api';
import { useAsync, useRefreshWhile } from '../useAsync';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import Surface from '../components/Surface';
import SurfaceMasthead from '../components/SurfaceMasthead';
import BackToList from '../components/BackToList';
import NewRecord from '../components/NewRecord';
import RecordSections, { type RecordGroup, type RecordSpec } from '../components/RecordSections';

/**
 * What lives here, and where you would meet it.
 *
 * The bestiary listed a name, a category and a truncated description, and
 * nothing anywhere in the application answered the question somebody writing a
 * scene actually asks: what is in this room. The relationship did not exist --
 * no column, no edges, nothing -- so the range is new, and it is a range
 * rather than a location because a rift-haunting thing is found in three
 * chambers of a hulk and on a planet, and one field would mean picking one and
 * losing the rest.
 *
 * FILTERING BY PLACE MEANS THE PLACE AND WHAT IS INSIDE IT
 * Places are a tree. Asking what lives on Voidshroud and being told "nothing"
 * because the sightings are recorded in the Whispering Chasms, which is ON
 * Voidshroud, is a wrong answer given confidently. The tree is walked, so a
 * region answers for everything it contains -- and the containment is NOT
 * copied into the range rows, because seven copies of one fact is seven things
 * to keep in step.
 */

/** The parts a creature's record is made of. */
const CREATURE_PARTS: RecordGroup[] = [
  { title: 'What it is', keys: ['description', 'ecologicalNiche', 'inUniverseBackstory'] },
  { title: 'How it behaves', keys: ['motivation', 'tactics', 'notes'] },
];

const CREATURE_FIELDS: RecordSpec[] = [
  {
    key: 'description',
    label: 'In brief',
    hint: 'What it is, and what meeting one is like.',
  },
  {
    key: 'ecologicalNiche',
    label: 'Its place in the world',
    hint: 'What it eats, what eats it, and what changes if it were gone tomorrow.',
  },
  {
    key: 'inUniverseBackstory',
    label: 'Where it came from',
    hint: 'Whether it was always here, arrived, or was made -- and if made, by whom.',
  },
  {
    key: 'motivation',
    label: 'What it wants',
    hint: 'What it is doing when nobody is hunting it. Rarely hostility.',
  },
  {
    key: 'tactics',
    label: 'What it does when you meet it',
    list: true,
    hint: 'What it does first, what it does when hurt, and what makes it leave.',
  },
  {
    key: 'notes',
    label: 'What to know',
    hint: 'What somebody who has survived one would tell the next person.',
  },
];

/**
 * Every place inside a place, including itself.
 *
 * Walked rather than stored. A creature recorded in the Bio-Coolant Necro-Lab
 * is on the Ghost Hulk and in the Harrowed Veil system, and writing those two
 * extra rows down would mean rewriting them the day a chamber moves.
 */
function within(rootId: string, parentOf: Map<string, string | null>): Set<string> {
  const children = new Map<string, string[]>();
  for (const [id, parent] of parentOf) {
    if (!parent) continue;
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent)!.push(id);
  }
  const found = new Set<string>();
  const walk = (id: string) => {
    if (found.has(id)) return;
    found.add(id);
    for (const child of children.get(id) ?? []) walk(child);
  };
  walk(rootId);
  return found;
}

/**
 * Narrowing the bestiary to one place.
 *
 * A select rather than chips: thirty places is too many to lay out as
 * controls, and they are a tree, which indentation can show and a row of chips
 * cannot. The count beside it says how much was hidden, because a filter that
 * silently empties a list looks like a broken page.
 */
function PlaceFilter({
  places, value, onChange, showing, total,
}: {
  places: Array<{ id: string; name: string; parentId: string | null; level: number }>;
  value: string;
  onChange: (next: string) => void;
  showing: number;
  total: number;
}) {
  // Depth from the tree rather than the stored level, which is 0 on every row
  // in this universe and would render thirty places flat.
  const depthOf = useMemo(() => {
    const parent = new Map(places.map((p) => [p.id, p.parentId]));
    const depth = new Map<string, number>();
    const measure = (id: string, seen: Set<string>): number => {
      if (depth.has(id)) return depth.get(id)!;
      const up = parent.get(id);
      // A cycle would otherwise hang the page. Canon has had stranger shapes.
      const d = !up || seen.has(up) ? 0 : measure(up, new Set(seen).add(up)) + 1;
      depth.set(id, d);
      return d;
    };
    for (const p of places) measure(p.id, new Set([p.id]));
    return depth;
  }, [places]);

  const ordered = useMemo(() => {
    const byName = [...places].sort((a, b) => a.name.localeCompare(b.name));
    const children = new Map<string, typeof byName>();
    const roots: typeof byName = [];
    for (const p of byName) {
      if (!p.parentId || !places.some((q) => q.id === p.parentId)) { roots.push(p); continue; }
      if (!children.has(p.parentId)) children.set(p.parentId, []);
      children.get(p.parentId)!.push(p);
    }
    const out: typeof byName = [];
    const walk = (row: (typeof byName)[number], seen: Set<string>) => {
      if (seen.has(row.id)) return;
      out.push(row);
      for (const child of children.get(row.id) ?? []) walk(child, new Set(seen).add(row.id));
    };
    for (const root of roots) walk(root, new Set());
    return out;
  }, [places]);

  return (
    <div className="editorial-filterbar">
      <label className="editorial-filterbar__label" htmlFor="bestiary-where">Found in</label>
      <select
        id="bestiary-where"
        className="editorial-filterbar__select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Anywhere</option>
        {ordered.map((p) => (
          <option key={p.id} value={p.id}>
            {`${'  '.repeat(depthOf.get(p.id) ?? 0)}${p.name}`}
          </option>
        ))}
      </select>
      {value && (
        <>
          <span className="editorial-filterbar__note">
            {showing === total
              ? 'and everything inside it'
              : `${showing} of ${total}, counting everything inside it`}
          </span>
          <button type="button" className="editorial-link" onClick={() => onChange('')}>
            Anywhere
          </button>
        </>
      )}
    </div>
  );
}

export default function Bestiary() {
  const { id: universeId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const openId = params.get('open');
  const where = params.get('where') ?? '';
  const [said, setSaid] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [filing, setFiling] = useState(false);

  const universe = useAsync((s) => editorialApi.getUniverse(universeId, s), [universeId]);
  const index = useAsync((s) => editorialApi.listCreatures(universeId, s), [universeId]);
  const gazetteer = useAsync((s) => editorialApi.listPlaces(universeId, s), [universeId]);

  // Memoised, not `?? []` inline: a fresh empty array every render makes the
  // memos below it recompute every render, which is the whole cost of the
  // tree walk paid for nothing.
  const places = useMemo(() => gazetteer.data?.places ?? [], [gazetteer.data]);
  const parentOf = useMemo(
    () => new Map(places.map((p) => [p.id, p.parentId])),
    [places],
  );

  const creatures = useMemo(() => index.data?.creatures ?? [], [index.data]);
  const shown = useMemo(() => {
    if (!where) return creatures;
    const inside = within(where, parentOf);
    return creatures.filter((c) => (c.locationIds ?? []).some((id) => inside.has(id)));
  }, [creatures, where, parentOf]);

  // Never past the filtered set. Falling back to `creatures[0]` meant asking
  // what lives on the Ghost Hulk, being told "0 of 2", and being shown the
  // full record of a creature that lives on Voidshroud -- the confidently
  // wrong answer this surface exists to stop, produced by the surface itself.
  const creatureId = openId ?? shown[0]?.id ?? null;
  const filteredPlace = where
    ? places.find((p) => p.id === where)?.name ?? 'there'
    : null;
  const open = useAsync<CreatureInDepth | null>(
    (s) => (creatureId ? editorialApi.getCreature(creatureId, s) : Promise.resolve(null)),
    [creatureId],
  );

  const requests = useAsync((s) => editorialApi.listCreatureRequests(universeId, s), [universeId]);
  const outstanding = useMemo(
    () => (requests.data ?? []).some((r) => !r.payload?.proposed),
    [requests.data],
  );
  useRefreshWhile(outstanding, requests.retry);

  const set = useCallback((next: Record<string, string>) => {
    const merged = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v === '') merged.delete(k); else merged.set(k, v);
    }
    setParams(merged);
  }, [params, setParams]);

  const recordPane = useRef<HTMLDivElement>(null);
  const chosenBefore = useRef(false);
  useEffect(() => {
    if (recordPane.current) recordPane.current.scrollTop = 0;
  }, [creatureId]);
  const loadedId = open.data?.creature.id ?? null;
  useEffect(() => {
    if (!loadedId) return;
    if (!chosenBefore.current) { chosenBefore.current = true; return; }
    recordPane.current
      ?.querySelector<HTMLElement>('.editorial-place-head .editorial-section-title')
      ?.focus();
  }, [loadedId]);

  const reload = useCallback(() => {
    open.retry();
    index.retry();
    requests.retry();
  }, [open, index, requests]);

  const drafting = useMemo(() => {
    const claimed = new Set<string>();
    for (const row of requests.data ?? []) {
      const p = row.payload as { creatureId?: string; fields?: string[] };
      if (row.payload?.proposed || p.creatureId !== creatureId) continue;
      for (const f of p.fields ?? []) claimed.add(f);
    }
    return claimed;
  }, [requests.data, creatureId]);

  const askForCanon = async (fields: string[]) => {
    if (!creatureId || filing) return;
    setFiling(true);
    setSaid(null);
    let filed = 0;
    try {
      // One request per field: several fields in one answer come back as one.
      for (const field of fields) {
        await editorialApi.askForCreatureCanon(universeId, creatureId, [field]);
        filed += 1;
      }
      setSaid(fields.length === 1
        ? 'Asked. The proposal arrives below when it is written.'
        : `Asked for ${fields.length} fields, one at a time.`);
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      setSaid(filed
        ? `Asked for ${filed} of ${fields.length}; the next one failed: ${why}`
        : `Not asked: ${why}`);
    } finally {
      setFiling(false);
      requests.retry();
    }
  };

  const askForPicture = async () => {
    if (!creatureId) return;
    setAsking(true);
    setSaid(null);
    try {
      await editorialApi.askForCreaturePicture(universeId, creatureId);
      setSaid('Drawing. Candidates appear with the pictures.');
      requests.retry();
    } catch (e) {
      setSaid(`Not asked: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setAsking(false); }
  };

  if (index.status === 'loading') {
    return <Surface name="bestiary"><LoadingState label="Reading the bestiary…" /></Surface>;
  }
  if (index.status === 'error') {
    return (
      <Surface name="bestiary">
        <ErrorState title="Could not load the bestiary" error={index.error} onRetry={index.retry} />
      </Surface>
    );
  }

  if (creatures.length === 0) {
    return (
      <Surface name="bestiary">
        <SurfaceMasthead title={universe.data?.title ?? 'Bestiary'} />
        <EmptyState
          title="Nothing recorded yet"
          description="Creatures recorded for this universe will appear here."
        />
      </Surface>
    );
  }

  const placed = creatures.filter((c) => (c.locationIds ?? []).length > 0).length;

  return (
    <Surface name="bestiary">
      <div
        className="editorial-family-workspace"
        data-mobile-view={openId ? 'record' : 'cast'}
      >
        <SurfaceMasthead
          title={universe.data?.title ?? 'Bestiary'}
          standfirst={`${creatures.length} creatures, ${placed} of them recorded somewhere in particular.`}
          status={said}
        />

        <div className="editorial-panes">
          <div className="editorial-cast-column">
            <div className="editorial-section-header">
              <h2 className="editorial-section-title">What lives here</h2>
              <span className="editorial-register__count">
                {shown.length === creatures.length
                  ? `${creatures.length} creatures`
                  : `${shown.length} of ${creatures.length}`}
              </span>
            </div>

            <NewRecord
              label="New creature"
              prompt="What is it called?"
              placeholder="Voidshroud Phantom"
              onCreate={async (name) => (await editorialApi.createCreature(universeId, name)).id}
              onCreated={(id) => { index.retry(); set({ open: id, where: '' }); }}
              onFailed={setSaid}
            />

            <PlaceFilter
              places={places}
              value={where}
              onChange={(next) => set({ where: next })}
              showing={shown.length}
              total={creatures.length}
            />

            <nav className="editorial-pane editorial-pane--cast" aria-label="The bestiary">
              {shown.length === 0 ? (
                <p className="editorial-rail__note">
                  {'Nothing is recorded there, or anywhere inside it. Where a creature is '
                    + 'found is written on its own record, under "Where it is found".'}
                </p>
              ) : (
                <ul className="editorial-placelist">
                  {shown.map((c: Creature) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="editorial-button editorial-placelist__row"
                        aria-pressed={c.id === creatureId}
                        onClick={() => set({ open: c.id })}
                      >
                        <span className="editorial-placelist__name">{c.name || 'Unnamed'}</span>
                        <span className="editorial-placelist__meta">
                          {[
                            c.category,
                            (c.locationIds ?? []).length
                              ? `${c.locationIds!.length} place${c.locationIds!.length > 1 ? 's' : ''}`
                              : null,
                            c.pictureCount ? `${c.pictureCount} picture${c.pictureCount > 1 ? 's' : ''}` : null,
                          ].filter(Boolean).join(' · ')}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </nav>
          </div>

          <div className="editorial-pane editorial-pane--record" ref={recordPane}>
            <BackToList label="The bestiary" onBack={() => set({ open: '' })} />
            {open.data ? (
              <Detail
                universeId={universeId}
                depth={open.data}
                places={places}
                drafting={drafting}
                asking={asking}
                filing={filing}
                requests={requests.data ?? []}
                onAskCanon={askForCanon}
                onAskPicture={askForPicture}
                onChanged={reload}
                onSaid={setSaid}
              />
            ) : shown.length === 0 && filteredPlace ? (
              <EmptyState
                title={`Nothing recorded in ${filteredPlace}`}
                description={'Nothing is recorded there, or anywhere inside it. Where a creature '
                  + 'is found is written on its own record, under "Where it is found".'}
              />
            ) : open.status === 'error' ? (
              <ErrorState
                title="Could not read this creature"
                error={open.error}
                onRetry={open.retry}
              />
            ) : (
              <EmptyState
                title="Nothing chosen"
                description="Pick a creature to read and add to it."
              />
            )}
          </div>
        </div>
      </div>
    </Surface>
  );
}

/**
 * Where a creature is found, and what it does there.
 *
 * The place is a real record rather than a typed name, so the filter can mean
 * something and so a place that gets renamed stays right. What it does THERE is
 * free text, because a thing that hunts in one chamber and nests in another is
 * one creature with two habits.
 */
function Range({
  depth, places, onChanged, onSaid,
}: {
  depth: CreatureInDepth;
  places: Array<{ id: string; name: string }>;
  onChanged: () => void;
  onSaid: (s: string) => void;
}) {
  const { creature, range } = depth;
  const [adding, setAdding] = useState(false);
  const [place, setPlace] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const already = new Set(range.map((r) => r.locationId));
  const available = places.filter((p) => !already.has(p.id));

  const add = async () => {
    if (!place) return;
    setBusy(true);
    try {
      await editorialApi.addCreatureRange(creature.id, place, note.trim());
      setAdding(false);
      setPlace('');
      setNote('');
      onChanged();
    } catch (e) {
      onSaid(`Not recorded: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
  };

  return (
    <>
      {range.length === 0 && !adding && (
        <p className="editorial-rail__note">
          {'Nowhere recorded, so this one does not appear when the bestiary is filtered '
            + 'by place. Adding where it has been seen is what makes that question answerable.'}
        </p>
      )}

      {range.length > 0 && (
        <ul className="editorial-entrygroup">
          {range.map((r) => (
            <li className="editorial-entrygroup__group" key={r.id}>
              {/* A relationship, not a taxonomy. Societies puts "in open
                  conflict with" in this column, so a reader who learned the
                  shape there read "HAZARDOUS TERRAIN" as one -- a fact about
                  the place wearing the clothes of a fact about the creature.
                  What kind of place it is belongs beside the place. */}
              <span className="editorial-entrygroup__kind">found in</span>
              <span className="editorial-entrygroup__who">
                <span className="editorial-entrygroup__one">
                  <span>{r.locationName ?? '(no longer recorded)'}</span>
                  {r.regionType && (
                    <span className="editorial-entrygroup__aside">
                      {r.regionType.replace(/_/g, ' ')}
                    </span>
                  )}
                  {r.notes && <span className="editorial-entrygroup__note">{r.notes}</span>}
                  <button
                    type="button"
                    className="editorial-link editorial-link--discard"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await editorialApi.removeCreatureRange(r.id);
                        onSaid(`No longer recorded in ${r.locationName ?? 'that place'}.`);
                        onChanged();
                      } catch (e) {
                        // This one deletes canon rather than refusing a
                        // proposal, and it was the only control here that
                        // failed in silence.
                        onSaid(`Not removed: ${e instanceof Error ? e.message : String(e)}`);
                      } finally { setBusy(false); }
                    }}
                  >
                    Not here
                  </button>
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="editorial-drawn__revise">
          <label className="editorial-drawn__label" htmlFor="range-place">
            Where has it been seen?
          </label>
          <select
            id="range-place"
            className="editorial-field__select"
            value={place}
            onChange={(e) => setPlace(e.target.value)}
          >
            <option value="">Choose a place…</option>
            {available.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <label className="editorial-drawn__label" htmlFor="range-note">
            What does it do there? Optional.
          </label>
          <input
            id="range-note"
            className="editorial-field__input"
            value={note}
            placeholder="Nests in the coolant lines"
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setAdding(false); }}
          />
          <div className="editorial-field__actions">
            <button
              type="button"
              className="editorial-button editorial-button--secondary"
              disabled={busy || !place}
              onClick={add}
            >
              Record it
            </button>
            <button type="button" className="editorial-link" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        available.length > 0 && (
          <p className="editorial-drawn__actions">
            <button type="button" className="editorial-link" onClick={() => setAdding(true)}>
              Record another place
            </button>
          </p>
        )
      )}
    </>
  );
}

/** One creature, in full. */
function Detail({
  universeId, depth, places, drafting, asking, filing, requests,
  onAskCanon, onAskPicture, onChanged, onSaid,
}: {
  universeId: string;
  depth: CreatureInDepth;
  places: Array<{ id: string; name: string }>;
  drafting: Set<string>;
  asking: boolean;
  filing: boolean;
  requests: CanonRequest[];
  onAskCanon: (fields: string[]) => Promise<void>;
  onAskPicture: () => Promise<void>;
  onChanged: () => void;
  onSaid: (s: string) => void;
}) {
  const { creature, range, pictures } = depth;
  const [busy, setBusy] = useState(false);
  const rangeSection = useRef<HTMLElement>(null);

  const showRange = () => {
    rangeSection.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    rangeSection.current?.querySelector<HTMLElement>('.editorial-section-title')?.focus();
  };

  const mine = (r: CanonRequest) => (r.payload as { creatureId?: string }).creatureId === creature.id;
  const drawn = requests.filter(
    (r) => mine(r) && r.payload?.proposed && r.artifactType === 'bestiary_image_request',
  );
  const proposals = requests.filter(
    (r) => mine(r) && r.payload?.proposed && r.artifactType === 'bestiary_canon_request',
  );

  const save = async (field: string, value: string | string[]) => {
    await editorialApi.updateCreature(creature.id, { [field]: value });
    onChanged();
  };

  return (
    <>
      <div className="editorial-section-header editorial-place-head">
        <h2 className="editorial-section-title" tabIndex={-1}>{creature.name || 'Unnamed'}</h2>
        <div className="editorial-section-header__actions">
          <button
            type="button"
            className="editorial-button editorial-button--secondary"
            disabled={filing || drafting.size > 0}
            onClick={() => onAskCanon(CREATURE_FIELDS.map((f) => f.key))}
          >
            {filing ? 'Asking…' : drafting.size > 0 ? 'Drafting…' : 'Collaborate'}
          </button>
          <button type="button" className="editorial-link" disabled={asking} onClick={onAskPicture}>
            {asking ? 'Drawing…' : 'Ask for a picture'}
          </button>
        </div>
      </div>

      {/* The count is a link to what it counts. It sat at the top of a record
          two and a half screens tall, naming a section at the bottom of it. */}
      <p className="editorial-rail__note">
        {[creature.category, creature.status].filter(Boolean).join(' · ')}
        {' · '}
        <button type="button" className="editorial-link" onClick={showRange}>
          {range.length
            ? `found in ${range.length} place${range.length > 1 ? 's' : ''}`
            : 'nowhere recorded'}
        </button>
        {creature.isProtected && ' · protected from automated changes'}
      </p>

      {pictures.length > 0 && (
        <ul className="editorial-placepics">
          {pictures.map((pic) => (
            <li key={pic.id} className="editorial-placepics__item">
              <img src={pic.url} alt={pic.title || creature.name} />
            </li>
          ))}
        </ul>
      )}

      {drawn.map((row) => {
        const images = (row.payload as { proposed?: { images?: string[] } }).proposed?.images ?? [];
        return (
          <section className="editorial-drawn" key={row.id}>
            <div className="editorial-drawn__sheet">
              {images.map((url) => (
                <figure className="editorial-drawn__item" key={url}>
                  <img src={url} alt={`A candidate picture of ${creature.name}`} />
                  <figcaption>
                    <button
                      type="button"
                      className="editorial-button editorial-button--secondary"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await editorialApi.keepCreaturePicture(universeId, creature.id, url);
                          await editorialApi.resolveCanonRequest(row.id, 'accepted');
                          onSaid('Kept.');
                          onChanged();
                        } catch (e) {
                          onSaid(`Not kept: ${e instanceof Error ? e.message : String(e)}`);
                        } finally { setBusy(false); }
                      }}
                    >
                      Keep this one
                    </button>
                  </figcaption>
                </figure>
              ))}
            </div>
            <p className="editorial-drawn__actions">
              <button
                type="button"
                className="editorial-link editorial-link--discard"
                disabled={busy}
                onClick={async () => {
                  await editorialApi.resolveCanonRequest(row.id, 'rejected');
                  onChanged();
                }}
              >
                Keep none of these
              </button>
            </p>
          </section>
        );
      })}

      <section className="editorial-band">
        <RecordSections
          key={creature.id}
          name="creature"
          specs={CREATURE_FIELDS}
          groups={CREATURE_PARTS}
          valueOf={(k) => (creature as unknown as Record<string, string | string[]>)[k] ?? ''}
          drafting={drafting}
          onCollaborate={onAskCanon}
          onSave={save}
        />
      </section>

      {proposals.map((row) => {
        const proposed = (row.payload as {
          proposed?: Record<string, string | string[]>;
        }).proposed ?? {};
        return (
          <article className="editorial-placeproposal" key={row.id}>
            <dl className="editorial-placeproposal__fields">
              {Object.entries(proposed).map(([key, value]) => (
                <div key={key}>
                  <dt>{CREATURE_FIELDS.find((f) => f.key === key)?.label ?? key}</dt>
                  <dd>{Array.isArray(value) ? value.join(' · ') : value}</dd>
                </div>
              ))}
            </dl>
            <div className="editorial-field__actions">
              <button
                type="button"
                className="editorial-button editorial-button--secondary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await editorialApi.updateCreature(creature.id, proposed);
                    await editorialApi.resolveCanonRequest(row.id, 'accepted');
                    onSaid('Put in force.');
                    onChanged();
                  } catch (e) {
                    onSaid(`Not saved: ${e instanceof Error ? e.message : String(e)}`);
                  } finally { setBusy(false); }
                }}
              >
                Put it in force
              </button>
              <button
                type="button"
                className="editorial-link editorial-link--discard"
                disabled={busy}
                onClick={async () => {
                  await editorialApi.resolveCanonRequest(row.id, 'rejected');
                  onChanged();
                }}
              >
                Refuse
              </button>
            </div>
          </article>
        );
      })}

      <section className="editorial-band" ref={rangeSection}>
        <div className="editorial-section-header">
          <h3 className="editorial-section-title" tabIndex={-1}>Where it is found</h3>
        </div>
        <Range depth={depth} places={places} onChanged={onChanged} onSaid={onSaid} />
      </section>
    </>
  );
}
