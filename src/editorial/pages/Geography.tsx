import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import BackToList from '../components/BackToList';
import { CanonField } from '../components/CanonField';

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
/**
 * What a place record holds, in reading order.
 *
 * One list, because the Collaborate at the top asks for all of it and the one
 * beside a section asks for that section. Two lists would eventually disagree
 * about what a place is.
 */
const PLACE_FIELDS: Array<{ key: string; label: string; hint: string }> = [
  { key: 'description', label: 'What it is', hint: 'What somebody arriving would find.' },
  { key: 'history', label: 'History', hint: 'What happened here.' },
  {
    key: 'folklore',
    label: 'Folklore',
    hint: 'What is said to have happened here, which need not be what did.',
  },
  {
    key: 'biome',
    label: 'Biome',
    hint: 'The physical setting: terrain, climate, what the place is made of.',
  },
  { key: 'ecology', label: 'Flora and fauna', hint: 'What grows here and what lives here.' },
];

/**
 * What the URL calls the universe.
 *
 * A place id would be a lie -- there is no location row for a universe -- and
 * a missing parameter already means "open the default", so the universe needs
 * a name of its own in the address.
 */
const UNIVERSE = 'universe';

const inWords = (raw: string) => (raw
  ? raw.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
  : '');


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
/**
 * Candidates, where the thing itself will end up.
 *
 * They used to be gathered into one band at the foot of the page, so once a
 * place had a record worth reading you scrolled past all of it to find out
 * whether the picture you asked for had arrived. A proposed picture belongs
 * where the picture goes.
 *
 * And a drawing can be sent back. "Keep one or keep none" is the whole of a
 * conversation in which you may only say yes or no, and the thing you usually
 * want to say is "closer, but from outside".
 */
/**
 * Asking with the prompt open.
 *
 * A note appended to a prompt you cannot see is a narrow instrument: it adds
 * an emphasis and cannot remove one, and against several hundred words of
 * assembled record it is outvoted -- which is why three notes produced three
 * versions of the same picture. This shows the prompt that would be sent and
 * lets it be rewritten, including the negative, which is the half that decides
 * what a model must not do.
 *
 * What is sent is what is shown. Nothing is appended to it afterwards.
 */
function PromptEditor({
  universeId, kind, locationId, onAsked, onClose, onSaid,
}: {
  universeId: string;
  kind: 'picture' | 'map';
  locationId: string | null;
  onAsked: () => void;
  onClose: () => void;
  onSaid: (s: string) => void;
}) {
  const built = useAsync(
    (sig) => editorialApi.getDrawingPrompt(universeId, kind, locationId, sig),
    [universeId, kind, locationId],
  );
  const [positive, setPositive] = useState<string | null>(null);
  const [negative, setNegative] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const shownPositive = positive ?? built.data?.positive ?? '';
  const shownNegative = negative ?? built.data?.negative ?? '';

  if (built.status === 'loading') {
    return <p className="editorial-rail__note">Assembling the prompt…</p>;
  }
  if (built.status === 'error') {
    return (
      <p className="editorial-rail__note" role="alert">
        {`Could not read the prompt: ${built.error.message}`}
      </p>
    );
  }

  return (
    <form
      className="editorial-prompt"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await editorialApi.askWithPrompt(universeId, kind, locationId, {
            positive: shownPositive,
            negative: shownNegative,
          });
          onSaid('Asked, with the prompt as written.');
          onAsked();
          onClose();
        } catch (err) {
          onSaid(`Not asked: ${err instanceof Error ? err.message : String(err)}`);
        } finally { setBusy(false); }
      }}
    >
      <label className="editorial-prompt__label" htmlFor="prompt-positive">
        {`What to draw. This is sent as written, so anything you take out is gone.`}
      </label>
      <textarea
        id="prompt-positive"
        className="editorial-field__input editorial-prompt__box"
        rows={10}
        value={shownPositive}
        onChange={(e) => setPositive(e.target.value)}
      />

      <label className="editorial-prompt__label" htmlFor="prompt-negative">
        What to avoid. The half that decides what the model must not do.
      </label>
      <textarea
        id="prompt-negative"
        className="editorial-field__input editorial-prompt__box"
        rows={4}
        value={shownNegative}
        onChange={(e) => setNegative(e.target.value)}
      />

      <div className="editorial-field__actions">
        <button type="submit" className="editorial-button editorial-button--secondary" disabled={busy}>
          {busy ? 'Asking…' : 'Draw this'}
        </button>
        <button
          type="button"
          className="editorial-link"
          onClick={() => { setPositive(null); setNegative(null); }}
        >
          Put it back as it was
        </button>
        <button type="button" className="editorial-link" onClick={onClose}>Cancel</button>
      </div>
    </form>
  );
}

/**
 * A picture the author already has.
 *
 * Everything else here arrives by asking a model, which is no use when you
 * have the image. Dropped or chosen, it goes to the same storage every kept
 * picture goes to.
 */
function DropPicture({
  onFile, label,
}: {
  onFile: (file: File) => Promise<void>;
  label: string;
}) {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const take = async (files: FileList | null) => {
    const file = [...(files ?? [])].find((f) => f.type.startsWith('image/'));
    if (!file) return;
    setBusy(true);
    try { await onFile(file); } finally { setBusy(false); setOver(false); }
  };

  return (
    <div
      className={`editorial-drop${over ? ' editorial-drop--over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); void take(e.dataTransfer.files); }}
    >
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="editorial-drop__input"
        onChange={(e) => { void take(e.target.files); e.target.value = ''; }}
      />
      <button
        type="button"
        className="editorial-link"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        {busy ? 'Uploading…' : label}
      </button>
      <span className="editorial-drop__hint">or drop one here</span>
    </div>
  );
}

function Drawn({
  row, kind, onKeep, onChanged, onSaid,
}: {
  row: CanonRequest;
  kind: 'picture' | 'map';
  onKeep: (url: string) => Promise<void>;
  onChanged: () => void;
  onSaid: (s: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const images = (row.payload as { proposed?: { images?: string[] } }).proposed?.images ?? [];

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  return (
    <section className="editorial-drawn">
      <div className="editorial-drawn__sheet">
        {images.map((url) => (
          <figure className="editorial-drawn__item" key={url}>
            <img src={url} alt={`A candidate ${kind}`} />
            <figcaption>
              <button
                type="button"
                className="editorial-button editorial-button--secondary"
                disabled={busy}
                onClick={() => run(() => onKeep(url))}
              >
                {busy ? 'Keeping…' : 'Keep this one'}
              </button>
            </figcaption>
          </figure>
        ))}
      </div>

      {note === null ? (
        <p className="editorial-drawn__actions">
          <button type="button" className="editorial-link" disabled={busy} onClick={() => setNote('')}>
            Ask again, with a note
          </button>
          <button
            type="button"
            className="editorial-link editorial-link--discard"
            disabled={busy}
            onClick={() => run(async () => {
              try {
                await editorialApi.resolveCanonRequest(row.id, 'rejected');
                onChanged();
              } catch (e) {
                onSaid(`Not refused: ${e instanceof Error ? e.message : String(e)}`);
              }
            })}
          >
            Keep none of these
          </button>
        </p>
      ) : (
        <form
          className="editorial-drawn__revise"
          onSubmit={(e) => {
            e.preventDefault();
            if (!note.trim()) return;
            void run(async () => {
              try {
                await editorialApi.reviseDrawing(row, note.trim());
                onSaid('Asked again. The next attempt is told what was wrong with this one.');
                setNote(null);
                onChanged();
              } catch (err) {
                onSaid(`Not asked: ${err instanceof Error ? err.message : String(err)}`);
              }
            });
          }}
        >
          <label className="editorial-drawn__label" htmlFor={`note-${row.id}`}>
            {`What should be different? The next attempt sees this and what it drew.`}
          </label>
          <textarea
            id={`note-${row.id}`}
            className="editorial-field__input"
            rows={2}
            autoFocus
            value={note}
            placeholder={kind === 'map'
              ? 'Fewer chambers, and show the docking spars'
              : 'Seen from outside, not from a corridor'}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setNote(null); }}
          />
          <div className="editorial-field__actions">
            <button
              type="submit"
              className="editorial-button editorial-button--secondary"
              disabled={busy || !note.trim()}
            >
              {busy ? 'Asking…' : 'Draw it again'}
            </button>
            <button type="button" className="editorial-link" onClick={() => setNote(null)}>Cancel</button>
          </div>
        </form>
      )}
    </section>
  );
}

/**
 * A title worth showing, or nothing.
 *
 * Uploads used to be titled with the file's own name, which for anything that
 * has been through storage is a uuid and an extension. That is not a title, it
 * is the machine's receipt, and it belongs on the reading surface no more than
 * the asset ids that turned up inside canon prose.
 */
const titleOf = (title: string, fallback: string) => {
  const said = (title ?? '').trim();
  if (!said || /^[\w-]+\.(png|jpe?g|webp|gif)$/i.test(said)) return fallback;
  return said;
};

function Hero({
  place, pictures, asking, waiting, candidates, promptOpen,
  onAsk, onDrop, onKeep, onChanged, onSaid, onUpload, onOpenPrompt,
}: {
  place: { name: string; regionType: string; isUniverse?: boolean };
  pictures: Array<{ id: string; url: string; kind: string; title: string; caption: string }>;
  asking: boolean;
  /** Something has been asked for and has not arrived. */
  waiting: boolean;
  candidates: CanonRequest[];
  /** The prompt editor, when it is open for this subject. */
  promptOpen: React.ReactNode;
  onAsk: () => void;
  onDrop: (assetId: string) => void;
  onKeep: (row: CanonRequest, url: string) => Promise<void>;
  onChanged: () => void;
  onSaid: (s: string) => void;
  onUpload: (file: File) => Promise<void>;
  onOpenPrompt: () => void;
}) {
  const [at, setAt] = useState(0);
  const [dropping, setDropping] = useState(false);
  const showing = pictures[Math.min(at, pictures.length - 1)];

  const review = candidates.length > 0 && (
    <div className="editorial-hero__candidates">
      <h3 className="editorial-rail__title">
        {`Drawn for ${place.name}. Nothing changes until you keep one.`}
      </h3>
      {candidates.map((row) => (
        <Drawn
          key={row.id}
          row={row}
          kind="picture"
          onKeep={(url) => onKeep(row, url)}
          onChanged={onChanged}
          onSaid={onSaid}
        />
      ))}
    </div>
  );

  if (!showing) {
    return (
      <section className="editorial-band editorial-hero editorial-hero--absent">
        {review}
        <p className="editorial-hero__nothing">
          {`No picture of ${place.name} yet. `}
          {place.isUniverse
            // A universe is not somewhere you can stand, so it is not drawn
            // from inside, and calling it "this place" was simply wrong.
            ? 'A picture of the universe is the work’s own illustration style '
              + 'applied to the setting as a whole, and nothing it shows becomes canon.'
            : 'A picture is the work’s own illustration style applied to this place, '
              + 'seen from inside it, and nothing it shows becomes canon.'}
        </p>
        <div className="editorial-hero__ways">
          <button type="button" className="editorial-button" disabled={asking} onClick={onAsk}>
            {asking ? 'Drawing…' : 'Ask for a picture'}
          </button>
          <button type="button" className="editorial-link" onClick={onOpenPrompt}>
            Ask, editing the prompt
          </button>
          <DropPicture onFile={onUpload} label="Upload one" />
        </div>
        {promptOpen}
        {waiting && (
          <p className="editorial-rail__note" role="status">
            Being drawn. It appears here when it arrives.
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="editorial-band editorial-hero">
      <figure className="editorial-hero__frame">
        <img
          className="editorial-hero__image"
          src={showing.url}
          alt={titleOf(showing.title, place.name)}
        />
        <figcaption className="editorial-hero__caption">
          <span className="editorial-hero__title">{titleOf(showing.title, place.name)}</span>
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
              <button type="button" className="editorial-link" onClick={onOpenPrompt}>
                Edit the prompt
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

      {promptOpen}

      <DropPicture onFile={onUpload} label="Upload another" />

      {review}

      {waiting && (
        <p className="editorial-rail__note" role="status">
          Another is being drawn. It appears here when it arrives.
        </p>
      )}

      {pictures.length > 1 && (
        <div className="editorial-hero__others">
          {pictures.map((pic, i) => (
            <button
              type="button"
              key={pic.id}
              className="editorial-button editorial-hero__other"
              aria-pressed={i === at}
              aria-label={titleOf(pic.title, `Picture ${i + 1} of ${place.name}`)}
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
  maps, inside, subject, asking, waiting, candidates, promptOpen,
  onOpen, onAsk, onKeep, onChanged, onSaid, onUpload, onOpenPrompt,
}: {
  maps: PlaceMap[];
  /** What these are maps of, for the sentence shown when there are none. */
  subject: string;
  inside: number;
  asking: boolean;
  waiting: boolean;
  candidates: CanonRequest[];
  promptOpen: React.ReactNode;
  onOpen: (mapId: string) => void;
  onAsk: () => void;
  onUpload: (file: File) => Promise<void>;
  onOpenPrompt: () => void;
  onKeep: (row: CanonRequest, url: string) => Promise<void>;
  onChanged: () => void;
  onSaid: (s: string) => void;
}) {
  return (
    <section className="editorial-band">
      <div className="editorial-section-header">
        <h2 className="editorial-section-title">Maps</h2>
        <div className="editorial-section-header__actions">
          <button type="button" className="editorial-link" disabled={asking} onClick={onAsk}>
            {asking ? 'Drawing…' : 'Ask for a map'}
          </button>
          <button type="button" className="editorial-link" onClick={onOpenPrompt}>
            Edit the prompt
          </button>
        </div>
      </div>

      {promptOpen}
      <DropPicture onFile={onUpload} label="Upload a map" />

      {candidates.map((row) => (
        <Drawn
          key={row.id}
          row={row}
          kind="map"
          onKeep={(url) => onKeep(row, url)}
          onChanged={onChanged}
          onSaid={onSaid}
        />
      ))}

      {waiting && (
        <p className="editorial-rail__note" role="status">
          Being drawn. It appears here when it arrives.
        </p>
      )}

      {maps.length === 0 ? (
        <p className="editorial-rail__note">
          {`No plan of ${subject} yet. A map is a backdrop for pins, never a fact: nothing `
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
/**
 * The keys every map and drawing tool already uses.
 *
 * Somebody arriving here has used Figma or Photoshop or a map, and their hands
 * already know this: V picks, H is the hand, Z is the magnifier, holding space
 * pans wherever you are, and command with plus, minus or zero works the zoom.
 * Inventing a second vocabulary for the same three actions would be asking
 * them to learn what they already know.
 *
 * Held space is a spring, not a toggle: it pans while it is down and gives the
 * tool back on release, because the reason to pan mid-task is almost always to
 * see a bit more of what you were already doing.
 */
function useMapKeys({
  tool, onTool, onZoom, onReset,
}: {
  tool: 'pin' | 'pan' | 'zoom';
  onTool: (next: 'pin' | 'pan' | 'zoom') => void;
  onZoom: (direction: 1 | -1) => void;
  onReset: () => void;
}) {
  // Read in the handler rather than closed over, so the listener does not have
  // to be torn down and rebuilt every time the tool changes.
  const before = useRef(tool);
  const springing = useRef(false);
  useEffect(() => { if (!springing.current) before.current = tool; }, [tool]);

  useEffect(() => {
    /** Typing is typing. A tool shortcut must not fire inside a field. */
    const editing = (target: EventTarget | null) => {
      // Not every target is an element -- an event dispatched at the window
      // has no `closest` at all, and calling it there throws out of the
      // handler and takes every shortcut with it.
      const el = target as Element | null;
      if (typeof el?.closest !== 'function') return false;
      return !!el.closest('input, textarea, select, [contenteditable="true"]');
    };

    const down = (event: KeyboardEvent) => {
      if (editing(event.target)) return;

      if ((event.metaKey || event.ctrlKey) && ['+', '=', '-', '_', '0'].includes(event.key)) {
        event.preventDefault();
        if (event.key === '0') onReset();
        else onZoom(event.key === '-' || event.key === '_' ? -1 : 1);
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.code === 'Space' && !event.repeat) {
        // Or the page scrolls under the drawing while you are panning it.
        event.preventDefault();
        springing.current = true;
        onTool('pan');
        return;
      }
      const picked = { v: 'pin', h: 'pan', z: 'zoom' }[event.key.toLowerCase()];
      if (picked) onTool(picked as 'pin' | 'pan' | 'zoom');
    };

    const up = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || !springing.current) return;
      springing.current = false;
      onTool(before.current);
    };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [onTool, onZoom, onReset]);
}

function MapEditor({
  place, map, only, unplaced, inside, placing, ground, activePin, zoom, onZoom, tool, onTool,
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
  zoom: number;
  onZoom: (next: number) => void;
  tool: 'pin' | 'pan' | 'zoom';
  onTool: (next: 'pin' | 'pan' | 'zoom') => void;
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
  const STEPS = [1, 1.5, 2, 3, 4];
  const at = STEPS.indexOf(zoom) === -1 ? 0 : STEPS.indexOf(zoom);
  const step = (direction: 1 | -1) => onZoom(
    STEPS[Math.min(STEPS.length - 1, Math.max(0, at + direction))],
  );

  /**
   * What a drag means, chosen rather than guessed.
   *
   * Pressing and moving is the obvious gesture for putting a pin somewhere and
   * equally the obvious gesture for sliding the drawing under it. With one
   * mode the app has to decide from what happened to be under the pointer,
   * which is how a pan turns into a misplaced pin on a crowded map.
   */
  const TOOLS: Array<{ key: 'pin' | 'pan' | 'zoom'; label: string; key_: string; says: string }> = [
    {
      key: 'pin',
      label: 'Pin',
      key_: 'V',
      says: 'Click open ground to add a place; drag a pin to move it.',
    },
    {
      key: 'pan',
      label: 'Pan',
      key_: 'H',
      says: 'Drag to move the drawing under the frame. Holding space does this from any tool.',
    },
    {
      key: 'zoom',
      label: 'Zoom',
      key_: 'Z',
      says: 'Click to zoom in on that point, shift-click to zoom out. Pinch, or hold command '
        + 'and scroll, does it from any tool.',
    },
  ];

  useMapKeys({ tool, onTool, onZoom: step, onReset: () => onZoom(1) });

  return (
    <section className="editorial-mapeditor">
      <div className="editorial-section-header">
        <h2 className="editorial-section-title" id="editing-map">
          {map.purpose || `A map of ${place.name}`}
        </h2>
        <div className="editorial-section-header__actions">
          <span className="editorial-mapband__count">
            {`${map.pins.length} of ${inside} placed`}
          </span>
          {/* Steps rather than a continuous control: the useful zooms are a
              handful, and a slider on a drawing you are also dragging pins
              across is one more thing to catch by accident. */}
          <span className="editorial-tools" role="group" aria-label="What dragging does">
            {TOOLS.map((t) => (
              <button
                key={t.key}
                type="button"
                className="editorial-button editorial-button--toggle"
                aria-pressed={tool === t.key}
                title={`${t.label} (${t.key_})`}
                onClick={() => onTool(t.key)}
              >
                {t.label}
              </button>
            ))}
          </span>
          <span className="editorial-zoom" role="group" aria-label="Zoom">
            <button
              type="button"
              className="editorial-button editorial-button--ghost"
              disabled={at === 0}
              aria-label="Zoom out"
              onClick={() => step(-1)}
            >
              −
            </button>
            <span className="editorial-zoom__at">{`${Math.round(zoom * 100)}%`}</span>
            <button
              type="button"
              className="editorial-button editorial-button--ghost"
              disabled={at === STEPS.length - 1}
              aria-label="Zoom in"
              onClick={() => step(1)}
            >
              +
            </button>
          </span>
          <button type="button" className="editorial-button" onClick={onBack}>
            Done
          </button>
        </div>
      </div>

      <MapDetails map={map} only={only} onChanged={onChanged} onSaid={onSaid} />

      {/* What the chosen tool does, said plainly. A toolbar whose modes are
          three words each is a toolbar you have to try to understand. */}
      <p className="editorial-tools__says">{TOOLS.find((t) => t.key === tool)?.says}</p>

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
            zoom={zoom}
            tool={tool}
            onZoomAt={step}
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
  places, universeName, openId, onOpen,
}: {
  places: PlaceRow[];
  universeName: string;
  openId: string | null;
  /** Null opens the universe itself, which sits above every place. */
  onOpen: (id: string | null) => void;
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
            {/* The universe itself, above everything it contains. It is a
                subject you can draw and pin on -- a map of the whole setting
                with its outermost places on it is the map an author wants
                first, and it was the one thing that could not have one,
                because there is no place named after the universe. */}
            <li className="editorial-tree__node">
              <div className="editorial-tree__row">
                <span className="editorial-tree__gutter" aria-hidden="true" />
                <button
                  type="button"
                  className="editorial-button editorial-placelist__row editorial-tree__name"
                  aria-pressed={openId === null}
                  onClick={() => onOpen(null)}
                >
                  <span className="editorial-placelist__name">{universeName}</span>
                  <span className="editorial-placelist__meta">
                    {`the universe · ${roots.length} outermost`}
                  </span>
                </button>
              </div>
            </li>

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
  /**
   * Which place is open.
   *
   * `?open=` is how every other lens is told to show one record -- the
   * encyclopedia's register and the front door's ledger both link that way --
   * so this answers to it as well as to its own `?place=`. Without that, a
   * link from "What moved" to a place would land on Geography showing
   * whatever it opens by default, which looks like the link went nowhere.
   */
  const openPlaceId = params.get('place') ?? params.get('open');
  /**
   * The universe is open when the URL says so, and that is a different thing
   * from "no place chosen yet". `?place=universe` is the universe; no
   * parameter at all still falls through to the default place.
   */
  const onUniverse = openPlaceId === UNIVERSE;
  /**
   * The open map travels in the URL, like the open place.
   *
   * Editing is a view, and a view you cannot link to or reload back into is a
   * mode you are trapped in until you press Done. It also means back goes
   * back out of the editor rather than off the page.
   */
  const editingMapId = params.get('map');
  const [placing, setPlacing] = useState<{ id: string; name: string } | null>(null);
  const [ground, setGround] = useState<{ x: number; y: number } | null>(null);
  const [activePin, setActivePin] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [asking, setAsking] = useState<'map' | 'picture' | null>(null);
  const [editingPrompt, setEditingPrompt] = useState<'map' | 'picture' | null>(null);
  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState<'pin' | 'pan' | 'zoom'>('pin');

  const universe = useAsync((s) => editorialApi.getUniverse(universeId, s), [universeId]);
  const index = useAsync((s) => editorialApi.listPlaces(universeId, s), [universeId]);
  const placeId = onUniverse ? null : (openPlaceId ?? index.data?.opens ?? null);

  const openMap = useCallback((id: string | null) => {
    const merged = new URLSearchParams(params);
    if (id) merged.set('map', id); else merged.delete('map');
    setParams(merged);
  }, [params, setParams]);

  const choose = useCallback((id: string | null) => {
    const merged = new URLSearchParams(params);
    // Null is the universe, not "clear the selection": every row in the tree
    // opens something, and the root opens the thing that contains the rest.
    merged.set('place', id ?? UNIVERSE);
    // Choosing a different place leaves whatever map was open; it belongs to
    // the place you were looking at, not to this one.
    merged.delete('map');
    setParams(merged);
  }, [params, setParams]);

  /** Narrow screens hide the index once a place is open; this is the way back. */
  const backToPlaces = useCallback(() => {
    const merged = new URLSearchParams(params);
    merged.delete('place');
    merged.delete('open');
    merged.delete('map');
    setParams(merged);
  }, [params, setParams]);

  const place = useAsync<PlaceGeography | null>(
    (s) => {
      if (onUniverse) return editorialApi.getUniversePlace(universeId, s);
      return placeId ? editorialApi.getPlace(placeId, s) : Promise.resolve(null);
    },
    [placeId, onUniverse, universeId],
  );

  const requests = useAsync(
    async (s) => ({
      maps: await editorialApi.listMapRequests(universeId, s),
      places: await editorialApi.listPlaceRequests(universeId, s),
      pictures: await editorialApi.listPlacePictureRequests(universeId, s),
      canon: await editorialApi.listPlaceCanonRequests(universeId, s),
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
      ...(requests.data?.canon ?? []),
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
  /** Whether a request is about whatever is open: a place, or the universe. */
  const mine = useCallback((row: CanonRequest) => {
    const p = row.payload as { locationId?: string; universe?: boolean };
    return onUniverse ? p.universe === true : p.locationId === placeId;
  }, [onUniverse, placeId]);

  const pending = useCallback((kind: 'map' | 'picture') => {
    const rows = kind === 'map' ? requests.data?.maps : requests.data?.pictures;
    return (rows ?? []).some((r) => !r.payload?.proposed && mine(r));
  }, [requests.data, mine]);

  /**
   * Fields of this place that an agent is already writing.
   *
   * A control that files a second request for a field somebody is mid-way
   * through answering is how a queue ends up with two proposals for the same
   * sentence and no way to say which came first.
   */
  const drafting = useMemo(() => {
    const claimed = new Set<string>();
    for (const row of requests.data?.canon ?? []) {
      const p = row.payload as { locationId?: string; fields?: string[] };
      if (row.payload?.proposed || p.locationId !== placeId) continue;
      for (const f of p.fields ?? []) claimed.add(f);
    }
    return claimed;
  }, [requests.data, placeId]);

  /**
   * One request per field, even when the whole record is asked for.
   *
   * Asking for five fields in one answer produced one field. Each of these is
   * two or three paragraphs of prose -- the folklore alone came back at two
   * thousand characters -- and a single reply carrying all five is a lot to
   * ask of one turn; what came back was a good description and silence about
   * the rest, which reads as a broken button rather than as a model running
   * out of room.
   *
   * Separate requests also arrive separately, so the first is readable while
   * the last is still being written.
   */
  /** Answered drawings for the open place, of one kind. */
  const drawnFor = useCallback((kind: 'map' | 'picture') => {
    const rows = kind === 'map' ? requests.data?.maps : requests.data?.pictures;
    return (rows ?? []).filter((r) => r.payload?.proposed && mine(r));
  }, [requests.data, mine]);

  /**
   * Keep one drawing. The bytes are copied onto storage the way an accepted
   * portrait is: a candidate's URL points into the render machine's output
   * folder, which gets cleared, so keeping the URL alone keeps nothing.
   */
  const keepPicture = async (row: CanonRequest, url: string) => {
    if (!place.data) return;
    try {
      const kept = onUniverse
        ? await editorialApi.keepUniversePicture(universeId, url, '')
        : await editorialApi.keepPlacePicture(universeId, place.data.place.id, url, '');
      await editorialApi.resolveCanonRequest(row.id, 'accepted');
      setSaid(kept.stored
        ? 'Kept, and the picture was copied onto storage.'
        : `Kept, but not copied: ${kept.storage}`);
      reload();
    } catch (e) {
      setSaid(`Not kept: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const keepMapCandidate = async (row: CanonRequest, url: string) => {
    if (!place.data) return;
    try {
      const kept = onUniverse
        ? await editorialApi.keepUniverseMap(universeId, { url })
        : await editorialApi.keepMap(place.data.place.id, { url });
      await editorialApi.resolveCanonRequest(row.id, 'accepted');
      openMap(kept.map.id);
      setSaid(kept.stored
        ? 'Kept, and the map was copied onto storage.'
        : `Kept, but not copied: ${kept.storage}`);
      reload();
    } catch (e) {
      setSaid(`Not kept: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const askForCanon = async (fields: string[]) => {
    if (!place.data) return;
    setSaid(null);
    try {
      for (const field of fields) {
          if (onUniverse) await editorialApi.askForUniverseCanon(universeId, [field]);
        else await editorialApi.askForPlaceCanon(universeId, place.data.place.id, [field]);
      }
      setSaid(fields.length === 1
        ? 'Asked. The proposal arrives below when it is written.'
        : `Asked for ${fields.length} fields, one at a time. They arrive below as they are written.`);
      requests.retry();
    } catch (e) {
      setSaid(`Not asked: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

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
      if (onUniverse) await editorialApi.askForUniverseDrawing(universeId, what);
      else if (what === 'map') await editorialApi.askForMap(universeId, place.data.place.id);
      else await editorialApi.askForPlacePicture(universeId, place.data.place.id);
      setSaid(what === 'map'
        ? `Drawing a plan of ${place.data.place.name}. Candidates appear below.`
        : `Drawing ${place.data.place.name}. Candidates appear below.`);
      requests.retry();
    } catch (e) {
      setSaid(`Not asked: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setAsking(null); }
  };

  /** The subject a drawing or an upload belongs to: a place, or the universe. */
  const subjectId = onUniverse ? null : (place.data?.place.id ?? null);

  const promptFor = (kind: 'map' | 'picture') => (editingPrompt === kind ? (
    <PromptEditor
      universeId={universeId}
      kind={kind}
      locationId={subjectId}
      onAsked={requests.retry}
      onClose={() => setEditingPrompt(null)}
      onSaid={setSaid}
    />
  ) : null);

  const upload = async (file: File, kind: 'reference' | 'map') => {
    try {
      const kept = await editorialApi.uploadPicture(
        universeId,
        file,
        onUniverse
          ? { type: 'universe', id: universeId }
          : { type: 'location', id: place.data!.place.id },
        kind,
      );
      // A map has to be a map record, not only a catalogued picture, or it
      // cannot be opened and pinned on.
      if (kind === 'map') {
        const made = onUniverse
          ? await editorialApi.keepUniverseMap(universeId, { url: kept.url })
          : await editorialApi.keepMap(place.data!.place.id, { url: kept.url });
        openMap(made.map.id);
        await editorialApi.removePicture(kept.id);
      }
      setSaid(`${file.name} is on the storage volume and in the record.`);
      reload();
    } catch (e) {
      setSaid(`Not uploaded: ${e instanceof Error ? e.message : String(e)}`);
    }
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

        {/* Editing a map is its own view. Pinning is close work -- looking for
            a spot the size of a fingernail on a drawing -- and doing it in a
            column with the index beside it gives the drawing half a screen
            while a list nobody is reading takes the rest. The index is one
            click away and the map gets everything. */}
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
            zoom={zoom}
            onZoom={setZoom}
            tool={tool}
            onTool={setTool}
            onBack={() => {
              openMap(null);
              setPlacing(null);
              setGround(null);
              setZoom(1);
              setTool('pin');
            }}
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
        ) : (
        <div className="editorial-panes">
          <PlaceIndex
            places={index.data.places}
            universeName={universe.data?.title ?? 'This universe'}
            openId={onUniverse ? null : placeId}
            onOpen={(id) => {
              choose(id);
              setPlacing(null);
              setGround(null);
            }}
          />

          <div className="editorial-pane editorial-pane--record">
            <BackToList label="The places" onBack={backToPlaces} />
            {place.data && (
              <>
                <div className="editorial-section-header editorial-place-head">
                  <h2 className="editorial-section-title">{place.data.place.name}</h2>
                  <div className="editorial-section-header__actions">
                    {/* A universe is not a place and has no history, folklore,
                        biome or ecology of its own. What it is for is written
                        on Direction, and duplicating an editor for it here
                        would be a second place to change the same words. */}
                    {/* The whole record at once. The link beside a section asks
                        about one field; this asks what the place is from
                        nothing, which is the useful thing on a place where
                        none of it is written. */}
                    <button
                      type="button"
                      className="editorial-button editorial-button--secondary"
                      disabled={drafting.size > 0}
                      onClick={() => askForCanon(PLACE_FIELDS.map((f) => f.key))}
                    >
                      {drafting.size > 0 ? 'Drafting…' : 'Collaborate'}
                    </button>
                    <button
                      type="button"
                      className="editorial-link"
                      disabled={asking !== null || pending('picture')}
                      onClick={() => ask('picture')}
                    >
                      {asking === 'picture' || pending('picture') ? 'Drawing…' : 'Ask for a picture'}
                    </button>
                  </div>
                </div>

                <Hero
                  place={place.data.place}
                  pictures={place.data.pictures}
                  asking={asking === 'picture' || pending('picture')}
                  waiting={pending('picture')}
                  candidates={drawnFor('picture')}
                  promptOpen={promptFor('picture')}
                  onUpload={(f) => upload(f, 'reference')}
                  onOpenPrompt={() => setEditingPrompt(
                    editingPrompt === 'picture' ? null : 'picture',
                  )}
                  onAsk={() => ask('picture')}
                  onDrop={dropPicture}
                  onKeep={keepPicture}
                  onChanged={reload}
                  onSaid={setSaid}
                />

                {place.data.place.isUniverse && (
                  <p className="editorial-rail__note">
                    {`${place.data.inside.length} places sit directly in this universe. `}
                    {'Its premise and direction are written on Direction; what is below is '
                      + 'the universe as a place, for a setting that is one.'}
                  </p>
                )}

                <section className="editorial-band">
                  <div className="editorial-section-header">
                    <h2 className="editorial-section-title">The record</h2>
                  </div>
                  <div className="editorial-placefields">
                    {PLACE_FIELDS.map((spec) => (
                      <CanonField
              name="place"
                        key={spec.key}
                        label={spec.label}
                        hint={spec.hint}
                        value={String(
                          (place.data!.place as unknown as Record<string, unknown>)[spec.key] ?? '',
                        )}
                        drafting={drafting.has(spec.key)}
                        onCollaborate={() => askForCanon([spec.key])}
                        onSave={async (v) => {
                          // A universe is written through its own record, not
                          // through a locations row it does not have.
                          if (place.data!.place.isUniverse) {
                            await editorialApi.updateUniverseRecord(universeId, { [spec.key]: v });
                          } else {
                            await editorialApi.updatePlace(place.data!.place.id, { [spec.key]: v });
                          }
                          place.retry();
                        }}
                      />
                    ))}
                  </div>
                </section>

                <MapShelf
                  maps={maps}
                  inside={place.data.inside.length}
                  subject={place.data.place.isUniverse ? 'this universe' : 'this place'}
                  asking={asking === 'map' || pending('map')}
                  waiting={pending('map')}
                  candidates={drawnFor('map')}
                  promptOpen={promptFor('map')}
                  onUpload={(f) => upload(f, 'map')}
                  onOpenPrompt={() => setEditingPrompt(editingPrompt === 'map' ? null : 'map')}
                  onOpen={(mapId) => { openMap(mapId); setSaid(null); }}
                  onAsk={() => ask('map')}
                  onKeep={keepMapCandidate}
                  onChanged={reload}
                  onSaid={setSaid}
                />
              </>
            )}

            <Candidates
              universeId={universeId}
              placeId={place.data?.place.isUniverse ? null : (place.data?.place.id ?? null)}
              onUniverse={onUniverse}
              requests={requests.data ?? undefined}
              onChanged={reload}
              onSaid={setSaid}
              onKept={openMap}
            />
          </div>
        </div>
        )}
      </div>
    </Surface>
  );
}

function Candidates({
  universeId, placeId, onUniverse, requests, onChanged, onSaid, onKept,
}: {
  universeId: string;
  placeId: string | null;
  onUniverse: boolean;
  requests?: {
    maps: CanonRequest[]; places: CanonRequest[];
    pictures: CanonRequest[]; canon: CanonRequest[];
  };
  onChanged: () => void;
  onSaid: (s: string) => void;
  onKept: (mapId: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  // Drawings for the open place are reviewed in the hero and on the shelf,
  // where the thing itself lands. What is left here is drawings for a place
  // you are not currently looking at, which would otherwise be invisible.
  const elsewhere = (r: CanonRequest) => {
    const p = r.payload as { locationId?: string; universe?: boolean };
    return onUniverse ? p.universe !== true : p.locationId !== placeId;
  };
  const mapRows = (requests?.maps ?? []).filter((r) => r.payload?.proposed).filter(elsewhere);
  const placeRows = (requests?.places ?? []).filter((r) => r.payload?.proposed);
  // Loaded and counted as outstanding from the beginning, and never rendered:
  // two pictures were asked for, both were drawn, and the answers had nowhere
  // on the page to appear.
  const pictureRows = (requests?.pictures ?? []).filter((r) => r.payload?.proposed).filter(elsewhere);
  // `locationId === placeId` cannot match a universe: its placeId is null and
  // its requests carry no location at all, so a proposal for the universe
  // would have been written and never shown.
  const canonRows = (requests?.canon ?? [])
    .filter((r) => r.payload?.proposed)
    .filter((r) => {
      const p = r.payload as { locationId?: string; universe?: boolean };
      return onUniverse ? p.universe === true : p.locationId === placeId;
    });
  const waiting = [
    ...(requests?.maps ?? []), ...(requests?.places ?? []),
    ...(requests?.pictures ?? []), ...(requests?.canon ?? []),
  ].filter((r) => !r.payload?.proposed).length;

  if (!mapRows.length && !placeRows.length && !pictureRows.length
    && !canonRows.length && !waiting) return null;

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

  /**
   * Put a proposal into the record.
   *
   * Written field by field through the ordinary update path rather than by a
   * special accept route, so a proposal cannot reach a column the person
   * editing by hand could not reach.
   */
  const keepCanon = async (row: CanonRequest) => {
    const p = row.payload as { locationId?: string; proposed?: Record<string, string> };
    const forUniverse = (row.payload as { universe?: boolean }).universe === true;
    if ((!p.locationId && !forUniverse) || !p.proposed) return;
    setBusy(row.id);
    try {
      if (forUniverse) await editorialApi.updateUniverseRecord(universeId, p.proposed);
      else await editorialApi.updatePlace(p.locationId!, p.proposed);
      await editorialApi.resolveCanonRequest(row.id, 'accepted');
      onSaid(`Put in force: ${Object.keys(p.proposed).length === 1
        ? PLACE_FIELDS.find((f) => f.key === Object.keys(p.proposed!)[0])?.label ?? 'one field'
        : `${Object.keys(p.proposed).length} fields`}.`);
      onChanged();
    } catch (e) {
      onSaid(`Not saved: ${e instanceof Error ? e.message : String(e)}`);
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

      {canonRows.map((row) => {
        const proposed = (row.payload as { proposed?: Record<string, string> }).proposed ?? {};
        return (
          <article
            className="editorial-placeproposal"
            key={row.id}
            aria-label={`Proposed ${Object.keys(proposed)
              .map((k) => PLACE_FIELDS.find((f) => f.key === k)?.label ?? k)
              .join(', ')}`}
          >
            {/* No heading of its own. Every entry below is labelled, and with
                one field the heading and the label were the same words twice,
                one under the other, in two different cases. */}
            <dl className="editorial-placeproposal__fields">
              {Object.entries(proposed).map(([key, value]) => (
                <div key={key}>
                  <dt>{PLACE_FIELDS.find((f) => f.key === key)?.label ?? key}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <div className="editorial-field__actions">
              <button
                type="button"
                className="editorial-button editorial-button--secondary"
                disabled={busy === row.id}
                onClick={() => keepCanon(row)}
              >
                {busy === row.id ? 'Saving…' : 'Put it in force'}
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

      {placeRows.map((row) => {
        const p = row.payload as {
          proposed?: { name: string; description: string; history: string; why: string };
        };
        return (
          <article className="editorial-placeproposal" key={row.id}>
            <h3 className="editorial-placeproposal__name">{p.proposed?.name}</h3>
            {p.proposed?.why && <p className="editorial-placeproposal__why">{p.proposed.why}</p>}
            <p className="editorial-placeproposal__prose">{p.proposed?.description}</p>
            {p.proposed?.history && <p className="editorial-placeproposal__prose">{p.proposed.history}</p>}
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
