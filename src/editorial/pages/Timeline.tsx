import { useCallback, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  editorialApi, type CanonRequest, type EventInDepth, type TimelineEvent,
} from '../api';
import { nestChronicle } from '../chronicle';
import { useAsync, useRefreshWhile } from '../useAsync';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import Surface from '../components/Surface';
import SurfaceMasthead from '../components/SurfaceMasthead';
import BackToList from '../components/BackToList';
import RecordTitle from '../components/RecordTitle';
import Proposal from '../components/Proposal';
import { DeleteCanon } from '../components/DeleteRecord';
import NewRecord from '../components/NewRecord';
import RecordSections, { type RecordGroup, type RecordSpec } from '../components/RecordSections';

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

/**
 * The parts an event's record is made of.
 *
 * What happened is one question and what it left behind is another, and they
 * are asked by different readers: somebody following the chronicle wants the
 * first, somebody working out why the next chapter looks like this wants the
 * second.
 */
const EVENT_PARTS: RecordGroup[] = [
  { title: 'What happened', keys: ['description', 'account'] },
  { title: 'What it left behind', keys: ['consequences', 'remembrance'] },
];

/** What an event record holds. Declared once, arranged by the parts above. */
const EVENT_FIELDS: RecordSpec[] = [
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
    <div className="editorial-listbar">
      <span className="editorial-listbar__label">Years</span>
      <input
        className="editorial-listbar__field"
        type="number"
        inputMode="numeric"
        value={from}
        placeholder={String(span.first)}
        aria-label={`From year, earliest recorded is ${span.first}`}
        onChange={(e) => onChange({ from: e.target.value })}
      />
      <span className="editorial-listbar__to">to</span>
      <input
        className="editorial-listbar__field"
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
        <span className="editorial-listbar__note">
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
  // Which events are unfolded in the chronicle, by id, once somebody has chosen.
  const [opened, setOpened] = useState<Record<string, boolean>>({});
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

  const askForParts = async () => {
    if (!eventId) return;
    setSaid(null);
    try {
      await editorialApi.askForEventParts(universeId, eventId);
      setSaid('Asked what this breaks into. The proposal arrives below.');
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

  // The chronicle as it nests: an event's parts under it, folded until they
  // are opened. It was one flat list, where "the boarding" and its three
  // moments sat side by side as four unrelated entries. A part whose event is
  // outside the chosen years stands at the top rather than disappearing.
  const under = nestChronicle(events);
  // The open event's ancestors, so following a link into a part shows where
  // it sits rather than a list that seems not to contain it.
  const byId = new Map(events.map((e) => [e.id, e]));
  const revealing = new Set<string>();
  let up = eventId ? byId.get(eventId)?.parentId ?? null : null;
  while (up && !revealing.has(up)) {
    revealing.add(up);
    up = byId.get(up)?.parentId ?? null;
  }
  const toggle = (id: string) => setOpened((was) => ({ ...was, [id]: !(was[id] ?? revealing.has(id)) }));

  return (
    <Surface name="timeline">
      <div className="editorial-family-workspace" data-mobile-view={openId ? 'record' : 'cast'}>
        <SurfaceMasthead
          title={universe.data?.title ?? 'Timeline'}
          action={(
            <NewRecord
              label="New event"
              prompt="What happened?"
              placeholder="The breach at the west gate"
              extra={{
                label: 'When? Optional, and in whatever words the chronicle uses.',
                placeholder: 'Year of the Iron Dirge 304',
              }}
              briefPrompt="What should it be?"
              briefPlaceholder="A boarding action that went wrong and is remembered as a victory"
              parent={{
                label: 'Part of which event?',
                selected: open.data ? { id: open.data.event.id, name: open.data.event.title } : null,
                options: events.map((e) => ({ id: e.id, name: e.title || 'Untitled' })),
                none: 'Not part of anything — its own entry on the chronicle',
              }}
              onCreate={async (title, date, parentId) => {
                const made = await editorialApi.createEvent(universeId, title, date);
                if (parentId) await editorialApi.updateEvent(made.id, { parentId });
                return made.id;
              }}
              onWrite={async (id, brief) => {
                for (const field of EVENT_FIELDS) {
                  await editorialApi.askForEventCanon(universeId, id, [field.key], brief);
                }
              }}
              onCreated={(id, written) => {
                index.retry();
                requests.retry();
                set({ open: id, from: '', to: '' });
                if (written) setSaid('Writing the record. Each field arrives below as it lands.');
              }}
              onFailed={setSaid}
            />
          )}
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

            {/* A date as well as a title: an event with no date cannot be put
                in order, and the year control cannot see it. Still optional --
                "before the Collapse" is a real date and no number fits it. */}

            <Range span={span} from={from} to={to} onChange={set} />

            <nav className="editorial-pane editorial-pane--cast" aria-label="The chronicle">
              {events.length === 0 ? (
                <p className="editorial-rail__note">Nothing happened in those years.</p>
              ) : (
                <ul className="editorial-tree editorial-tree--root">
                  {(under.get(null) ?? []).map((e) => (
                    <ChronicleNode
                      key={e.id}
                      event={e}
                      under={under}
                      depth={0}
                      openId={eventId}
                      opened={opened}
                      revealing={revealing}
                      onOpen={(id) => set({ open: id })}
                      onToggle={toggle}
                    />
                  ))}
                </ul>
              )}
            </nav>
          </div>

          <div className="editorial-pane editorial-pane--record">
            <BackToList label="The chronicle" onBack={() => set({ open: '' })} />
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
                onAskParts={askForParts}
                onDeleted={() => { set({ open: '' }); reload(); }}
                events={events}
                onChanged={reload}
                onSaid={setSaid}
              />
            ) : open.status === 'error' ? (
              // Not "nothing chosen": something was chosen and could not be
              // read. Offering an empty pane for a failure sends the reader
              // looking for a selection they already made.
              <ErrorState
                title="Could not read this event"
                error={open.error}
                onRetry={open.retry}
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
  onDeleted, events,
  universeId, depth, drafting, asking, requests,
  onOpen, onAskCanon, onAskPicture, onAskParts, onChanged, onSaid,
}: {
  universeId: string;
  depth: EventInDepth;
  drafting: Set<string>;
  asking: boolean;
  requests: CanonRequest[];
  onOpen: (id: string) => void;
  onAskCanon: (fields: string[]) => Promise<void>;
  onAskPicture: () => Promise<void>;
  onAskParts: () => Promise<void>;
  onDeleted: () => void;
  /** The chronicle as listed, for choosing what this event is part of. */
  events: TimelineEvent[];
  onChanged: () => void;
  onSaid: (s: string) => void;
}) {
  const { event, inside, partOf, pictures } = depth;
  const [moving, setMoving] = useState(false);

  // What it can be moved into: anything but itself and what is inside it.
  const within = new Set<string>([event.id]);
  for (let grew = true; grew;) {
    grew = false;
    for (const e of events) {
      if (e.parentId && within.has(e.parentId) && !within.has(e.id)) { within.add(e.id); grew = true; }
    }
  }
  const destinations = chronicleOrder(events).filter(({ entry }) => !within.has(entry.id));
  if (partOf && !destinations.some(({ entry }) => entry.id === partOf.id)) {
    destinations.unshift({ entry: { ...event, id: partOf.id, title: partOf.title, parentId: null }, depth: 0 });
  }
  const move = async (into: string) => {
    setMoving(true);
    try {
      await editorialApi.updateEvent(event.id, { parentId: into || null });
      const where = destinations.find(({ entry }) => entry.id === into)?.entry.title;
      onSaid(into ? `Moved into ${where}.` : 'Moved to the top of the chronicle.');
      onChanged();
    } catch (e) {
      onSaid(`Not moved: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setMoving(false);
    }
  };
  const [adding, setAdding] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mine = (r: CanonRequest) => (r.payload as { eventId?: string }).eventId === event.id;
  const drawn = requests.filter(
    (r) => mine(r) && r.payload?.proposed && r.artifactType === 'timeline_event_image_request',
  );
  const proposals = requests.filter(
    (r) => mine(r) && r.payload?.proposed && r.artifactType === 'timeline_event_canon_request',
  );
  const partsProposed = requests.filter(
    (r) => mine(r) && r.payload?.proposed && r.artifactType === 'timeline_event_parts_request',
  );
  const partsPending = requests.some(
    (r) => mine(r) && !r.payload?.proposed && r.artifactType === 'timeline_event_parts_request',
  );

  const save = async (field: string, value: string | string[]) => {
    await editorialApi.updateEvent(event.id, { [field]: value });
    onChanged();
  };

  return (
    <>
      <div className="editorial-section-header editorial-place-head">
        <RecordTitle
          name={event.title}
          what="event"
          onRename={async (title) => {
            await editorialApi.updateEvent(event.id, { title });
            onChanged();
          }}
          onSaid={onSaid}
        />
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
          <DeleteCanon
            kind="event"
            id={event.id}
            what="event"
            name={event.title}
            onDeleted={() => onDeleted()}
            onSaid={onSaid}
          />
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

      {/* Where it sits in the chronicle, changeable. It could be chosen only
          when the event was made, so an event filed at the top stayed there
          however plainly it belonged inside another. */}
      <label className="editorial-eventparent">
        <span className="editorial-eventparent__label">Part of</span>
        <select
          className="editorial-field__select"
          value={event.parentId ?? ''}
          disabled={moving}
          onChange={(e) => void move(e.target.value)}
        >
          <option value="">Nothing: its own entry on the chronicle</option>
          {destinations.map(({ entry, depth: level }) => (
            <option key={entry.id} value={entry.id}>
              {`${'\u00a0\u00a0'.repeat(level)}${entry.title || 'Untitled'}`}
            </option>
          ))}
        </select>
      </label>

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
        <RecordSections
          key={event.id}
          name="event"
          specs={EVENT_FIELDS}
          groups={EVENT_PARTS}
          valueOf={(k) => String((event as unknown as Record<string, unknown>)[k] ?? '')}
          drafting={drafting}
          onCollaborate={onAskCanon}
          onSave={save}
        />
      </section>

      {proposals.map((row) => (
        <Proposal
          key={row.id}
          request={row}
          labelFor={(key) => EVENT_FIELDS.find((f) => f.key === key)?.label ?? key}
          onAccept={async (proposed) => { await editorialApi.updateEvent(event.id, proposed); }}
          onChanged={onChanged}
          onSaid={onSaid}
        />
      ))}

      <section className="editorial-band">
        <div className="editorial-section-header">
          <h3 className="editorial-section-title">What it breaks into</h3>
          {adding === null && (
            <div className="editorial-section-header__actions">
              <button type="button" className="editorial-link" onClick={() => setAdding('')}>
                Add a part
              </button>
              {/* A different ask from the field Collaborates above it: this
                  proposes records rather than prose, and each one becomes a
                  real event on the chronicle once it is accepted. */}
              {partsPending ? (
                <span className="editorial-field__drafting">Drafting…</span>
              ) : (
                <button type="button" className="editorial-link" onClick={onAskParts}>
                  Collaborate
                </button>
              )}
            </div>
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

        {partsProposed.map((row) => {
          const parts = (row.payload as {
            proposed?: { parts?: Array<{ title: string; date: string; description: string }> };
          }).proposed?.parts ?? [];
          return (
            <article className="editorial-placeproposal" key={row.id}>
              <dl className="editorial-placeproposal__fields">
                {parts.map((part) => (
                  <div key={part.title}>
                    <dt>{`${part.title}${part.date ? ` · ${part.date}` : ''}`}</dt>
                    <dd>{part.description}</dd>
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
                      // In order, so the chronicle reads the way it was
                      // proposed rather than in whatever order the writes
                      // happened to finish.
                      for (const part of parts) {
                        await editorialApi.addEventInside(event.id, part.title, part.date);
                      }
                      await editorialApi.resolveCanonRequest(row.id, 'accepted');
                      onSaid(`${parts.length} parts are now events in their own right.`);
                      onChanged();
                    } catch (e) {
                      onSaid(`Not added: ${e instanceof Error ? e.message : String(e)}`);
                    } finally { setBusy(false); }
                  }}
                >
                  {`Put ${parts.length} on the chronicle`}
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

/**
 * One event in the chronicle, and the events inside it.
 *
 * The same two controls as a place in the geography: one to open the event,
 * one to show what is inside it, so unfolding never navigates away and
 * opening never unfolds by accident.
 */
function ChronicleNode({
  event, under, depth, openId, opened, revealing, onOpen, onToggle,
}: {
  event: TimelineEvent;
  under: Map<string | null, TimelineEvent[]>;
  depth: number;
  openId: string | null;
  opened: Record<string, boolean>;
  revealing: Set<string>;
  onOpen: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const inside = under.get(event.id) ?? [];
  const isOpen = opened[event.id] ?? revealing.has(event.id);
  const title = event.title || 'Untitled';

  return (
    <li className="editorial-tree__node">
      <div className="editorial-tree__row" style={{ paddingLeft: `${depth * 1.25}rem` }}>
        {inside.length > 0 ? (
          <button
            type="button"
            className="editorial-button editorial-button--ghost editorial-tree__disclose"
            aria-expanded={isOpen}
            aria-label={`${isOpen ? 'Hide' : 'Show'} what happened inside ${title}`}
            onClick={() => onToggle(event.id)}
          >
            <span className="editorial-house__mark" aria-hidden="true" data-open={isOpen || undefined} />
          </button>
        ) : (
          <span className="editorial-tree__gutter" aria-hidden="true" />
        )}

        <button
          type="button"
          className="editorial-button editorial-placelist__row editorial-tree__name"
          aria-pressed={event.id === openId}
          onClick={() => onOpen(event.id)}
        >
          <span className="editorial-placelist__name">{title}</span>
          <span className="editorial-placelist__meta">
            {[
              event.date,
              inside.length ? `${inside.length} inside` : null,
              event.pictureCount ? `${event.pictureCount} picture${event.pictureCount > 1 ? 's' : ''}` : null,
            ].filter(Boolean).join(' · ')}
          </span>
        </button>
      </div>

      {isOpen && inside.length > 0 && (
        <ul className="editorial-tree">
          {inside.map((child) => (
            <ChronicleNode
              key={child.id}
              event={child}
              under={under}
              depth={depth + 1}
              openId={openId}
              opened={opened}
              revealing={revealing}
              onOpen={onOpen}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/** The chronicle depth-first, as the list draws it: each event, then what is inside it. */
function chronicleOrder(events: TimelineEvent[]): Array<{ entry: TimelineEvent; depth: number }> {
  const under = nestChronicle(events);
  const out: Array<{ entry: TimelineEvent; depth: number }> = [];
  const walk = (parent: string | null, depth: number, seen: Set<string>) => {
    for (const e of under.get(parent) ?? []) {
      if (seen.has(e.id)) continue;
      out.push({ entry: e, depth });
      walk(e.id, depth + 1, new Set(seen).add(e.id));
    }
  };
  walk(null, 0, new Set());
  return out;
}
