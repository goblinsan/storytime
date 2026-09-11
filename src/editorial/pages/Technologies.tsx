import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  editorialApi, type CanonRequest, type Technology, type TechnologyInDepth,
} from '../api';
import { useAsync, useRefreshWhile } from '../useAsync';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import Surface from '../components/Surface';
import SurfaceMasthead from '../components/SurfaceMasthead';
import BackToList from '../components/BackToList';
import NewRecord from '../components/NewRecord';
import RecordSections, { type RecordGroup, type RecordSpec } from '../components/RecordSections';

/**
 * What this universe can build, and who is allowed to.
 *
 * Technologies shared a lens with arcs: a name and a body of prose, on a page
 * whose own comment said the two should split the moment either grew fields of
 * its own. This is that moment.
 *
 * SORTING IS THE POINT OF THE LIST
 * Alphabetical is the order that answers no question. The three that do --
 * how old is it, where did it come from, whose is it -- were all unanswerable,
 * because none of them was recorded: the table held principles and limitations
 * and a `patents_or_taboos` paragraph that NAMED the cartel holding the patents
 * without being linked to it. Age, origin and holder are now real fields, and
 * the last two are edges to the actual place and the actual group, so renaming
 * either keeps this surface right.
 */

/** The parts a technology's record is made of. */
const TECHNOLOGY_PARTS: RecordGroup[] = [
  { title: 'What it is', keys: ['description', 'principles'] },
  { title: 'Where it came from', keys: ['history'] },
  { title: 'What holds it back', keys: ['limitations', 'patentsOrTaboos'] },
];

const TECHNOLOGY_FIELDS: RecordSpec[] = [
  {
    key: 'description',
    label: 'In brief',
    hint: 'What it is and what it does, as you would explain it to somebody who had not heard of it.',
  },
  {
    key: 'principles',
    label: 'How it works',
    hint: 'The mechanism, at the level of detail the rest of this universe is written at.',
  },
  {
    key: 'history',
    label: 'How it came about',
    hint: 'Who worked it out, what they were trying to do, and what it replaced.',
  },
  {
    key: 'limitations',
    label: 'What it cannot do',
    hint: 'What it costs and how it fails. A technology with no limit is a plot device.',
  },
  {
    key: 'patentsOrTaboos',
    label: 'Who may have it',
    hint: 'Who is allowed it, and what happens to people who have it anyway.',
  },
];

/** The orders a list of technologies can be read in, and what each answers. */
const ORDERS = [
  { id: 'name', label: 'Name' },
  { id: 'age', label: 'Age' },
  { id: 'location', label: 'Where from' },
  { id: 'society', label: 'Who holds it' },
] as const;

type Order = (typeof ORDERS)[number]['id'];

const inWords = (raw: string) => (raw
  ? raw.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
  : '');

/**
 * Put the list in an order, and say what each row is being ordered ON.
 *
 * Anything with nothing recorded for the chosen order sorts last rather than
 * first or in the middle: a blank is not older than everything else, and a row
 * whose value is missing is the one you most want to see grouped so you can
 * fill it in. The reason is on the row -- "not recorded" instead of a silent
 * gap -- because a sort that hides why something is at the bottom teaches the
 * reader nothing.
 */
function order(rows: Technology[], by: Order) {
  const value = (t: Technology): string | number | null => {
    if (by === 'age') return t.originYear;
    if (by === 'location') return t.originLocationName;
    if (by === 'society') return t.holderFactionName;
    return t.name;
  };

  return [...rows].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    // Unrecorded last, then alphabetical among themselves, so the tail is a
    // worklist rather than an arbitrary heap.
    if (x === null && y === null) return a.name.localeCompare(b.name);
    if (x === null) return 1;
    if (y === null) return -1;
    if (typeof x === 'number' && typeof y === 'number') {
      return x - y || a.name.localeCompare(b.name);
    }
    return String(x).localeCompare(String(y)) || a.name.localeCompare(b.name);
  });
}

/** What the row is being ordered on, said out loud. */
function orderedBy(t: Technology, by: Order): string {
  if (by === 'age') return t.originDate || 'when it appeared is not recorded';
  if (by === 'location') return t.originLocationName || 'where it came from is not recorded';
  if (by === 'society') return t.holderFactionName || 'nobody is recorded as holding it';
  return [inWords(t.classification), inWords(t.proliferation)].filter(Boolean).join(' · ');
}

export default function Technologies() {
  const { id: universeId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const openId = params.get('open');
  const by = (params.get('by') as Order) ?? 'name';
  const [said, setSaid] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [filing, setFiling] = useState(false);

  const universe = useAsync((s) => editorialApi.getUniverse(universeId, s), [universeId]);
  const index = useAsync((s) => editorialApi.listTechnologies(universeId, s), [universeId]);
  const gazetteer = useAsync((s) => editorialApi.listPlaces(universeId, s), [universeId]);
  const societies = useAsync((s) => editorialApi.listSocieties(universeId, s), [universeId]);

  const technologies = useMemo(() => index.data?.technologies ?? [], [index.data]);
  const shown = useMemo(() => order(technologies, by), [technologies, by]);

  const technologyId = openId ?? shown[0]?.id ?? null;
  const open = useAsync<TechnologyInDepth | null>(
    (s) => (technologyId ? editorialApi.getTechnology(technologyId, s) : Promise.resolve(null)),
    [technologyId],
  );

  const requests = useAsync((s) => editorialApi.listTechnologyRequests(universeId, s), [universeId]);
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
  }, [technologyId]);
  const loadedId = open.data?.technology.id ?? null;
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
      const p = row.payload as { technologyId?: string; fields?: string[] };
      if (row.payload?.proposed || p.technologyId !== technologyId) continue;
      for (const f of p.fields ?? []) claimed.add(f);
    }
    return claimed;
  }, [requests.data, technologyId]);

  const askForCanon = async (fields: string[]) => {
    if (!technologyId || filing) return;
    setFiling(true);
    setSaid(null);
    let filed = 0;
    try {
      for (const field of fields) {
        await editorialApi.askForTechnologyCanon(universeId, technologyId, [field]);
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
    if (!technologyId) return;
    setAsking(true);
    setSaid(null);
    try {
      await editorialApi.askForTechnologyPicture(universeId, technologyId);
      setSaid('Drawing. Candidates appear with the pictures.');
      requests.retry();
    } catch (e) {
      setSaid(`Not asked: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setAsking(false); }
  };

  if (index.status === 'loading') {
    return <Surface name="technologies"><LoadingState label="Reading what can be built…" /></Surface>;
  }
  if (index.status === 'error') {
    return (
      <Surface name="technologies">
        <ErrorState title="Could not load technologies" error={index.error} onRetry={index.retry} />
      </Surface>
    );
  }

  return (
    <Surface name="technologies">
      <div
        className="editorial-family-workspace"
        data-mobile-view={openId ? 'record' : 'cast'}
      >
        <SurfaceMasthead
          title={universe.data?.title ?? 'Technologies'}
          standfirst={technologies.length
            ? `${technologies.length} technologies. Order them by age, by where they came `
              + 'from, or by who holds them.'
            : 'Nothing recorded yet.'}
          status={said}
        />

        <div className="editorial-panes">
          <div className="editorial-cast-column">
            <div className="editorial-section-header">
              <h2 className="editorial-section-title">What can be built</h2>
              <span className="editorial-register__count">
                {`${technologies.length} technolog${technologies.length === 1 ? 'y' : 'ies'}`}
              </span>
            </div>

            <NewRecord
              label="New technology"
              prompt="What is it called?"
              placeholder="Quantum-Soul Binding"
              onCreate={async (name) => (await editorialApi.createTechnology(universeId, name)).id}
              onCreated={(id) => { index.retry(); set({ open: id }); }}
              onFailed={setSaid}
            />

            {technologies.length > 1 && (
              <div className="editorial-filterbar">
                <span className="editorial-filterbar__label">Ordered by</span>
                {ORDERS.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className="editorial-link"
                    aria-pressed={by === o.id}
                    onClick={() => set({ by: o.id === 'name' ? '' : o.id })}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}

            <nav className="editorial-pane editorial-pane--cast" aria-label="What can be built">
              {technologies.length === 0 ? (
                <p className="editorial-rail__note">
                  Nothing recorded yet. Anything this universe can build goes here.
                </p>
              ) : (
                <ul className="editorial-placelist">
                  {shown.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        className="editorial-button editorial-placelist__row"
                        aria-pressed={t.id === technologyId}
                        onClick={() => set({ open: t.id })}
                      >
                        <span className="editorial-placelist__name">{t.name || 'Unnamed'}</span>
                        {/* What this row is sorted ON, so an order is legible
                            rather than something the reader has to infer from
                            the sequence. */}
                        <span className="editorial-placelist__meta">{orderedBy(t, by)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </nav>
          </div>

          <div className="editorial-pane editorial-pane--record" ref={recordPane}>
            <BackToList label="What can be built" onBack={() => set({ open: '' })} />
            {open.data ? (
              <Detail
                universeId={universeId}
                depth={open.data}
                places={gazetteer.data?.places ?? []}
                societies={societies.data?.factions ?? []}
                drafting={drafting}
                asking={asking}
                filing={filing}
                requests={requests.data ?? []}
                onAskCanon={askForCanon}
                onAskPicture={askForPicture}
                onChanged={reload}
                onSaid={setSaid}
              />
            ) : open.status === 'error' ? (
              <ErrorState
                title="Could not read this technology"
                error={open.error}
                onRetry={open.retry}
              />
            ) : (
              <EmptyState
                title="Nothing chosen"
                description="Pick a technology to read and add to it."
              />
            )}
          </div>
        </div>
      </div>
    </Surface>
  );
}

/**
 * Where it came from and who holds it.
 *
 * Three controls rather than prose, because these are the three things the
 * list sorts on: typed into a paragraph they order nothing, and a paragraph
 * naming a cartel is a second copy of a fact the cartel's own record already
 * holds. The date stays free text -- "before the Collapse" is a real answer --
 * and a year is parsed out of it for the ordering.
 */
function Provenance({
  technology, places, societies, onSave, onSaid,
}: {
  technology: Technology;
  places: Array<{ id: string; name: string }>;
  societies: Array<{ id: string; name: string }>;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
  onSaid: (s: string) => void;
}) {
  const [date, setDate] = useState(technology.originDate);
  const [busy, setBusy] = useState(false);

  // The record can change under this row -- a save lands, a proposal is put in
  // force -- and a draft nobody typed should not survive it.
  useEffect(() => { setDate(technology.originDate); }, [technology.originDate]);

  const save = async (patch: Record<string, unknown>) => {
    setBusy(true);
    try {
      await onSave(patch);
    } catch (e) {
      onSaid(`Not saved: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
  };

  return (
    <div className="editorial-provenance">
      <div className="editorial-provenance__row">
        <label className="editorial-provenance__label" htmlFor="tech-when">When it appeared</label>
        {/* Saved by pressing something, not by looking away. A field that
            commits on blur loses what you typed if you click a link instead of
            clicking out, and it is the only control in this application that
            would behave that way -- every other field has a Save. The two
            selects beside it commit on change because that is what choosing
            from a list means. */}
        <input
          id="tech-when"
          className="editorial-field__input"
          value={date}
          disabled={busy}
          placeholder="Year of the Iron Dirge 288"
          onChange={(e) => setDate(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); void save({ originDate: date }); }
            if (e.key === 'Escape') setDate(technology.originDate);
          }}
        />
        <span className="editorial-provenance__note">
          {date !== technology.originDate ? (
            <>
              <button
                type="button"
                className="editorial-link"
                disabled={busy}
                onClick={() => save({ originDate: date })}
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
              {' · '}
              <button
                type="button"
                className="editorial-link"
                onClick={() => setDate(technology.originDate)}
              >
                Cancel
              </button>
            </>
          ) : technology.originYear === null ? (
            date ? 'No year in that, so it sorts last by age.' : 'Not recorded, so it sorts last by age.'
          ) : `Sorts as ${technology.originYear}.`}
        </span>
      </div>

      <div className="editorial-provenance__row">
        <label className="editorial-provenance__label" htmlFor="tech-where">Where it came from</label>
        <select
          id="tech-where"
          className="editorial-field__select"
          value={technology.originLocationId ?? ''}
          disabled={busy}
          onChange={(e) => save({ originLocationId: e.target.value })}
        >
          <option value="">Not recorded</option>
          {places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <div className="editorial-provenance__row">
        <label className="editorial-provenance__label" htmlFor="tech-who">Who holds it</label>
        <select
          id="tech-who"
          className="editorial-field__select"
          value={technology.holderFactionId ?? ''}
          disabled={busy}
          onChange={(e) => save({ holderFactionId: e.target.value })}
        >
          <option value="">Nobody recorded</option>
          {societies.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </div>
    </div>
  );
}

/** One technology, in full. */
function Detail({
  universeId, depth, places, societies, drafting, asking, filing, requests,
  onAskCanon, onAskPicture, onChanged, onSaid,
}: {
  universeId: string;
  depth: TechnologyInDepth;
  places: Array<{ id: string; name: string }>;
  societies: Array<{ id: string; name: string }>;
  drafting: Set<string>;
  asking: boolean;
  filing: boolean;
  requests: CanonRequest[];
  onAskCanon: (fields: string[]) => Promise<void>;
  onAskPicture: () => Promise<void>;
  onChanged: () => void;
  onSaid: (s: string) => void;
}) {
  const { technology, pictures } = depth;
  const [busy, setBusy] = useState(false);
  const provenance = useRef<HTMLElement>(null);

  const mine = (r: CanonRequest) =>
    (r.payload as { technologyId?: string }).technologyId === technology.id;
  const drawn = requests.filter(
    (r) => mine(r) && r.payload?.proposed && r.artifactType === 'technology_image_request',
  );
  const proposals = requests.filter(
    (r) => mine(r) && r.payload?.proposed && r.artifactType === 'technology_canon_request',
  );

  const save = async (field: string, value: string | string[]) => {
    await editorialApi.updateTechnology(technology.id, { [field]: value });
    onChanged();
  };

  const showProvenance = () => {
    provenance.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    provenance.current?.querySelector<HTMLElement>('.editorial-section-title')?.focus();
  };

  return (
    <>
      <div className="editorial-section-header editorial-place-head">
        <h2 className="editorial-section-title" tabIndex={-1}>{technology.name || 'Unnamed'}</h2>
        <div className="editorial-section-header__actions">
          <button
            type="button"
            className="editorial-button editorial-button--secondary"
            disabled={filing || drafting.size > 0}
            onClick={() => onAskCanon(TECHNOLOGY_FIELDS.map((f) => f.key))}
          >
            {filing ? 'Asking…' : drafting.size > 0 ? 'Drafting…' : 'Collaborate'}
          </button>
          <button type="button" className="editorial-link" disabled={asking} onClick={onAskPicture}>
            {asking ? 'Drawing…' : 'Ask for a picture'}
          </button>
        </div>
      </div>

      <p className="editorial-rail__note">
        {[inWords(technology.classification), inWords(technology.proliferation)]
          .filter(Boolean).join(' · ')}
        {(technology.classification || technology.proliferation) && ' · '}
        <button type="button" className="editorial-link" onClick={showProvenance}>
          {technology.holderFactionName
            ? `held by ${technology.holderFactionName}`
            : 'nobody recorded as holding it'}
        </button>
        {technology.isProtected && ' · protected from automated changes'}
      </p>

      {pictures.length > 0 && (
        <ul className="editorial-placepics">
          {pictures.map((pic) => (
            <li key={pic.id} className="editorial-placepics__item">
              <img src={pic.url} alt={pic.title || technology.name} />
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
                  <img src={url} alt={`A candidate picture of ${technology.name}`} />
                  <figcaption>
                    <button
                      type="button"
                      className="editorial-button editorial-button--secondary"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await editorialApi.keepTechnologyPicture(universeId, technology.id, url);
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

      <RecordSections
        key={technology.id}
        name="technology"
        specs={TECHNOLOGY_FIELDS}
        groups={TECHNOLOGY_PARTS}
        valueOf={(k) => (technology as unknown as Record<string, string>)[k] ?? ''}
        drafting={drafting}
        onCollaborate={onAskCanon}
        onSave={save}
      />

      {proposals.map((row) => {
        const proposed = (row.payload as { proposed?: Record<string, string> }).proposed ?? {};
        return (
          <article className="editorial-placeproposal" key={row.id}>
            <dl className="editorial-placeproposal__fields">
              {Object.entries(proposed).map(([key, value]) => (
                <div key={key}>
                  <dt>{TECHNOLOGY_FIELDS.find((f) => f.key === key)?.label ?? key}</dt>
                  <dd>{value}</dd>
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
                    await editorialApi.updateTechnology(technology.id, proposed);
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

      <section className="editorial-band" ref={provenance}>
        <div className="editorial-section-header">
          <h3 className="editorial-section-title" tabIndex={-1}>Where it came from, and whose it is</h3>
        </div>
        <Provenance
          technology={technology}
          places={places}
          societies={societies}
          onSave={async (patch) => {
            await editorialApi.updateTechnology(technology.id, patch);
            onChanged();
          }}
          onSaid={onSaid}
        />
      </section>
    </>
  );
}
