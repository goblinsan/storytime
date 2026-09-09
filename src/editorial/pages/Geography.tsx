import { useCallback, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  editorialApi, type CanonRequest, type MapPin, type PlaceGeography, type PlaceMap,
  type PlacesIndex,
} from '../api';
import { useAsync, useRefreshWhile } from '../useAsync';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import Surface from '../components/Surface';
import MapCanvas from '../components/MapCanvas';
import SurfaceMasthead from '../components/SurfaceMasthead';

/**
 * A place, as you would meet it.
 *
 * The first version of this made the map the page: a plan with a pin rail
 * beside it, permanently in editing posture. That is the wrong front door. You
 * come to a place to see it, and the picture is what shows you; the plan is a
 * tool for a job you are sometimes doing, and a tool left out on the table is
 * clutter for everybody who is not currently using it.
 *
 * So the picture leads, the record reads under it, and the maps are a shelf
 * you open one from. Editing pins is a mode you enter and leave.
 *
 * A PICTURE IS NOT A MAP, AND ASKING FOR ONE IS NOT ASKING FOR THE OTHER
 * They are separate requests with opposite prompts. A map is a diagram, so the
 * cartographic framing has to lead or the model draws the place instead of a
 * plan of it. A picture IS the work's illustration style, applied to a place,
 * seen from inside it. Both were learned from one failure: asked for a map
 * with the style leading, the model returned a three-quarter view of a station
 * in space -- useless as a map, and exactly right as a picture.
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

const CANDIDATE_NOTE = 'Nothing here changes the universe until you keep it.';

/**
 * A stored type, said in words.
 *
 * `ruined_installation` is how the database spells it. Printing that in a
 * codex about literary worldbuilding puts a schema identifier on the reading
 * surface, which is the one place it must never be.
 */
const inWords = (raw: string) => (raw
  ? raw.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
  : '');

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
      // Flipped rather than fixed. It always opened down-and-right from the
      // click, so a click in the right third of the map put most of a 304px
      // panel off-screen, and one low down pushed its last two choices below
      // the fold. The anchor is chosen from where the click landed.
      className="editorial-openground"
      data-flip-x={at.x > 0.55 || undefined}
      data-flip-y={at.y > 0.55 || undefined}
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
  const [confirming, setConfirming] = useState(false);

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
      {/* The cost is named before the act, not after it. This used to be a
          64px text link sitting at the same weight as "Rename", one click
          from deleting every position somebody had placed by hand, with the
          count of what went arriving in the past tense. */}
      {confirming ? (
        <span className="editorial-mapdetails__confirm">
          <span>
            {map.pins.length
              ? `This becomes a picture of the place. Its ${map.pins.length} `
                + `${map.pins.length === 1 ? 'pin goes' : 'pins go'} with the plan.`
              : 'This becomes a picture of the place. It has no pins to lose.'}
          </span>
          <button
            type="button"
            className="editorial-button editorial-button--secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const out = await editorialApi.notAMap(map.id);
                onSaid(out.detail);
                onChanged();
              } catch (e) {
                onSaid(`Not moved: ${e instanceof Error ? e.message : String(e)}`);
              } finally { setBusy(false); setConfirming(false); }
            }}
          >
            {busy ? 'Moving…' : 'Make it a picture'}
          </button>
          <button type="button" className="editorial-link" onClick={() => setConfirming(false)}>
            Keep the map
          </button>
        </span>
      ) : (
        <button
          type="button"
          className="editorial-link editorial-link--discard"
          disabled={busy}
          onClick={() => setConfirming(true)}
        >
          {map.pins.length
            ? `Not a map (loses ${map.pins.length} ${map.pins.length === 1 ? 'pin' : 'pins'})`
            : 'Not a map'}
        </button>
      )}
    </p>
  );
}
/**
 * The picture of the place, at the size a picture deserves.
 *
 * This is the front door. A place is a thing you look at before it is a thing
 * you plan, and the illustration is what carries the sense of it -- the light,
 * the weather, whether you would want to be there. The plan cannot do that and
 * was never going to.
 *
 * Several pictures are a set to move through rather than a grid to scan: they
 * are all of the same place, so they belong in one frame, one at a time.
 */
function Hero({
  place, pictures, asking, onAsk, onDrop,
}: {
  place: { name: string; regionType: string };
  pictures: Array<{ id: string; url: string; kind: string; title: string; caption: string }>;
  asking: boolean;
  onAsk: () => void;
  onDrop: (assetId: string) => void;
}) {
  const [at, setAt] = useState(0);
  const [dropping, setDropping] = useState(false);
  const showing = pictures[Math.min(at, pictures.length - 1)];

  if (!showing) {
    return (
      <section className="editorial-band editorial-hero editorial-hero--absent">
        <p className="editorial-hero__nothing">
          {`No picture of ${place.name} yet. `}
          {'A picture is the work’s own illustration style applied to this place, '
            + 'seen from inside it, and nothing it shows becomes canon.'}
        </p>
        <button type="button" className="editorial-button" disabled={asking} onClick={onAsk}>
          {asking ? 'Drawing…' : 'Ask for a picture'}
        </button>
      </section>
    );
  }

  return (
    <section className="editorial-band editorial-hero">
      <figure className="editorial-hero__frame">
        <img className="editorial-hero__image" src={showing.url} alt={showing.title || place.name} />
        <figcaption className="editorial-hero__caption">
          <span className="editorial-hero__title">{showing.title || place.name}</span>
          {place.regionType && (
            <span className="editorial-hero__kind">{inWords(place.regionType)}</span>
          )}

          {/* The picture's own controls, grouped and next to it. "Remove" used
              to be one small link at the far end of this row, where it read as
              page furniture rather than as something belonging to the picture
              -- and it deleted on the first click. */}
          {dropping ? (
            <span className="editorial-hero__confirm">
              <span>Remove this picture? The place keeps everything else.</span>
              <button
                type="button"
                className="editorial-button editorial-button--secondary"
                onClick={() => { onDrop(showing.id); setDropping(false); setAt(0); }}
              >
                Remove it
              </button>
              <button type="button" className="editorial-link" onClick={() => setDropping(false)}>
                Keep it
              </button>
            </span>
          ) : (
            <span className="editorial-hero__actions">
              <button type="button" className="editorial-link" disabled={asking} onClick={onAsk}>
                {asking ? 'Drawing…' : 'Ask for another'}
              </button>
              <button
                type="button"
                className="editorial-link editorial-link--discard"
                onClick={() => setDropping(true)}
              >
                Remove this picture
              </button>
            </span>
          )}
        </figcaption>
      </figure>

      {pictures.length > 1 && (
        <div className="editorial-hero__others">
          {pictures.map((pic, i) => (
            <button
              type="button"
              key={pic.id}
              className="editorial-button editorial-hero__other"
              aria-pressed={i === at}
              aria-label={pic.title || `Picture ${i + 1} of ${place.name}`}
              onClick={() => setAt(i)}
            >
              <img src={pic.url} alt="" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * The maps of this place, closed.
 *
 * A shelf, not a workspace. Each one says what it is for and how much of the
 * place is on it, which is the pair of facts that decides whether it is worth
 * opening. Editing is behind a click, because a plan left open in editing
 * posture is a tool somebody left on the table.
 */
function MapShelf({
  maps, inside, asking, onOpen, onAsk,
}: {
  maps: PlaceMap[];
  inside: number;
  asking: boolean;
  onOpen: (mapId: string) => void;
  onAsk: () => void;
}) {
  return (
    <section className="editorial-band">
      <div className="editorial-section-header">
        <h2 className="editorial-section-title">Maps</h2>
        <button type="button" className="editorial-link" disabled={asking} onClick={onAsk}>
          {asking ? 'Drawing…' : 'Ask for a map'}
        </button>
      </div>

      {maps.length === 0 ? (
        <p className="editorial-rail__note">
          {'No plan of this place yet. A map is a backdrop for pins, never a fact: nothing '
            + 'drawn on it enters canon, which is exactly why it can be drawn at all.'}
        </p>
      ) : (
        <ul className="editorial-mapshelf">
          {maps.map((m, i) => (
            <li key={m.id}>
              <button
                type="button"
                className="editorial-button editorial-mapshelf__item"
                onClick={() => onOpen(m.id)}
              >
                <img src={m.url} alt="" className="editorial-mapshelf__thumb" />
                <span className="editorial-mapshelf__name">
                  {m.purpose || `Map ${i + 1}`}
                </span>
                <span className="editorial-mapshelf__meta">
                  {/* What decides whether this is worth opening: not its name,
                      which is often absent, but how much of the place is on
                      it. Two maps both called "Map" are told apart by this. */}
                  {inside === 0
                    ? 'nothing recorded inside this place yet'
                    : `${m.pins.length} of ${inside} placed`}
                  {m.isPrimary && inside > 0 ? ' · opens first' : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Editing one map. A mode, entered deliberately and left the same way.
 *
 * Everything positional lives here and nowhere else, so the reading page never
 * has a pin rail on it and this one never has to be half a reading page.
 */
function MapEditor({
  place, map, only, unplaced, inside, placing, ground, activePin,
  onBack, onPutPin, onOpenGround, onCloseGround, onSelectPin, onSetPlacing,
  onName, onAsk, onChanged, onSaid,
}: {
  place: { id: string; name: string };
  map: PlaceMap;
  only: boolean;
  unplaced: Array<{ id: string; name: string }>;
  inside: number;
  placing: { id: string; name: string } | null;
  ground: { x: number; y: number } | null;
  activePin: string | null;
  onBack: () => void;
  onPutPin: (locationId: string, at: { x: number; y: number }) => void;
  onOpenGround: (at: { x: number; y: number }) => void;
  onCloseGround: () => void;
  onSelectPin: (id: string) => void;
  onSetPlacing: (p: { id: string; name: string } | null) => void;
  onName: (name: string) => Promise<void>;
  onAsk: (note: string) => Promise<void>;
  onChanged: () => void;
  onSaid: (s: string) => void;
}) {
  return (
    <section className="editorial-band">
      <div className="editorial-section-header">
        <h2 className="editorial-section-title" id="editing-map">
          {map.purpose || `A map of ${place.name}`}
        </h2>
        <div className="editorial-section-header__actions">
          <span className="editorial-mapband__count">
            {`${map.pins.length} of ${inside} placed`}
          </span>
          <button type="button" className="editorial-button" onClick={onBack}>
            Done
          </button>
        </div>
      </div>

      <MapDetails map={map} only={only} onChanged={onChanged} onSaid={onSaid} />

      <div className="editorial-mapband__body">
        <div className="editorial-mapband__stage">
          <MapCanvas
            url={map.url}
            alt={`Map of ${place.name}`}
            pins={map.pins}
            activeId={activePin}
            placing={placing}
            onMove={onPutPin}
            onSelect={(pin: MapPin) => onSelectPin(pin.locationId)}
            onOpenGround={onOpenGround}
          />
          {ground && (
            <OpenGround at={ground} onName={onName} onAsk={onAsk} onClose={onCloseGround} />
          )}
        </div>

        <aside className="editorial-mapband__rail">
          <h3 className="editorial-rail__title">Not on this map</h3>
          {unplaced.length === 0 ? (
            <p className="editorial-rail__note">
              {inside
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
                    onClick={() => onSetPlacing(
                      placing?.id === u.id ? null : { id: u.id, name: u.name },
                    )}
                  >
                    {u.name}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {map.pins.some((p) => p.status === 'proposed') && (
            <>
              <h3 className="editorial-rail__title">Suggested positions</h3>
              <p className="editorial-rail__note">
                Drawn hollow because nobody chose them. Drag one to place it.
              </p>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}

type PlaceRow = PlacesIndex['places'][number];
type Cut = 'inside' | 'kind' | 'imagery';

const CUT_LABEL: Record<Cut, string> = {
  inside: 'What contains it',
  kind: 'Kind',
  imagery: 'Pictured',
};

/**
 * What a place has to look at.
 *
 * This was one flag called "drawn", which meant "has a map". Reclassifying a
 * picture that had been catalogued as a map -- the whole point of the "not a
 * map" control -- therefore moved a place from "drawn" to "not drawn", which
 * is the opposite of what had just happened to it. A picture and a plan are
 * different things and answer different questions, so they are counted apart.
 */
const imageryOf = (p: PlaceRow) => {
  if (p.pictureCount > 0 && p.mapCount > 0) return 'Pictured and mapped';
  if (p.pictureCount > 0) return 'Pictured';
  if (p.mapCount > 0) return 'Mapped only';
  return 'Nothing to look at yet';
};

/** What a row says about itself, beyond its name. */
const metaOf = (p: PlaceRow, cut: Cut) => [
  p.pictureCount ? `${p.pictureCount} picture${p.pictureCount > 1 ? 's' : ''}` : null,
  p.mapCount ? `${p.mapCount} map${p.mapCount > 1 ? 's' : ''}` : null,
  cut === 'inside' ? null : (p.insideCount ? `${p.insideCount} inside` : null),
  cut === 'kind' ? null : inWords(p.regionType) || null,
].filter(Boolean).join(' · ');

/**
 * One place in the containment tree, and everything under it.
 *
 * Recursive rather than one level of grouping: a universe nests -- a system
 * holds a world holds a station holds a deck -- and flattening that to
 * "grouped by immediate parent" scatters one chain of containment across four
 * unrelated headings.
 *
 * Two controls on a row, because there are two things to do with a place that
 * contains others: look at it, and see what is in it. The disclosure is its
 * own button so that opening a place never expands it by accident, and
 * expanding never navigates away from what you are reading.
 */
function TreeNode({
  place, under, depth, openId, onOpen, opened, revealing, onToggle,
}: {
  place: PlaceRow;
  // Not `children`: React owns that prop name, and anything nested inside the
  // element would silently replace it.
  under: Map<string | null, PlaceRow[]>;
  depth: number;
  openId: string | null;
  onOpen: (id: string) => void;
  opened: Record<string, boolean>;
  /** Ancestors of the open place, shown unless somebody has closed them. */
  revealing: Set<string>;
  onToggle: (id: string) => void;
}) {
  const inside = under.get(place.id) ?? [];
  const isOpen = opened[place.id] ?? revealing.has(place.id);

  return (
    <li className="editorial-tree__node">
      <div className="editorial-tree__row" style={{ paddingLeft: `${depth * 1.25}rem` }}>
        {inside.length > 0 ? (
          <button
            type="button"
            className="editorial-button editorial-button--ghost editorial-tree__disclose"
            aria-expanded={isOpen}
            aria-label={`${isOpen ? 'Hide' : 'Show'} what is inside ${place.name}`}
            onClick={() => onToggle(place.id)}
          >
            <span className="editorial-house__mark" aria-hidden="true" data-open={isOpen || undefined} />
          </button>
        ) : (
          <span className="editorial-tree__gutter" aria-hidden="true" />
        )}

        <button
          type="button"
          className="editorial-button editorial-placelist__row editorial-tree__name"
          aria-pressed={place.id === openId}
          onClick={() => onOpen(place.id)}
        >
          <span className="editorial-placelist__name">{place.name}</span>
          <span className="editorial-placelist__meta">
            {[
              metaOf(place, 'inside'),
              inside.length ? `${inside.length} inside` : null,
            ].filter(Boolean).join(' · ')}
          </span>
        </button>
      </div>

      {isOpen && inside.length > 0 && (
        <ul className="editorial-tree">
          {inside.map((child) => (
            <TreeNode
              key={child.id}
              place={child}
              under={under}
              depth={depth + 1}
              openId={openId}
              onOpen={onOpen}
              opened={opened}
              revealing={revealing}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * Every place, as an index rather than a heap.
 *
 * It was thirty-one rows sorted by first letter, which is the exact artifact
 * this page opens by rejecting: the containment is right there in the payload
 * and sorting alphabetically flattens the one structure geography has.
 *
 * Built on the cast list's vocabulary because it is the same problem and the
 * reader has already learned the controls: a cut across the top, a filter, and
 * groups that carry their own count.
 */
function PlaceIndex({
  places, openId, onOpen,
}: {
  places: PlaceRow[];
  openId: string | null;
  onOpen: (id: string) => void;
}) {
  const [cut, setCut] = useState<Cut>('inside');
  const [term, setTerm] = useState('');
  const [shut, setShut] = useState<Record<string, boolean>>({});
  const [opened, setOpened] = useState<Record<string, boolean>>({});

  /**
   * The line of containment down to the open place.
   *
   * Derived, not synchronised. A place chosen from anywhere but the tree -- a
   * URL, a reload, a link -- left the tree closed, so the selected row was
   * hidden inside a collapsed ancestor and the index looked like it had
   * nothing selected. Writing that into state from an effect would be a
   * render deciding what the next render should hold; the tree simply asks
   * where the selection is when it draws.
   */
  const revealing = useMemo(() => {
    const found = new Set<string>();
    if (!openId) return found;
    const by = new Map(places.map((p) => [p.id, p]));
    let at = by.get(openId)?.parentId ?? null;
    // Guarded against a cycle rather than trusting the data: a place that
    // contains itself would spin here forever.
    while (at && by.has(at) && !found.has(at)) {
      found.add(at);
      at = by.get(at)?.parentId ?? null;
    }
    return found;
  }, [openId, places]);

  const hunted = term.trim().toLowerCase();

  const rows = useMemo(() => (hunted
    ? places.filter((p) => `${p.name} ${p.regionType}`.toLowerCase().includes(hunted))
    : places), [places, hunted]);

  /** Parent id to its children, for the containment tree. */
  const tree = useMemo(() => {
    const has = new Set(places.map((p) => p.id));
    const byParent = new Map<string | null, PlaceRow[]>();
    for (const p of places) {
      // A place whose parent is not in this universe's set is outermost here,
      // not orphaned: the alternative is a row that exists and can never be
      // reached from the top.
      const key = p.parentId && has.has(p.parentId) ? p.parentId : null;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(p);
    }
    for (const list of byParent.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return byParent;
  }, [places]);

  const groups = useMemo(() => {
    const key = (p: PlaceRow) => (cut === 'kind'
      ? (inWords(p.regionType) || 'Unclassified')
      : imageryOf(p));

    const held = new Map<string, PlaceRow[]>();
    for (const p of rows) {
      const k = key(p);
      if (!held.has(k)) held.set(k, []);
      held.get(k)!.push(p);
    }
    return [...held.entries()]
      .map(([label, entries]) => ({
        label,
        entries: entries.sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => b.entries.length - a.entries.length || a.label.localeCompare(b.label));
  }, [rows, cut]);

  const roots = tree.get(null) ?? [];

  return (
    <div className="editorial-cast-column">
      <div className="editorial-section-header">
        <h2 className="editorial-section-title">Every place</h2>
        <span className="editorial-register__count">
          {hunted ? `${rows.length} of ${places.length}` : `${places.length} recorded`}
        </span>
      </div>

      <div className="editorial-cast-tiers editorial-cast-tiers--stacked">
        <div className="editorial-cast-tiers__group" role="group" aria-label="How to group these">
          {(Object.keys(CUT_LABEL) as Cut[]).map((c) => (
            <button
              key={c}
              type="button"
              className="editorial-button editorial-button--toggle"
              aria-pressed={cut === c}
              onClick={() => setCut(c)}
            >
              <span>{CUT_LABEL[c]}</span>
            </button>
          ))}
        </div>

        <input
          className="editorial-cast-search"
          type="search"
          value={term}
          placeholder="Find a place"
          aria-label="Find a place by name"
          onChange={(e) => setTerm(e.target.value)}
        />
      </div>

      <nav className="editorial-pane editorial-pane--cast" aria-label="Every place">
        {rows.length === 0 ? (
          <p className="editorial-rail__note">{`Nothing here is called “${term.trim()}”.`}</p>
        ) : cut === 'inside' && !hunted ? (
          // The tree, closed. Searching leaves it, because a filtered tree
          // hides its own matches behind collapsed ancestors.
          <ul className="editorial-tree editorial-tree--root">
            {roots.map((root) => (
              <TreeNode
                key={root.id}
                place={root}
                under={tree}
                depth={0}
                openId={openId}
                onOpen={onOpen}
                opened={opened}
                revealing={revealing}
                onToggle={(id) => setOpened((was) => ({
                  ...was, [id]: !(was[id] ?? revealing.has(id)),
                }))}
              />
            ))}
          </ul>
        ) : groups.map((group) => {
          const open = !shut[group.label];
          return (
            <section className="editorial-cast-group" key={group.label}>
              <h3 className="editorial-house">
                <button
                  type="button"
                  className="editorial-button editorial-button--ghost editorial-house__toggle"
                  aria-expanded={open}
                  onClick={() => setShut((was) => ({ ...was, [group.label]: open }))}
                >
                  <span className="editorial-house__mark" aria-hidden="true" data-open={open || undefined} />
                  <span className="editorial-house__name">{group.label}</span>
                  <span className="editorial-house__summary">
                    {`${group.entries.length} ${group.entries.length === 1 ? 'place' : 'places'}`}
                  </span>
                </button>
              </h3>

              {open && (
                <ul className="editorial-placelist">
                  {group.entries.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="editorial-button editorial-placelist__row"
                        aria-pressed={p.id === openId}
                        onClick={() => onOpen(p.id)}
                      >
                        <span className="editorial-placelist__name">{p.name}</span>
                        <span className="editorial-placelist__meta">{metaOf(p, cut)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </nav>
    </div>
  );
}

export default function Geography() {
  const { id: universeId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const openPlaceId = params.get('place');
  const [editingMapId, setEditingMapId] = useState<string | null>(null);
  const [placing, setPlacing] = useState<{ id: string; name: string } | null>(null);
  const [ground, setGround] = useState<{ x: number; y: number } | null>(null);
  const [activePin, setActivePin] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [asking, setAsking] = useState<'map' | 'picture' | null>(null);

  const universe = useAsync((s) => editorialApi.getUniverse(universeId, s), [universeId]);
  const index = useAsync((s) => editorialApi.listPlaces(universeId, s), [universeId]);
  const placeId = openPlaceId ?? index.data?.opens ?? null;

  const choose = useCallback((id: string | null) => {
    const merged = new URLSearchParams(params);
    if (id) merged.set('place', id); else merged.delete('place');
    setParams(merged);
  }, [params, setParams]);

  const place = useAsync<PlaceGeography | null>(
    (s) => (placeId ? editorialApi.getPlace(placeId, s) : Promise.resolve(null)),
    [placeId],
  );

  const requests = useAsync(
    async (s) => ({
      maps: await editorialApi.listMapRequests(universeId, s),
      places: await editorialApi.listPlaceRequests(universeId, s),
      pictures: await editorialApi.listPlacePictureRequests(universeId, s),
    }),
    [universeId],
  );

  // An agent answers minutes later and from somewhere else, so a page that
  // asked has no way to hear about it. Stops the moment nothing is waiting.
  const outstanding = useMemo(() => {
    const rows = [
      ...(requests.data?.maps ?? []),
      ...(requests.data?.places ?? []),
      ...(requests.data?.pictures ?? []),
    ];
    return rows.some((r) => !r.payload?.proposed);
  }, [requests.data]);
  useRefreshWhile(outstanding, requests.retry);

  const reload = useCallback(() => {
    place.retry();
    index.retry();
    requests.retry();
  }, [place, index, requests]);

  /**
   * Whether this place already has an unanswered request of a kind.
   *
   * `asking` only covered the round trip that files the request, which takes a
   * moment, so the control re-enabled long before the answer arrived and two
   * pictures could be asked for before either appeared. What should disable it
   * is an outstanding request, which is a fact about the queue.
   */
  const pending = useCallback((kind: 'map' | 'picture') => {
    const rows = kind === 'map' ? requests.data?.maps : requests.data?.pictures;
    return (rows ?? []).some(
      (r) => !r.payload?.proposed
        && (r.payload as { locationId?: string }).locationId === placeId,
    );
  }, [requests.data, placeId]);

  const maps = place.data?.maps ?? [];
  const editing: PlaceMap | null = maps.find((m) => m.id === editingMapId) ?? null;
  const unplaced = editing ? (place.data?.unplaced?.[editing.id] ?? []) : [];

  const putPin = async (locationId: string, at: { x: number; y: number }) => {
    if (!editing) return;
    try {
      await editorialApi.placePin(editing.id, locationId, { ...at, status: 'placed' });
      setPlacing(null);
      place.retry();
    } catch (e) {
      // This used to be awaited with nothing around it, so a refusal was an
      // unhandled rejection and the click simply appeared to do nothing.
      setSaid(`Not placed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const onOpenGround = (at: { x: number; y: number }) => {
    if (placing) { void putPin(placing.id, at); return; }
    setGround(at);
  };

  const nameIt = async (name: string) => {
    if (!editing || !place.data) return;
    // Reuse rather than duplicate: a place that already exists by this name is
    // the same place, and making a second one is how a universe ends up with
    // two Salt Harbours that disagree.
    const already = index.data?.places.find(
      (p) => p.name.trim().toLowerCase() === name.trim().toLowerCase(),
    );
    const row = already ?? await editorialApi.createPlace(universeId, {
      name, parentId: place.data.place.id,
    });
    await editorialApi.placePin(editing.id, String(row.id), { ...ground!, status: 'placed' });
    setSaid(already
      ? `${name} was already recorded, so it was pinned rather than created again.`
      : `${name} is now a place in this universe, with its own record.`);
    reload();
  };

  const askHere = async (note: string) => {
    if (!editing || !place.data) return;
    await editorialApi.askForPlace(universeId, place.data.place.id, editing.id, ground!, note);
    setSaid('Asked. The proposal arrives below when it is written.');
    requests.retry();
  };

  const ask = async (what: 'map' | 'picture') => {
    if (!place.data) return;
    setAsking(what);
    setSaid(null);
    try {
      if (what === 'map') await editorialApi.askForMap(universeId, place.data.place.id);
      else await editorialApi.askForPlacePicture(universeId, place.data.place.id);
      setSaid(what === 'map'
        ? `Drawing a plan of ${place.data.place.name}. Candidates appear below.`
        : `Drawing ${place.data.place.name}. Candidates appear below.`);
      requests.retry();
    } catch (e) {
      setSaid(`Not asked: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setAsking(null); }
  };

  const dropPicture = async (assetId: string) => {
    try {
      await editorialApi.removePicture(assetId);
      setSaid('Removed.');
      place.retry();
    } catch (e) {
      setSaid(`Not removed: ${e instanceof Error ? e.message : String(e)}`);
    }
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

  const seen = index.data.places.filter((p) => p.mapCount > 0 || p.pictureCount > 0).length;

  return (
    <Surface name="geography">
      {/* Index on the left, the place on the right, one rule down the gutter.
          The index used to sit at the foot of the page under everything else,
          which made choosing a place a scroll to the bottom and back. It is
          the navigation, so it is beside what it navigates. */}
      <div className="editorial-family-workspace" data-mobile-view={openPlaceId ? 'record' : 'cast'}>
        <SurfaceMasthead
          title={universe.data?.title ?? 'Geography'}
          standfirst={`${index.data.places.length} places, ${seen} with something to look at.`}
          status={said}
        />

        <div className="editorial-panes">
          <PlaceIndex
            places={index.data.places}
            openId={placeId}
            onOpen={(id) => {
              choose(id);
              setEditingMapId(null);
              setPlacing(null);
              setGround(null);
            }}
          />

          <div className="editorial-pane editorial-pane--record">
            {editing && place.data ? (
              <MapEditor
                place={place.data.place}
                map={editing}
                only={maps.length === 1}
                unplaced={unplaced}
                inside={place.data.inside.length}
                placing={placing}
                ground={ground}
                activePin={activePin}
                onBack={() => { setEditingMapId(null); setPlacing(null); setGround(null); }}
                onPutPin={putPin}
                onOpenGround={onOpenGround}
                onCloseGround={() => setGround(null)}
                onSelectPin={setActivePin}
                onSetPlacing={setPlacing}
                onName={nameIt}
                onAsk={askHere}
                onChanged={reload}
                onSaid={setSaid}
              />
            ) : place.data && (
              <>
                <div className="editorial-section-header editorial-place-head">
                  <h2 className="editorial-section-title">{place.data.place.name}</h2>
                  <button
                    type="button"
                    className="editorial-link"
                    disabled={asking !== null || pending('picture')}
                    onClick={() => ask('picture')}
                  >
                    {asking === 'picture' || pending('picture') ? 'Drawing…' : 'Ask for a picture'}
                  </button>
                </div>

                <Hero
                  place={place.data.place}
                  pictures={place.data.pictures}
                  asking={asking === 'picture' || pending('picture')}
                  onAsk={() => ask('picture')}
                  onDrop={dropPicture}
                />

                <section className="editorial-band">
                  <div className="editorial-section-header">
                    <h2 className="editorial-section-title">The record</h2>
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
                </section>

                <MapShelf
                  maps={maps}
                  inside={place.data.inside.length}
                  asking={asking === 'map' || pending('map')}
                  onOpen={(mapId) => { setEditingMapId(mapId); setSaid(null); }}
                  onAsk={() => ask('map')}
                />
              </>
            )}

            <Candidates
              universeId={universeId}
              placeId={place.data?.place.id ?? null}
              requests={requests.data ?? undefined}
              onChanged={reload}
              onSaid={setSaid}
              onKept={setEditingMapId}
            />
          </div>
        </div>
      </div>
    </Surface>
  );
}

function Candidates({
  universeId, placeId, requests, onChanged, onSaid, onKept,
}: {
  universeId: string;
  placeId: string | null;
  requests?: { maps: CanonRequest[]; places: CanonRequest[]; pictures: CanonRequest[] };
  onChanged: () => void;
  onSaid: (s: string) => void;
  onKept: (mapId: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const mapRows = (requests?.maps ?? []).filter((r) => r.payload?.proposed);
  const placeRows = (requests?.places ?? []).filter((r) => r.payload?.proposed);
  // Loaded and counted as outstanding from the beginning, and never rendered:
  // two pictures were asked for, both were drawn, and the answers had nowhere
  // on the page to appear.
  const pictureRows = (requests?.pictures ?? []).filter((r) => r.payload?.proposed);
  const waiting = [...(requests?.maps ?? []), ...(requests?.places ?? []), ...(requests?.pictures ?? [])]
    .filter((r) => !r.payload?.proposed).length;

  if (!mapRows.length && !placeRows.length && !pictureRows.length && !waiting) return null;

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

  const keepPicture = async (row: CanonRequest, url: string) => {
    const target = (row.payload as { locationId?: string }).locationId ?? placeId;
    if (!target) return;
    setBusy(row.id);
    try {
      const kept = await editorialApi.keepPlacePicture(universeId, target, url, '');
      await editorialApi.resolveCanonRequest(row.id, 'accepted');
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
    } catch (e) {
      // try/finally with no catch made a refused request an unhandled
      // rejection: the click looked like it had done nothing at all.
      onSaid(`Not refused: ${e instanceof Error ? e.message : String(e)}`);
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

      {pictureRows.map((row) => {
        const images = (row.payload as { proposed?: { images?: string[] } }).proposed?.images ?? [];
        return (
          <div className="editorial-candidates" key={row.id}>
            {images.map((url) => (
              <figure className="editorial-candidates__item" key={url}>
                <img src={url} alt="A candidate picture of this place" />
                <figcaption>
                  <button
                    type="button"
                    className="editorial-button editorial-button--secondary"
                    disabled={busy === row.id}
                    onClick={() => keepPicture(row, url)}
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
