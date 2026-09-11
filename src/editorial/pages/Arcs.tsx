import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Collaborate from '../components/Collaborate';
import { useParams, useSearchParams } from 'react-router-dom';
import { editorialApi, type Arc, type ArcAct, type CanonRequest } from '../api';
import { useAsync, useRefreshWhile } from '../useAsync';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import Surface from '../components/Surface';
import SurfaceMasthead from '../components/SurfaceMasthead';
import BackToList from '../components/BackToList';
import NewRecord from '../components/NewRecord';
import RecordTitle from '../components/RecordTitle';
import Proposal from '../components/Proposal';
import { DeleteCanon } from '../components/DeleteRecord';
import RecordSections, { type RecordGroup, type RecordSpec } from '../components/RecordSections';

/**
 * The shapes a telling takes through this universe.
 *
 * Arcs shared a lens with technologies: a name and a body of prose, with the
 * beats -- the one part of an arc that IS its shape -- flattened into a clamped
 * paragraph nobody could open. Technologies left for a surface of their own and
 * the lens kept arcs, under a note saying they should go the same way once they
 * had fields of their own. They always had one: the beats, in order.
 *
 * Then the beats turned out to be five things in one list: the throughline,
 * what is out of scope, "ACT 1 -- ..." headings, the beats, and dated notes on
 * progress, all numbered as beats. Acts are records now, each a part of the
 * page that folds and is written on its own; the rest have fields.
 *
 * An arc gets no picture. Everything else here is a record of something in the
 * world, and a picture of it is a picture of that thing; an arc is a course of
 * events through the world, and one image of it is an image of one moment in
 * it -- which is what the timeline's events are for.
 */

const ARC_PARTS: RecordGroup[] = [
  { title: 'What it is', keys: ['description', 'throughline'] },
  { title: 'What it holds to', keys: ['outOfScope'] },
];

const ARC_FIELDS: RecordSpec[] = [
  {
    key: 'description',
    label: 'In brief',
    hint: 'What is set in motion, who it happens to, and what it costs.',
  },
  {
    key: 'throughline',
    label: 'Throughline',
    hint: 'What drives it underneath the events: what it is about, not what happens.',
  },
  {
    key: 'outOfScope',
    label: 'Kept out of it',
    list: true,
    hint: 'What it leaves out or keeps hidden, one per line. The writing is held to these.',
  },
];

/** Below the acts: kept for the author, and beats no act has taken yet. */
const LATER_FIELDS: RecordSpec[] = [
  {
    key: 'notes',
    label: 'Working notes',
    list: true,
    noAgent: true,
    hint: 'What has been done and what is still to do. Yours; the agent does not write here.',
  },
  {
    key: 'details',
    label: 'Beats not yet in an act',
    list: true,
    ordered: true,
    hint: 'In order, one per line. Move each into the act it belongs to.',
  },
];

const ACT_FIELDS: RecordSpec[] = [
  {
    key: 'span',
    label: 'Where it falls',
    hint: 'Which chapters it covers, like "Chapters 1 and 2".',
    noAgent: true,
  },
  {
    key: 'summary',
    label: 'What it does',
    hint: 'Where it starts, what turns in it, and where it leaves things for the next act.',
  },
  {
    key: 'beats',
    label: 'The beats',
    list: true,
    ordered: true,
    hint: 'In order, one per line. The list numbers them, so leave the numbers out.',
  },
];

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** How a field being written is known: the bare key for the arc, "act:key" for an act. */
const claim = (field: string, actId?: string) => (actId ? `${actId}:${field}` : field);

const beatsIn = (arc: Arc) => arc.acts.reduce((n, act) => n + act.beats.length, 0) + arc.details.length;

const actHeading = (act: ArcAct) => `Act ${act.actNumber}${act.title ? `: ${act.title}` : ''}`;

export default function Arcs() {
  const { id: universeId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const openId = params.get('open');
  const [said, setSaid] = useState<string | null>(null);
  const [filing, setFiling] = useState(false);

  const universe = useAsync((s) => editorialApi.getUniverse(universeId, s), [universeId]);
  const index = useAsync((s) => editorialApi.listArcs(universeId, s), [universeId]);
  const arcs = useMemo(() => index.data ?? [], [index.data]);

  const arcId = openId ?? arcs[0]?.id ?? null;
  const open = useAsync<Arc | null>(
    (s) => (arcId ? editorialApi.getArc(arcId, s) : Promise.resolve(null)),
    [arcId],
  );

  const requests = useAsync((s) => editorialApi.listArcRequests(universeId, s), [universeId]);
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
  }, [arcId]);
  const loadedId = open.data?.id ?? null;
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
      const p = row.payload as { arcId?: string; actId?: string; fields?: string[] };
      if (row.payload?.proposed || p.arcId !== arcId) continue;
      for (const f of p.fields ?? []) claimed.add(claim(f, p.actId));
    }
    return claimed;
  }, [requests.data, arcId]);

  const askForCanon = async (fields: string[], brief?: string, actId?: string) => {
    if (!arcId || filing || !fields.length) return;
    setFiling(true);
    setSaid(null);
    let filed = 0;
    try {
      // One request per field: several fields in one answer come back as one.
      for (const field of fields) {
        if (actId) await editorialApi.askForArcActCanon(universeId, arcId, actId, [field], brief || undefined);
        else await editorialApi.askForArcCanon(universeId, arcId, [field], brief || undefined);
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

  if (index.status === 'loading') {
    return <Surface name="arcs"><LoadingState label="Reading the arcs…" /></Surface>;
  }
  if (index.status === 'error') {
    return (
      <Surface name="arcs">
        <ErrorState title="Could not load arcs" error={index.error} onRetry={index.retry} />
      </Surface>
    );
  }

  const acts = arcs.reduce((n, a) => n + a.acts.length, 0);
  const beats = arcs.reduce((n, a) => n + beatsIn(a), 0);

  return (
    <Surface name="arcs">
      <div
        className="editorial-family-workspace"
        data-mobile-view={openId ? 'record' : 'cast'}
      >
        <SurfaceMasthead
          title={universe.data?.title ?? 'Arcs'}
          action={(
            <NewRecord
              label="New arc"
              prompt="What is it called?"
              placeholder="The Frequency"
              briefPrompt="What should it be?"
              briefPlaceholder="Malakor finally reaches the source of the signal, and it is not Elyse"
              onCreate={async (title) => (await editorialApi.createArc(universeId, title)).id}
              onWrite={async (id, brief) => {
                for (const field of ARC_FIELDS) {
                  await editorialApi.askForArcCanon(universeId, id, [field.key], brief);
                }
              }}
              onCreated={(id, written) => {
                index.retry();
                requests.retry();
                set({ open: id });
                if (written) setSaid('Writing the arc. Each field arrives below as it lands.');
              }}
              onFailed={setSaid}
            />
          )}
          standfirst={!arcs.length
            ? 'Nothing recorded yet.'
            : `${plural(arcs.length, 'arc')}, ${plural(acts, 'act')}, ${plural(beats, 'beat')}.`}
          status={said}
        />

        <div className="editorial-panes">
          <div className="editorial-cast-column">
            <div className="editorial-section-header">
              <h2 className="editorial-section-title">The arcs</h2>
              <span className="editorial-register__count">{plural(arcs.length, 'arc')}</span>
            </div>

            <nav className="editorial-pane editorial-pane--cast" aria-label="The arcs">
              {arcs.length === 0 ? (
                <p className="editorial-rail__note">
                  Nothing recorded yet. An arc is the shape a telling takes: what is set in
                  motion, who it happens to, and what it costs.
                </p>
              ) : (
                <ul className="editorial-placelist">
                  {arcs.map((a) => (
                    <li key={a.id}>
                      <button
                        type="button"
                        className="editorial-button editorial-placelist__row"
                        aria-pressed={a.id === arcId}
                        onClick={() => set({ open: a.id })}
                      >
                        <span className="editorial-placelist__name">{a.title || 'Untitled'}</span>
                        <span className="editorial-placelist__meta">
                          {[`Arc ${a.arcNumber}`, a.acts.length ? plural(a.acts.length, 'act') : null,
                            plural(beatsIn(a), 'beat')].filter(Boolean).join(' · ')}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </nav>
          </div>

          <div className="editorial-pane editorial-pane--record" ref={recordPane}>
            <BackToList label="The arcs" onBack={() => set({ open: '' })} />
            {open.data ? (
              <Detail
                universeId={universeId}
                arc={open.data}
                drafting={drafting}
                filing={filing}
                requests={requests.data ?? []}
                onAskCanon={askForCanon}
                onDeleted={() => { set({ open: '' }); reload(); }}
                onChanged={reload}
                onSaid={setSaid}
              />
            ) : open.status === 'error' ? (
              <ErrorState title="Could not read this arc" error={open.error} onRetry={open.retry} />
            ) : (
              <EmptyState
                title={arcs.length ? 'Nothing chosen' : 'No arcs yet'}
                description={arcs.length
                  ? 'Pick an arc to read and add to it.'
                  : 'Start one with New arc, above.'}
              />
            )}
          </div>
        </div>
      </div>
    </Surface>
  );
}

/** One arc, in full: what it is, its acts, and what is kept for the author. */
function Detail({
  onDeleted,
  universeId, arc, drafting, filing, requests, onAskCanon, onChanged, onSaid,
}: {
  universeId: string;
  arc: Arc;
  drafting: Set<string>;
  filing: boolean;
  requests: CanonRequest[];
  onAskCanon: (fields: string[], brief?: string, actId?: string) => Promise<void>;
  onDeleted: () => void;
  onChanged: () => void;
  onSaid: (s: string) => void;
}) {
  const answered = requests.filter(
    (r) => (r.payload as { arcId?: string }).arcId === arc.id && r.payload?.proposed,
  );
  const actOf = (r: CanonRequest) => (r.payload as { actId?: string }).actId;

  const arcDrafting = new Set([...drafting].filter((k) => !k.includes(':')));
  const draftingIn = (actId: string) => new Set(
    [...drafting].filter((k) => k.startsWith(`${actId}:`)).map((k) => k.slice(actId.length + 1)),
  );

  const later = LATER_FIELDS.filter((f) => f.key !== 'details' || arc.details.length > 0);
  const laterGroups: RecordGroup[] = [
    { title: 'Working notes', keys: ['notes'], startClosed: true },
    ...(arc.details.length ? [{ title: 'Beats not yet in an act', keys: ['details'] }] : []),
  ];
  const labelIn = (specs: RecordSpec[]) => (key: string) => specs.find((f) => f.key === key)?.label ?? key;

  const valueOf = (k: string) => (arc as unknown as Record<string, string | string[]>)[k] ?? '';
  const save = async (field: string, value: string | string[]) => {
    await editorialApi.updateArc(arc.id, { [field]: value });
    onChanged();
  };
  const saveAct = async (actId: string, field: string, value: string | string[]) => {
    await editorialApi.updateArcAct(actId, { [field]: value });
    onChanged();
  };
  const arcAskable = ARC_FIELDS.map((f) => f.key).filter((k) => !arcDrafting.has(k));

  return (
    <>
      <div className="editorial-section-header editorial-place-head">
        <RecordTitle
          actions={(
<DeleteCanon
              quiet
              kind="arc"
              id={arc.id}
              what="arc"
              name={arc.title}
              onDeleted={() => onDeleted()}
              onSaid={onSaid}
            />
          )}
          name={arc.title}
          what="arc"
          onRename={async (title) => {
            await editorialApi.updateArc(arc.id, { title });
            onChanged();
          }}
          onSaid={onSaid}
        />
        <div className="editorial-section-header__actions">
          <Collaborate
            variant="button"
            about={{ kind: 'arc', id: arc.id }}
            label={filing ? 'Asking…' : !arcAskable.length ? 'Drafting…' : 'Collaborate'}
            disabled={filing || !arcAskable.length}
            onAsk={(brief) => onAskCanon(arcAskable, brief)}
          />
        </div>
      </div>

      {/* The number is in the list and usually in the title; a line that only
          repeated it, in a different numeral system, said nothing. */}
      {arc.isProtected && (
        <p className="editorial-rail__note">Protected from automated changes.</p>
      )}

      <RecordSections
        about={{ kind: 'arc', id: arc.id }}
        key={`${arc.id}-what`}
        name="arc"
        specs={ARC_FIELDS}
        groups={ARC_PARTS}
        valueOf={valueOf}
        drafting={arcDrafting}
        onCollaborate={(keys, brief) => onAskCanon(keys, brief)}
        onSave={save}
      />

      {answered.filter((r) => !actOf(r)).map((row) => (
        <Proposal
          key={row.id}
          request={row}
          labelFor={labelIn([...ARC_FIELDS, ...LATER_FIELDS])}
          orderedKeys={['details']}
          onAccept={async (proposed) => { await editorialApi.updateArc(arc.id, proposed); }}
          onChanged={onChanged}
          onSaid={onSaid}
        />
      ))}

      <section className="editorial-band editorial-arcacts">
        <div className="editorial-section-header">
          <h3 className="editorial-section-title">The acts</h3>
          <div className="editorial-section-header__actions">
            <NewRecord
              label="New act"
              prompt="What is this act called?"
              placeholder="The Long Burn"
              briefPrompt="What happens in it?"
              briefPlaceholder="The convoy's last jump, and what Malakor leaves behind at Nexus Prime"
              onCreate={async (title) => (await editorialApi.createArcAct(arc.id, title)).id}
              onWrite={async (id, brief) => {
                for (const field of ['summary', 'beats']) {
                  await editorialApi.askForArcActCanon(universeId, arc.id, id, [field], brief);
                }
              }}
              onCreated={(_id, written) => {
                onChanged();
                if (written) onSaid('Writing the act. What it does and its beats arrive in it.');
              }}
              onFailed={onSaid}
            />
          </div>
        </div>

        {arc.acts.length === 0 && (
          <p className="editorial-rail__note">
            No acts yet. An act is a movement of the arc with its own turn: add one, and
            Collaborate inside it to have its beats written.
          </p>
        )}

        {/* Each act folds on its own and asks on its own. Shut by default: the
            arc is read an act at a time, and three open acts is a wall. */}
        {arc.acts.map((act) => (
          <Fragment key={act.id}>
            <RecordSections
              about={{ kind: 'act', id: act.id }}
              key={act.id}
              name={`act-${act.id}`}
              specs={ACT_FIELDS}
              groups={[{
                title: actHeading(act),
                keys: ACT_FIELDS.map((f) => f.key),
                startClosed: true,
                rename: {
                  value: act.title,
                  what: 'act',
                  onRename: async (title) => { await editorialApi.updateArcAct(act.id, { title }); onChanged(); },
                  onSaid,
                },
                actions: (
                  <DeleteCanon
                    quiet
                    kind="act"
                    id={act.id}
                    what="act"
                    name={actHeading(act)}
                    onDeleted={onChanged}
                    onSaid={onSaid}
                  />
                ),
              }]}
              valueOf={(k) => (act as unknown as Record<string, string | string[]>)[k] ?? ''}
              drafting={draftingIn(act.id)}
              onCollaborate={(keys, brief) => onAskCanon(keys, brief, act.id)}
              onSave={(k, v) => saveAct(act.id, k, v)}
            />
            {answered.filter((r) => actOf(r) === act.id).map((row) => (
              <Proposal
                key={row.id}
                request={row}
                labelFor={labelIn(ACT_FIELDS)}
                orderedKeys={['beats']}
                onAccept={async (proposed) => { await editorialApi.updateArcAct(act.id, proposed); }}
                onChanged={onChanged}
                onSaid={onSaid}
              />
            ))}
          </Fragment>
        ))}
      </section>

      <RecordSections
        about={{ kind: 'arc', id: arc.id }}
        key={`${arc.id}-later`}
        name="arc-kept"
        specs={later}
        groups={laterGroups}
        valueOf={valueOf}
        drafting={arcDrafting}
        onCollaborate={(keys, brief) => onAskCanon(keys, brief)}
        onSave={save}
      />
    </>
  );
}
