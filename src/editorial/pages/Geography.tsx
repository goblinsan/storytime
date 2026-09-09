import { useCallback, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  editorialApi, type CanonRequest, type MapPin, type PlaceGeography, type PlaceMap,
} from '../api';
import { useAsync, useRefreshWhile } from '../useAsync';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import Surface from '../components/Surface';
import MapCanvas from '../components/MapCanvas';

/**
 * Where things are, and what that suggests.
 *
 * This was a list of places grouped by region type. Lists are what geography
 * is *stored* as; they are not what geography is *for*. The reason to draw a
 * world is that a drawing answers questions a list cannot pose: a coast with
 * nothing on it is a port waiting to happen, two holdings either side of one
 * pass is a war, and neither of those is visible in a column of names sorted
 * by depth.
 *
 * So the map is the page, and the list is the index beside it.
 *
 * THE RULES THIS SURFACE IS BUILT ON
 *
 *   A pin carries no facts. Everything it shows is read from the location
 *   record on every load, so the drawing and the records cannot disagree about
 *   anything except position. There is no second copy of the truth to drift.
 *
 *   A guess looks like a guess. A position an agent proposed is drawn hollow
 *   and says so until somebody places it. A map that presents a guess as a
 *   decision is the specific failure this has to avoid.
 *
 *   Clicking empty ground makes a real place. Not a label on a picture: a
 *   location record with its own history, born into the universe, which is
 *   then also drawn here. That is the difference between a map and a mural.
 *
 *   A drawing is never canon. A generated coastline is a backdrop, and no
 *   record is written from it. That is precisely why it can be generated at
 *   all -- an invented bay nobody approved costs nothing, and an invented town
 *   in the records would be a lie.
 */

/** How many candidates one press may draw. */
const CANDIDATE_NOTE = 'Nothing here changes the universe. Keeping one gives places somewhere to sit.';

/** One prose field of a place, read until somebody edits it. */
function Field({
  label, hint, value, onSave,
}: {
  label: string; hint: string; value: string; onSave: (next: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const commit = async () => {
    setBusy(true);
    setFailed(null);
    try {
      await onSave(draft.trim());
      setEditing(false);
    } catch (e) {
      setFailed(`Not saved: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
  };

  return (
    <section className="editorial-placefield">
      <div className="editorial-placefield__head">
        <h3 className="editorial-placefield__label">{label}</h3>
        {!editing && (
          <button
            type="button"
            className="editorial-link"
            onClick={() => { setDraft(value); setEditing(true); }}
          >
            {value.trim() ? 'Edit' : 'Write'}
          </button>
        )}
      </div>

      {editing ? (
        <div className="editorial-placefield__editor">
          <label className="editorial-placefield__hint" htmlFor={`place-${label}`}>{hint}</label>
          <textarea
            id={`place-${label}`}
            className="editorial-field__input"
            rows={4}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }}
          />
          <div className="editorial-field__actions">
            <button
              type="button"
              className="editorial-button editorial-button--secondary"
              disabled={busy}
              onClick={commit}
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="editorial-link" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
          {failed && <span className="editorial-field__failed" role="alert">{failed}</span>}
        </div>
      ) : (
        <p className={value.trim() ? 'editorial-placefield__prose' : 'editorial-placefield__absent'}>
          {value.trim() || hint}
        </p>
      )}
    </section>
  );
}

/**
 * What to do with a point on the map that has nothing on it.
 *
 * Three ways, because they are three different states of knowing: you already
 * know what is there, you know roughly and want it written, or you want to be
 * told what the surrounding canon implies. Only the first is instant; the other
 * two file a request and answer later, which is said plainly rather than
 * discovered by waiting.
 */
function OpenGround({
  at, onName, onAsk, onClose,
}: {
  at: { x: number; y: number };
  onName: (name: string) => Promise<void>;
  onAsk: (note: string) => Promise<void>;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'choose' | 'name' | 'describe'>('choose');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setFailed(null);
    try {
      await fn();
      onClose();
    } catch (e) {
      setFailed(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!value.trim()) return;
    void run(mode === 'name' ? () => onName(value.trim()) : () => onAsk(value.trim()));
  };

  return (
    <form
      className="editorial-openground"
      style={{ left: `${at.x * 100}%`, top: `${at.y * 100}%` }}
      onClick={(e) => e.stopPropagation()}
      onSubmit={submit}
      aria-label="Add a place here"
    >
      {mode === 'choose' && (
        <>
          <p className="editorial-openground__lead">Nothing is here yet.</p>
          <button
            type="button"
            className="editorial-button editorial-openground__choice"
            onClick={() => setMode('name')}
          >
            <span className="editorial-openground__choice-name">Name it</span>
            <span className="editorial-openground__choice-note">You know what this is.</span>
          </button>
          <button type="button" className="editorial-button editorial-openground__choice" onClick={() => setMode('describe')}>
            <span className="editorial-openground__choice-name">Describe it</span>
            <span className="editorial-openground__choice-note">Say what belongs here and have it written.</span>
          </button>
          <button
            type="button"
            className="editorial-button editorial-openground__choice"
            disabled={busy}
            onClick={() => run(() => onAsk(''))}
          >
            <span className="editorial-openground__choice-name">Ask what belongs</span>
            <span className="editorial-openground__choice-note">
              What the surrounding canon implies should be at this spot.
            </span>
          </button>
          <button type="button" className="editorial-link" onClick={onClose}>Never mind</button>
        </>
      )}

      {mode !== 'choose' && (
        <>
          <label className="editorial-openground__label" htmlFor="openground-value">
            {mode === 'name' ? 'What is here?' : 'What should be here?'}
          </label>
          {mode === 'name' ? (
            <input
              id="openground-value"
              className="editorial-field__input"
              value={value}
              autoFocus
              placeholder="Salt Harbour"
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
            />
          ) : (
            <textarea
              id="openground-value"
              className="editorial-field__input"
              rows={3}
              autoFocus
              value={value}
              placeholder="A shrine the pilgrims stop at, older than the road."
              onChange={(e) => setValue(e.target.value)}
            />
          )}
          <div className="editorial-field__actions">
            <button
              type="submit"
              className="editorial-button editorial-button--secondary"
              disabled={busy || !value.trim()}
            >
              {busy
                ? 'Working…'
                : mode === 'name' ? 'Create it here' : 'Ask for it'}
            </button>
            <button type="button" className="editorial-link" onClick={onClose}>Cancel</button>
          </div>
          {mode === 'describe' && (
            <p className="editorial-openground__wait">
              This is filed as a request. The answer is a proposal to accept or refuse.
            </p>
          )}
          {failed && <span className="editorial-field__failed" role="alert">{failed}</span>}
        </>
      )}
    </form>
  );
}

/**
 * What the open drawing is for, and whether it is the one that opens.
 *
 * With one map this is nearly redundant. With four it is the whole difference
 * between a usable set and four tabs reading "Map of The Ghost Hulk", which is
 * what the first version produced: a label that names the place is no label at
 * all when every drawing is of the same place.
 */
function MapDetails({
  map, only, onChanged, onSaid,
}: {
  map: PlaceMap; only: boolean; onChanged: () => void; onSaid: (s: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(map.purpose);
  const [busy, setBusy] = useState(false);

  const save = async (patch: { purpose?: string; primary?: boolean }) => {
    setBusy(true);
    try {
      await editorialApi.updateMap(map.id, patch);
      setEditing(false);
      onChanged();
    } catch (e) {
      onSaid(`Not saved: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
  };

  if (editing) {
    return (
      <form
        className="editorial-mapdetails"
        onSubmit={(e) => { e.preventDefault(); void save({ purpose: draft.trim() }); }}
      >
        <label className="editorial-mapdetails__label" htmlFor={`purpose-${map.id}`}>
          What does this drawing show that another would not?
        </label>
        <input
          id={`purpose-${map.id}`}
          className="editorial-field__input"
          value={draft}
          autoFocus
          placeholder="Trade routes, deck three, the siege of 4102"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }}
        />
        <button type="submit" className="editorial-button editorial-button--secondary" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="editorial-link" onClick={() => setEditing(false)}>Cancel</button>
      </form>
    );
  }

  return (
    <p className="editorial-mapdetails">
      <span className={map.purpose ? 'editorial-mapdetails__purpose' : 'editorial-mapdetails__absent'}>
        {map.purpose || 'This drawing has no stated purpose.'}
      </span>
      <button
        type="button"
        className="editorial-link"
        onClick={() => { setDraft(map.purpose); setEditing(true); }}
      >
        {map.purpose ? 'Rename' : 'Say what it shows'}
      </button>
      {!only && !map.isPrimary && (
        <button
          type="button"
          className="editorial-link"
          disabled={busy}
          onClick={() => save({ primary: true })}
        >
          Open this one first
        </button>
      )}
      {!only && map.isPrimary && (
        <span className="editorial-mapdetails__flag">Opens first</span>
      )}
      <button
        type="button"
        className="editorial-link editorial-link--discard"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const out = await editorialApi.notAMap(map.id);
            onSaid(out.detail);
            onChanged();
          } catch (e) {
            onSaid(`Not moved: ${e instanceof Error ? e.message : String(e)}`);
          } finally { setBusy(false); }
        }}
      >
        Not a map
      </button>
    </p>
  );
}

export default function Geography() {
  const { id: universeId = '' } = useParams();
  const [openPlaceId, setOpenPlaceId] = useState<string | null>(null);
  const [openMapId, setOpenMapId] = useState<string | null>(null);
  const [placing, setPlacing] = useState<{ id: string; name: string } | null>(null);
  const [ground, setGround] = useState<{ x: number; y: number } | null>(null);
  const [activePin, setActivePin] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  const index = useAsync((s) => editorialApi.listPlaces(universeId, s), [universeId]);
  const placeId = openPlaceId ?? index.data?.opens ?? null;

  const place = useAsync<PlaceGeography | null>(
    (s) => (placeId ? editorialApi.getPlace(placeId, s) : Promise.resolve(null)),
    [placeId],
  );

  const requests = useAsync(
    async (s) => ({
      maps: await editorialApi.listMapRequests(universeId, s),
      places: await editorialApi.listPlaceRequests(universeId, s),
    }),
    [universeId],
  );

  // An agent answers minutes later and from somewhere else, so a page that
  // asked has no way to hear about it. Stops the moment nothing is waiting.
  const outstanding = useMemo(() => {
    const rows = [...(requests.data?.maps ?? []), ...(requests.data?.places ?? [])];
    return rows.some((r) => !r.payload?.proposed);
  }, [requests.data]);
  useRefreshWhile(outstanding, requests.retry);

  const reload = useCallback(() => {
    place.retry();
    index.retry();
    requests.retry();
  }, [place, index, requests]);

  const maps = place.data?.maps ?? [];
  const current: PlaceMap | null = maps.find((m) => m.id === openMapId) ?? maps[0] ?? null;
  const unplaced = current ? (place.data?.unplaced?.[current.id] ?? []) : [];

  const putPin = async (locationId: string, at: { x: number; y: number }) => {
    if (!current) return;
    await editorialApi.placePin(current.id, locationId, { ...at, status: 'placed' });
    setPlacing(null);
    place.retry();
  };

  const onOpenGround = (at: { x: number; y: number }) => {
    if (placing) { void putPin(placing.id, at); return; }
    setGround(at);
  };

  const nameIt = async (name: string) => {
    if (!current || !place.data) return;
    // Reuse rather than duplicate: a place that already exists by this name is
    // the same place, and making a second one is how a universe ends up with
    // two Salt Harbours that disagree.
    const already = index.data?.places.find(
      (p) => p.name.trim().toLowerCase() === name.trim().toLowerCase(),
    );
    const row = already ?? await editorialApi.createPlace(universeId, {
      name, parentId: place.data.place.id,
    });
    await editorialApi.placePin(current.id, String(row.id), { ...ground!, status: 'placed' });
    setSaid(already
      ? `${name} was already recorded, so it was pinned rather than created again.`
      : `${name} is now a place in this universe, with its own record.`);
    reload();
  };

  const askHere = async (note: string) => {
    if (!current || !place.data) return;
    await editorialApi.askForPlace(universeId, place.data.place.id, current.id, ground!, note);
    setSaid('Asked. The proposal arrives here when it is written.');
    requests.retry();
  };

  const askForMap = async () => {
    if (!place.data) return;
    setAsking(true);
    setSaid(null);
    try {
      await editorialApi.askForMap(universeId, place.data.place.id);
      setSaid(`Drawing ${place.data.place.name}. Candidates appear below.`);
      requests.retry();
    } catch (e) {
      setSaid(`Not asked: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setAsking(false); }
  };

  if (index.status === 'loading') {
    return <Surface name="geography"><LoadingState label="Reading the territory…" /></Surface>;
  }
  if (index.status === 'error') {
    return (
      <Surface name="geography">
        <ErrorState title="Could not load geography" error={index.error} onRetry={index.retry} />
      </Surface>
    );
  }
  if (!index.data.places.length) {
    return (
      <Surface name="geography">
        <EmptyState
          title="No places yet"
          description="Regions, settlements and sites recorded for this universe will appear here, and can be drawn and pinned."
        />
      </Surface>
    );
  }

  const drawn = index.data.places.filter((p) => p.mapCount > 0).length;

  return (
    <Surface name="geography">
      <header className="editorial-masthead">
        <div className="editorial-masthead__line">
          <h1 className="editorial-masthead__title">{place.data?.place.name ?? 'Geography'}</h1>
          <div className="editorial-section-header__actions">
            <button type="button" className="editorial-link" disabled={asking} onClick={askForMap}>
              {asking ? 'Asking…' : 'Ask for a map'}
            </button>
          </div>
        </div>
        <p className="editorial-register__standfirst">
          {`${index.data.places.length} places, ${drawn} of them drawn. `}
          {index.data.why}
        </p>
        <p className="editorial-masthead__status" role="status">{said ?? ''}</p>
      </header>

      <section className="editorial-band">
        {current ? (
          <>
            <div className="editorial-mapband__head">
              {maps.length > 1 ? (
                <div className="editorial-maptabs" role="tablist" aria-label="Maps of this place">
                  {maps.map((m) => (
                    <button
                      type="button"
                      key={m.id}
                      role="tab"
                      aria-selected={m.id === current.id}
                      className="editorial-button editorial-maptabs__tab"
                      onClick={() => { setOpenMapId(m.id); setPlacing(null); setGround(null); }}
                    >
                      {m.purpose || `Map ${maps.indexOf(m) + 1}`}
                    </button>
                  ))}
                </div>
              ) : (
                <h2 className="editorial-section-title">
                  {current.purpose || 'The map'}
                </h2>
              )}
              <span className="editorial-mapband__count">
                {`${current.pins.length} of ${place.data?.inside.length ?? 0} placed`}
              </span>
            </div>

            <MapDetails
              map={current}
              only={maps.length === 1}
              onChanged={() => { place.retry(); index.retry(); }}
              onSaid={setSaid}
            />

            <div className="editorial-mapband__body">
              <div className="editorial-mapband__stage">
                <MapCanvas
                  url={current.url}
                  alt={`Map of ${place.data?.place.name ?? 'this place'}`}
                  pins={current.pins}
                  activeId={activePin}
                  placing={placing}
                  onMove={putPin}
                  onSelect={(pin: MapPin) => setActivePin(pin.locationId)}
                  onOpenGround={onOpenGround}
                />
                {ground && (
                  <OpenGround
                    at={ground}
                    onName={nameIt}
                    onAsk={askHere}
                    onClose={() => setGround(null)}
                  />
                )}
              </div>

              <aside className="editorial-mapband__rail">
                <h3 className="editorial-rail__title">Not on this map</h3>
                {unplaced.length === 0 ? (
                  <p className="editorial-rail__note">
                    {place.data?.inside.length
                      ? 'Everything inside this place is drawn.'
                      : 'Nothing is recorded inside this place yet. Click the map to add somewhere.'}
                  </p>
                ) : (
                  <ul className="editorial-rail__list">
                    {unplaced.map((u) => (
                      <li key={u.id}>
                        <button
                          type="button"
                          className="editorial-button editorial-rail__row"
                          aria-pressed={placing?.id === u.id}
                          onClick={() => setPlacing(placing?.id === u.id
                            ? null
                            : { id: u.id, name: u.name })}
                        >
                          {u.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {current.pins.some((p) => p.status === 'proposed') && (
                  <>
                    <h3 className="editorial-rail__title">Suggested positions</h3>
                    <p className="editorial-rail__note">
                      Drawn hollow because nobody chose them. Drag one to place it.
                    </p>
                  </>
                )}
              </aside>
            </div>
          </>
        ) : (
          <EmptyState
            title={`${place.data?.place.name ?? 'This place'} has not been drawn`}
            description={'A map here is a backdrop for pins, never a fact: nothing on it enters '
              + 'canon, which is exactly why it can be drawn at all. Ask for one above.'}
          />
        )}
      </section>

      <Candidates
        universeId={universeId}
        placeId={place.data?.place.id ?? null}
        requests={requests.data ?? undefined}
        onChanged={reload}
        onSaid={setSaid}
        onKept={setOpenMapId}
      />

      {place.data && (
        <section className="editorial-band">
          <div className="editorial-section-header">
            <h2 className="editorial-section-title">{place.data.place.name}</h2>
          </div>
          <div className="editorial-placefields">
            <Field
              label="What it is"
              hint="What somebody arriving would find."
              value={place.data.place.description}
              onSave={async (v) => {
                await editorialApi.updatePlace(place.data!.place.id, { description: v });
                place.retry();
              }}
            />
            <Field
              label="History"
              hint="What happened here."
              value={place.data.place.history}
              onSave={async (v) => {
                await editorialApi.updatePlace(place.data!.place.id, { history: v });
                place.retry();
              }}
            />
            <Field
              label="Folklore"
              hint="What is said to have happened here, which need not be what did."
              value={place.data.place.folklore}
              onSave={async (v) => {
                await editorialApi.updatePlace(place.data!.place.id, { folklore: v });
                place.retry();
              }}
            />
            <Field
              label="Biome"
              hint="The physical setting: terrain, climate, what the place is made of."
              value={place.data.place.biome}
              onSave={async (v) => {
                await editorialApi.updatePlace(place.data!.place.id, { biome: v });
                place.retry();
              }}
            />
            <Field
              label="Flora and fauna"
              hint="What grows here and what lives here."
              value={place.data.place.ecology}
              onSave={async (v) => {
                await editorialApi.updatePlace(place.data!.place.id, { ecology: v });
                place.retry();
              }}
            />
          </div>

          {place.data.pictures.length > 0 && (
            <>
              <div className="editorial-section-header">
                <h3 className="editorial-section-title">Pictures</h3>
                <span className="editorial-register__count">
                  {'Not maps: what this place looks like.'}
                </span>
              </div>
              <ul className="editorial-placepics">
                {place.data.pictures.map((pic) => (
                  <li key={pic.id} className="editorial-placepics__item">
                    <img src={pic.url} alt={pic.title || place.data!.place.name} />
                    <span className="editorial-placepics__caption">{pic.title || pic.kind}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      <section className="editorial-band">
        <div className="editorial-section-header">
          <h2 className="editorial-section-title">Every place</h2>
          <span className="editorial-register__count">{`${index.data.places.length} recorded`}</span>
        </div>
        <ul className="editorial-placelist">
          {index.data.places.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="editorial-button editorial-placelist__row"
                aria-pressed={p.id === placeId}
                onClick={() => {
                  setOpenPlaceId(p.id);
                  setOpenMapId(null);
                  setPlacing(null);
                  setGround(null);
                }}
              >
                <span className="editorial-placelist__name">{p.name}</span>
                <span className="editorial-placelist__meta">
                  {[
                    p.mapCount ? `${p.mapCount} map${p.mapCount > 1 ? 's' : ''}` : 'not drawn',
                    p.insideCount ? `${p.insideCount} inside` : null,
                    p.regionType || null,
                  ].filter(Boolean).join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </Surface>
  );
}

/**
 * What came back, waiting to be kept or refused.
 *
 * Both kinds live here because they are the same moment: something was asked
 * for, an answer arrived, and nothing has changed yet. Keeping is the only act
 * that writes anything.
 */
function Candidates({
  universeId, placeId, requests, onChanged, onSaid, onKept,
}: {
  universeId: string;
  placeId: string | null;
  requests?: { maps: CanonRequest[]; places: CanonRequest[] };
  onChanged: () => void;
  onSaid: (s: string) => void;
  onKept: (mapId: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const mapRows = (requests?.maps ?? []).filter((r) => r.payload?.proposed);
  const placeRows = (requests?.places ?? []).filter((r) => r.payload?.proposed);
  const waiting = [...(requests?.maps ?? []), ...(requests?.places ?? [])]
    .filter((r) => !r.payload?.proposed).length;

  if (!mapRows.length && !placeRows.length && !waiting) return null;

  const keepMap = async (row: CanonRequest, url: string) => {
    const target = (row.payload as { locationId?: string }).locationId ?? placeId;
    if (!target) return;
    setBusy(row.id);
    try {
      const kept = await editorialApi.keepMap(target, { url });
      await editorialApi.resolveCanonRequest(row.id, 'accepted');
      // Open what was just chosen. Keeping a map and being shown a different
      // one reads as the click having gone somewhere else.
      onKept(kept.map.id);
      onSaid(kept.stored
        ? 'Kept, and the picture was copied onto storage.'
        : `Kept, but not copied: ${kept.storage}`);
      onChanged();
    } catch (e) {
      onSaid(`Not kept: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(null); }
  };

  const keepPlace = async (row: CanonRequest) => {
    const p = row.payload as {
      parentId?: string; mapId?: string; at?: { x: number; y: number };
      proposed?: { name: string; description: string; history: string };
    };
    if (!p.proposed?.name || !p.parentId) return;
    setBusy(row.id);
    try {
      const created = await editorialApi.createPlace(universeId, {
        name: p.proposed.name,
        description: p.proposed.description,
        parentId: p.parentId,
      });
      if (p.proposed.history) {
        await editorialApi.updatePlace(String(created.id), { history: p.proposed.history });
      }
      if (p.mapId && p.at) {
        await editorialApi.placePin(p.mapId, String(created.id), { ...p.at, status: 'placed' });
      }
      await editorialApi.resolveCanonRequest(row.id, 'accepted');
      onSaid(`${p.proposed.name} is now a place in this universe, with its own record.`);
      onChanged();
    } catch (e) {
      onSaid(`Not created: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(null); }
  };

  const refuse = async (row: CanonRequest) => {
    setBusy(row.id);
    try {
      await editorialApi.resolveCanonRequest(row.id, 'rejected');
      onChanged();
    } finally { setBusy(null); }
  };

  return (
    <section className="editorial-band">
      <div className="editorial-section-header">
        <h2 className="editorial-section-title">Waiting on you</h2>
        <span className="editorial-register__count">{CANDIDATE_NOTE}</span>
      </div>

      {waiting > 0 && (
        <p className="editorial-rail__note" role="status">
          {`${waiting} still being written.`}
        </p>
      )}

      {placeRows.map((row) => {
        const p = row.payload as {
          proposed?: { name: string; description: string; history: string; why: string };
        };
        return (
          <article className="editorial-proposal" key={row.id}>
            <h3 className="editorial-proposal__name">{p.proposed?.name}</h3>
            {p.proposed?.why && <p className="editorial-proposal__why">{p.proposed.why}</p>}
            <p className="editorial-proposal__prose">{p.proposed?.description}</p>
            {p.proposed?.history && <p className="editorial-proposal__prose">{p.proposed.history}</p>}
            <div className="editorial-field__actions">
              <button
                type="button"
                className="editorial-button editorial-button--secondary"
                disabled={busy === row.id}
                onClick={() => keepPlace(row)}
              >
                {busy === row.id ? 'Creating…' : 'Create it here'}
              </button>
              <button
                type="button"
                className="editorial-link editorial-link--discard"
                disabled={busy === row.id}
                onClick={() => refuse(row)}
              >
                Refuse
              </button>
            </div>
          </article>
        );
      })}

      {mapRows.map((row) => {
        const images = (row.payload as { proposed?: { images?: string[] } }).proposed?.images ?? [];
        return (
          <div className="editorial-candidates" key={row.id}>
            {images.map((url) => (
              <figure className="editorial-candidates__item" key={url}>
                <img src={url} alt="A candidate map" />
                <figcaption>
                  <button
                    type="button"
                    className="editorial-button editorial-button--secondary"
                    disabled={busy === row.id}
                    onClick={() => keepMap(row, url)}
                  >
                    {busy === row.id ? 'Keeping…' : 'Keep this one'}
                  </button>
                </figcaption>
              </figure>
            ))}
            <button
              type="button"
              className="editorial-link editorial-link--discard"
              disabled={busy === row.id}
              onClick={() => refuse(row)}
            >
              Keep none of these
            </button>
          </div>
        );
      })}
    </section>
  );
}
