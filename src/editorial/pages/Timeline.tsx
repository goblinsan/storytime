import { useCallback, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  editorialApi, type CanonRequest, type EventInDepth,
} from '../api';
import { useAsync, useRefreshWhile } from '../useAsync';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import Surface from '../components/Surface';
import SurfaceMasthead from '../components/SurfaceMasthead';

/**
 * When things happened, and what each of them was.
 *
 * A chronicle is a list until you want to look at one entry, and then a list
 * is the least useful shape there is: a battle that takes three chapters to
 * tell gets the same single line as a treaty signed in an afternoon.
 *
 * So this is the same two-pane shape geography uses -- the index beside the
 * thing -- because it is the other axis of one question. An event has a record
 * of its own, pictures of its own, and can be broken into the sequence it
 * actually was.
 *
 * WHAT A DATE IS HERE
 * `date` is what the author wrote and the only form ever shown: "Year of the
 * Iron Dirge 304, The Hour of the Falling Star" is a date, and rendering it as
 * 304 would throw away the half that carries the voice. `year` is a number
 * parsed out of it so a range can be asked for, and it is nullable because
 * "before the Collapse" is a real date that no number fits.
 */

/** What an event record holds, in reading order. Declared once. */
const EVENT_FIELDS: Array<{ key: string; label: string; hint: string }> = [
  { key: 'description', label: 'What happened', hint: 'The entry as a chronicle would carry it.' },
  { key: 'account', label: 'The account', hint: 'The fuller telling: how it began, turned and ended.' },
  {
    key: 'consequences',
    label: 'What it changed',
    hint: 'Why this is on a timeline at all. If nothing changed, say so.',
  },
  {
    key: 'remembrance',
    label: 'How it is remembered',
    hint: 'Who tells it, what they leave out, and what that protects.',
  },
];

/** One prose field of an event, read until somebody edits it. */
function Field({
  label, hint, value, onSave, onCollaborate, drafting,
}: {
  label: string;
  hint: string;
  value: string;
  onSave: (next: string) => Promise<void>;
  onCollaborate: () => void;
  drafting: boolean;
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
          <span className="editorial-placefield__actions">
            <button
              type="button"
              className="editorial-link"
              onClick={() => { setDraft(value); setEditing(true); }}
            >
              {value.trim() ? 'Edit' : 'Write'}
            </button>
            {drafting ? (
              <span className="editorial-field__drafting">Drafting…</span>
            ) : (
              <button type="button" className="editorial-link" onClick={onCollaborate}>
                Collaborate
              </button>
            )}
          </span>
        )}
      </div>

      {editing ? (
        <div className="editorial-placefield__editor">
          <label className="editorial-placefield__hint" htmlFor={`event-${label}`}>{hint}</label>
          <textarea
            id={`event-${label}`}
            className="editorial-field__input"
            rows={5}
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
 * Narrowing the timeline to a stretch of years.
 *
 * Two numbers rather than a slider: the useful move is "the war years" or "the
 * century after the Collapse", which somebody knows the numbers for, and
 * dragging two handles to land on 304 exactly is worse than typing it.
 *
 * The bounds shown are the whole universe's range, not the filtered one. A
 * control that narrows a range has to keep saying what the range is, or it
 * redraws itself around its own answer and you cannot get back out.
 */
function Range({
  span, from, to, onChange,
}: {
  span: { first: number | null; last: number | null; undated: number };
  from: string;
  to: string;
  onChange: (next: { from?: string; to?: string }) => void;
}) {
  if (span.first === null || span.last === null) return null;
  const narrowed = from !== '' || to !== '';

  return (
    <div className="editorial-range">
      <span className="editorial-range__label">Years</span>
      <input
        className="editorial-range__field"
        type="number"
        inputMode="numeric"
        value={from}
        placeholder={String(span.first)}
        aria-label={`From year, earliest recorded is ${span.first}`}
        onChange={(e) => onChange({ from: e.target.value })}
      />
      <span className="editorial-range__to">to</span>
      <input
        className="editorial-range__field"
        type="number"
        inputMode="numeric"
        value={to}
        placeholder={String(span.last)}
        aria-label={`To year, latest recorded is ${span.last}`}
        onChange={(e) => onChange({ to: e.target.value })}
      />
      {narrowed && (
        <button
          type="button"
          className="editorial-link"
          onClick={() => onChange({ from: '', to: '' })}
        >
          All years
        </button>
      )}
      {span.undated > 0 && (
        <span className="editorial-range__note">
          {`${span.undated} undated, always shown`}
        </span>
      )}
    </div>
  );
}

export default function Timeline() {
  const { id: universeId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const openId = params.get('open');
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const [said, setSaid] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  const universe = useAsync((s) => editorialApi.getUniverse(universeId, s), [universeId]);
  const index = useAsync(
    (s) => editorialApi.listEvents(universeId, {
      from: from === '' ? undefined : Number(from),
      to: to === '' ? undefined : Number(to),
    }, s),
    [universeId, from, to],
  );

  const eventId = openId ?? index.data?.events[0]?.id ?? null;
  const open = useAsync<EventInDepth | null>(
    (s) => (eventId ? editorialApi.getEvent(eventId, s) : Promise.resolve(null)),
    [eventId],
  );

  const requests = useAsync((s) => editorialApi.listEventRequests(universeId, s), [universeId]);
  const outstanding = useMemo(
    () => (requests.data ?? []).some((r) => !r.payload?.proposed),
    [requests.data],
  );
  useRefreshWhile(outstanding, requests.retry);

  const set = useCallback((next: Record<string, string | undefined>) => {
    const merged = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v === undefined) continue;
      if (v === '') merged.delete(k); else merged.set(k, v);
    }
    setParams(merged);
  }, [params, setParams]);

  const reload = useCallback(() => {
    open.retry();
    index.retry();
    requests.retry();
  }, [open, index, requests]);

  /** Fields of this event an agent is already writing. */
  const drafting = useMemo(() => {
    const claimed = new Set<string>();
    for (const row of requests.data ?? []) {
      const p = row.payload as { eventId?: string; fields?: string[] };
      if (row.payload?.proposed || p.eventId !== eventId) continue;
      for (const f of p.fields ?? []) claimed.add(f);
    }
    return claimed;
  }, [requests.data, eventId]);

  const askForCanon = async (fields: string[]) => {
    if (!eventId) return;
    setSaid(null);
    try {
      // One request per field, for the same reason the place record asks that
      // way: four fields in one answer came back as one field.
      for (const field of fields) {
        await editorialApi.askForEventCanon(universeId, eventId, [field]);
      }
      setSaid(fields.length === 1
        ? 'Asked. The proposal arrives below when it is written.'
        : `Asked for ${fields.length} fields, one at a time.`);
      requests.retry();
    } catch (e) {
      setSaid(`Not asked: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const askForPicture = async () => {
    if (!eventId) return;
    setAsking(true);
    setSaid(null);
    try {
      await editorialApi.askForEventPicture(universeId, eventId);
      setSaid('Drawing. Candidates appear with the pictures.');
      requests.retry();
    } catch (e) {
      setSaid(`Not asked: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setAsking(false); }
  };

  if (index.status === 'loading') {
    return <Surface name="timeline"><LoadingState label="Reading the chronicle…" /></Surface>;
  }
  if (index.status === 'error') {
    return (
      <Surface name="timeline">
        <ErrorState title="Could not load the timeline" error={index.error} onRetry={index.retry} />
      </Surface>
    );
  }

  const { span, events } = index.data;

  return (
    <Surface name="timeline">
      <div className="editorial-family-workspace">
        <SurfaceMasthead
          title={universe.data?.title ?? 'Timeline'}
          standfirst={`${span.total} events${span.first !== null ? `, ${span.first} to ${span.last}` : ''}.`}
          status={said}
        />

        <div className="editorial-panes">
          <div className="editorial-cast-column">
            <div className="editorial-section-header">
              <h2 className="editorial-section-title">The chronicle</h2>
              <span className="editorial-register__count">
                {events.length === span.total ? `${span.total} events` : `${events.length} of ${span.total}`}
              </span>
            </div>

            <Range span={span} from={from} to={to} onChange={set} />

            <nav className="editorial-pane editorial-pane--cast" aria-label="The chronicle">
              {events.length === 0 ? (
                <p className="editorial-rail__note">Nothing happened in those years.</p>
              ) : (
                <ul className="editorial-placelist">
                  {events.map((e) => (
                    <li key={e.id}>
                      <button
                        type="button"
                        className="editorial-button editorial-placelist__row"
                        aria-pressed={e.id === eventId}
                        onClick={() => set({ open: e.id })}
                      >
                        <span className="editorial-placelist__name">{e.title || 'Untitled'}</span>
                        <span className="editorial-placelist__meta">
                          {[
                            e.date,
                            e.insideCount ? `${e.insideCount} inside` : null,
                            e.pictureCount ? `${e.pictureCount} picture${e.pictureCount > 1 ? 's' : ''}` : null,
                          ].filter(Boolean).join(' · ')}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </nav>
          </div>

          <div className="editorial-pane editorial-pane--record">
            {open.data ? (
              <Detail
                universeId={universeId}
                depth={open.data}
                drafting={drafting}
                asking={asking}
                requests={requests.data ?? []}
                onOpen={(id) => set({ open: id })}
                onAskCanon={askForCanon}
                onAskPicture={askForPicture}
                onChanged={reload}
                onSaid={setSaid}
              />
            ) : (
              <EmptyState
                title="Nothing chosen"
                description="Pick an event from the chronicle to read and add to it."
              />
            )}
          </div>
        </div>
      </div>
    </Surface>
  );
}

/**
 * One event, in full.
 *
 * The parts it breaks into sit under the record rather than above it: they are
 * the detail of the thing, and a reader who wanted the detail first would have
 * opened one of them.
 */
function Detail({
  universeId, depth, drafting, asking, requests,
  onOpen, onAskCanon, onAskPicture, onChanged, onSaid,
}: {
  universeId: string;
  depth: EventInDepth;
  drafting: Set<string>;
  asking: boolean;
  requests: CanonRequest[];
  onOpen: (id: string) => void;
  onAskCanon: (fields: string[]) => Promise<void>;
  onAskPicture: () => Promise<void>;
  onChanged: () => void;
  onSaid: (s: string) => void;
}) {
  const { event, inside, partOf, pictures } = depth;
  const [adding, setAdding] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mine = (r: CanonRequest) => (r.payload as { eventId?: string }).eventId === event.id;
  const drawn = requests.filter(
    (r) => mine(r) && r.payload?.proposed && r.artifactType === 'timeline_event_image_request',
  );
  const proposals = requests.filter(
    (r) => mine(r) && r.payload?.proposed && r.artifactType === 'timeline_event_canon_request',
  );

  const save = async (field: string, value: string) => {
    await editorialApi.updateEvent(event.id, { [field]: value });
    onChanged();
  };

  return (
    <>
      <div className="editorial-section-header editorial-place-head">
        <h2 className="editorial-section-title">{event.title || 'Untitled'}</h2>
        <div className="editorial-section-header__actions">
          <button
            type="button"
            className="editorial-button editorial-button--secondary"
            disabled={drafting.size > 0}
            onClick={() => onAskCanon(EVENT_FIELDS.map((f) => f.key))}
          >
            {drafting.size > 0 ? 'Drafting…' : 'Collaborate'}
          </button>
          <button type="button" className="editorial-link" disabled={asking} onClick={onAskPicture}>
            {asking ? 'Drawing…' : 'Ask for a picture'}
          </button>
        </div>
      </div>

      <p className="editorial-rail__note">
        {event.date}
        {event.locationName ? ` · ${event.locationName}` : ''}
        {partOf && (
          <>
            {' · part of '}
            <button type="button" className="editorial-link" onClick={() => onOpen(partOf.id)}>
              {partOf.title}
            </button>
          </>
        )}
      </p>

      {pictures.length > 0 && (
        <ul className="editorial-placepics">
          {pictures.map((pic) => (
            <li key={pic.id} className="editorial-placepics__item">
              <img src={pic.url} alt={pic.title || event.title} />
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
                  <img src={url} alt="A candidate picture of this event" />
                  <figcaption>
                    <button
                      type="button"
                      className="editorial-button editorial-button--secondary"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await editorialApi.keepEventPicture(universeId, event.id, url);
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
        <div className="editorial-section-header">
          <h3 className="editorial-section-title">The record</h3>
        </div>
        <div className="editorial-placefields">
          {EVENT_FIELDS.map((spec) => (
            <Field
              key={spec.key}
              label={spec.label}
              hint={spec.hint}
              value={String((event as unknown as Record<string, unknown>)[spec.key] ?? '')}
              drafting={drafting.has(spec.key)}
              onCollaborate={() => onAskCanon([spec.key])}
              onSave={(v) => save(spec.key, v)}
            />
          ))}
        </div>
      </section>

      {proposals.map((row) => {
        const proposed = (row.payload as { proposed?: Record<string, string> }).proposed ?? {};
        return (
          <article className="editorial-placeproposal" key={row.id}>
            <dl className="editorial-placeproposal__fields">
              {Object.entries(proposed).map(([key, value]) => (
                <div key={key}>
                  <dt>{EVENT_FIELDS.find((f) => f.key === key)?.label ?? key}</dt>
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
                    await editorialApi.updateEvent(event.id, proposed);
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

      <section className="editorial-band">
        <div className="editorial-section-header">
          <h3 className="editorial-section-title">What it breaks into</h3>
          {adding === null && (
            <button type="button" className="editorial-link" onClick={() => setAdding('')}>
              Add a part
            </button>
          )}
        </div>

        {inside.length === 0 && adding === null && (
          <p className="editorial-rail__note">
            {'Nothing yet. A siege is one entry on a chronicle and a dozen scenes in the '
              + 'telling; this is where the scenes go.'}
          </p>
        )}

        {adding !== null && (
          <form
            className="editorial-drawn__revise"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!adding.trim()) return;
              setBusy(true);
              try {
                const made = await editorialApi.addEventInside(event.id, adding.trim());
                setAdding(null);
                onChanged();
                onOpen(made.id);
              } catch (err) {
                onSaid(`Not added: ${err instanceof Error ? err.message : String(err)}`);
              } finally { setBusy(false); }
            }}
          >
            <label className="editorial-drawn__label" htmlFor="event-part">
              {`What is this part called? It takes ${event.date} unless you change it later.`}
            </label>
            <input
              id="event-part"
              className="editorial-field__input"
              value={adding}
              autoFocus
              placeholder="The breach at the west gate"
              onChange={(e) => setAdding(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setAdding(null); }}
            />
            <div className="editorial-field__actions">
              <button
                type="submit"
                className="editorial-button editorial-button--secondary"
                disabled={busy || !adding.trim()}
              >
                Add it
              </button>
              <button type="button" className="editorial-link" onClick={() => setAdding(null)}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {inside.length > 0 && (
          <ul className="editorial-placelist">
            {inside.map((part) => (
              <li key={part.id}>
                <button
                  type="button"
                  className="editorial-button editorial-placelist__row"
                  onClick={() => onOpen(part.id)}
                >
                  <span className="editorial-placelist__name">{part.title || 'Untitled'}</span>
                  <span className="editorial-placelist__meta">{part.date}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
