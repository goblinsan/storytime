import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { editorialApi, type Arc, type CanonRequest } from '../api';
import { useAsync, useRefreshWhile } from '../useAsync';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import Surface from '../components/Surface';
import SurfaceMasthead from '../components/SurfaceMasthead';
import BackToList from '../components/BackToList';
import NewRecord from '../components/NewRecord';
import RecordTitle from '../components/RecordTitle';
import Proposal from '../components/Proposal';
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
 * An arc gets no picture. Everything else here is a record of something in the
 * world, and a picture of it is a picture of that thing; an arc is a course of
 * events through the world, and one image of it is an image of one moment in
 * it -- which is what the timeline's events are for.
 */

const ARC_PARTS: RecordGroup[] = [
  { title: 'What it is', keys: ['description'] },
  { title: 'How it moves', keys: ['details'] },
];

const ARC_FIELDS: RecordSpec[] = [
  {
    key: 'description',
    label: 'In brief',
    hint: 'The throughline: what is set in motion, who it happens to, and what it costs.',
  },
  {
    key: 'details',
    label: 'The beats',
    list: true,
    ordered: true,
    hint: 'In order. Each begins with its label, like Act I or Beat 3, and says what happens.',
  },
];

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
      const p = row.payload as { arcId?: string; fields?: string[] };
      if (row.payload?.proposed || p.arcId !== arcId) continue;
      for (const f of p.fields ?? []) claimed.add(f);
    }
    return claimed;
  }, [requests.data, arcId]);

  const askForCanon = async (fields: string[]) => {
    if (!arcId || filing || !fields.length) return;
    setFiling(true);
    setSaid(null);
    let filed = 0;
    try {
      // One request per field: several fields in one answer come back as one.
      for (const field of fields) {
        await editorialApi.askForArcCanon(universeId, arcId, [field]);
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

  const beats = arcs.reduce((n, a) => n + (a.details?.length ?? 0), 0);

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
              placeholder="Arc II: The Frequency"
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
          standfirst={arcs.length
            ? `${arcs.length} arc${arcs.length === 1 ? '' : 's'}, ${beats} beats between them.`
            : 'Nothing recorded yet.'}
          status={said}
        />

        <div className="editorial-panes">
          <div className="editorial-cast-column">
            <div className="editorial-section-header">
              <h2 className="editorial-section-title">The arcs</h2>
              <span className="editorial-register__count">
                {`${arcs.length} arc${arcs.length === 1 ? '' : 's'}`}
              </span>
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
                          {`Arc ${a.arcNumber} · ${a.details?.length ?? 0} beat${(a.details?.length ?? 0) === 1 ? '' : 's'}`}
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
                arc={open.data}
                drafting={drafting}
                filing={filing}
                requests={requests.data ?? []}
                onAskCanon={askForCanon}
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

/** One arc, in full. */
function Detail({
  arc, drafting, filing, requests, onAskCanon, onChanged, onSaid,
}: {
  arc: Arc;
  drafting: Set<string>;
  filing: boolean;
  requests: CanonRequest[];
  onAskCanon: (fields: string[]) => Promise<void>;
  onChanged: () => void;
  onSaid: (s: string) => void;
}) {
  const proposals = requests.filter(
    (r) => (r.payload as { arcId?: string }).arcId === arc.id && r.payload?.proposed,
  );

  const save = async (field: string, value: string | string[]) => {
    await editorialApi.updateArc(arc.id, { [field]: value });
    onChanged();
  };

  return (
    <>
      <div className="editorial-section-header editorial-place-head">
        <RecordTitle
          name={arc.title}
          what="arc"
          onRename={async (title) => {
            await editorialApi.updateArc(arc.id, { title });
            onChanged();
          }}
          onSaid={onSaid}
        />
        <div className="editorial-section-header__actions">
          <button
            type="button"
            className="editorial-button editorial-button--secondary"
            disabled={filing || drafting.size > 0}
            onClick={() => onAskCanon(ARC_FIELDS.map((f) => f.key).filter((k) => !drafting.has(k)))}
          >
            {filing ? 'Asking…' : drafting.size > 0 ? 'Drafting…' : 'Collaborate'}
          </button>
        </div>
      </div>

      <p className="editorial-rail__note">
        {[`Arc ${arc.arcNumber}`, arc.isProtected ? 'protected from automated changes' : null]
          .filter(Boolean).join(' · ')}
      </p>

      <RecordSections
        key={arc.id}
        name="arc"
        specs={ARC_FIELDS}
        groups={ARC_PARTS}
        valueOf={(k) => (arc as unknown as Record<string, string | string[]>)[k] ?? ''}
        drafting={drafting}
        onCollaborate={onAskCanon}
        onSave={save}
      />

      {proposals.map((row) => (
        <Proposal
          key={row.id}
          request={row}
          labelFor={(key) => ARC_FIELDS.find((f) => f.key === key)?.label ?? key}
          onAccept={async (proposed) => { await editorialApi.updateArc(arc.id, proposed); }}
          onChanged={onChanged}
          onSaid={onSaid}
        />
      ))}
    </>
  );
}
