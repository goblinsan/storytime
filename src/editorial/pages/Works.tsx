import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { editorialApi, type CanonRequest, type WorkInDepth } from '../api';
import { inOrder } from '../workTree';
import { useAsync, useRefreshWhile } from '../useAsync';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import Surface from '../components/Surface';
import SurfaceMasthead from '../components/SurfaceMasthead';
import BackToList from '../components/BackToList';
import NewRecord from '../components/NewRecord';
import RecordTitle from '../components/RecordTitle';
import Proposal from '../components/Proposal';
import RecordSections, { type RecordGroup, type RecordSpec } from '../components/RecordSections';
import { formatLabel, isReadable } from '../workFormats';
import { readerPath, universeSectionPath, type UniverseSection } from '../paths';

/**
 * Where everything is put together.
 *
 * Every other surface keeps a kind of canon. This one keeps the tellings made
 * FROM it, and a telling has a shape the others do not: it is made of parts,
 * in order, and the parts are made of prose that has to follow from the part
 * before. So the library is a tree -- a work and what it is made of -- and the
 * part you open knows where it sits.
 *
 * COLLABORATING HERE COMPOSES
 * On a work, Collaborate asks what it is made of, and accepting the answer
 * makes the parts. On a part, it writes the prose -- handed the last lines of
 * the part before, so the first sentence follows from them, and what the next
 * part is meant to be, so this one arrives there. Every answer is a proposal
 * like any other: put it in force, ask for a revision, or refuse it.
 *
 * The chapters of "The Harrowed Veil" were six unrelated rows in a flat list.
 * Which work a part belongs to was written into a JSON blob and nothing read
 * it; it is a column now, and the tree is drawn from it.
 */

/** What a work that stands alone is made of on the page. */
const WORK_PARTS: RecordGroup[] = [
  { title: 'What it is', keys: ['description'] },
];

/**
 * What a part is made of: what happens in it, then the prose itself. The prose
 * starts folded, because a chapter is nine thousand words and opening it by
 * default buries everything after it; the reader is one link away.
 */
const PART_PARTS: RecordGroup[] = [
  { title: 'What happens', keys: ['description'] },
  { title: 'The prose', keys: ['content'], startClosed: true },
];

const WORK_FIELDS: RecordSpec[] = [
  {
    key: 'description',
    label: 'In brief',
    hint: 'Whose story it is, what is at stake, and what shape it takes.',
  },
];

const PART_FIELDS: RecordSpec[] = [
  {
    key: 'description',
    label: 'In brief',
    hint: 'What happens in this part, in order, and where it leaves things.',
  },
  {
    key: 'content',
    label: 'The prose',
    rows: 24,
    hint: 'The part itself. Collaborate composes it from what happens, following on from the part before.',
  },
];

/**
 * Past a few hundred words a part is written, and Collaborate would have to
 * REPLACE it: the agent is handed only the opening of what is there and asked
 * for a chapter back, so "improve" on a nine-thousand-word chapter would be a
 * two-thousand-word rewrite of its first seven hundred -- and Put it in force
 * would swap one for the other. Composing is offered while a part is unwritten.
 * Revising a written passage is a different ask, and the next thing to build.
 */
const WRITTEN = 300;
const WRITTEN_HINT = 'Written. Edit it directly: composing writes a whole part, so it is '
  + 'offered only while a part is unwritten. Revising a passage is the next thing to build.';

/** Where a piece of canon a work draws on lives in the site. */
const CANON_SURFACE: Record<string, { section: UniverseSection; param: string }> = {
  character: { section: 'characters', param: 'who' },
  location: { section: 'geography', param: 'place' },
  faction: { section: 'societies', param: 'open' },
  creature: { section: 'bestiary', param: 'open' },
  bestiary: { section: 'bestiary', param: 'open' },
  event: { section: 'timeline', param: 'open' },
  timeline_event: { section: 'timeline', param: 'open' },
  technology: { section: 'technologies', param: 'open' },
};

const inWords = (raw: string) => raw.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

export default function Works() {
  const { id: universeId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const openId = params.get('open');
  const [said, setSaid] = useState<string | null>(null);
  const [filing, setFiling] = useState(false);

  const universe = useAsync((s) => editorialApi.getUniverse(universeId, s), [universeId]);
  const index = useAsync((s) => editorialApi.listWorkTree(universeId, s), [universeId]);
  const tree = useMemo(() => inOrder(index.data?.works ?? []), [index.data]);

  const workId = openId ?? tree[0]?.id ?? null;
  const open = useAsync<WorkInDepth | null>(
    (s) => (workId ? editorialApi.getWorkInDepth(workId, s) : Promise.resolve(null)),
    [workId],
  );

  const requests = useAsync((s) => editorialApi.listWorkDrafts(universeId, s), [universeId]);
  const live = useMemo(
    () => (requests.data ?? []).filter((r) => r.status === 'generated'),
    [requests.data],
  );
  const outstanding = useMemo(() => live.some((r) => !r.payload?.proposed), [live]);
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
  }, [workId]);
  const loadedId = open.data?.work.id ?? null;
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
    for (const row of live) {
      const p = row.payload as { workId?: string; fields?: string[] };
      if (row.payload?.proposed || p.workId !== workId) continue;
      for (const f of p.fields ?? []) claimed.add(f);
    }
    return claimed;
  }, [live, workId]);

  const askForCanon = async (fields: string[]) => {
    if (!workId || filing || !fields.length) return;
    setFiling(true);
    setSaid(null);
    let filed = 0;
    try {
      for (const field of fields) {
        await editorialApi.askForWorkCanon(universeId, workId, [field]);
        filed += 1;
      }
      setSaid(fields.includes('content')
        ? 'Composing. The prose arrives below as a proposal when it is written.'
        : 'Asked. The proposal arrives below when it is written.');
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      setSaid(filed ? `Asked for ${filed} of ${fields.length}; the next one failed: ${why}` : `Not asked: ${why}`);
    } finally {
      setFiling(false);
      requests.retry();
    }
  };

  if (index.status === 'loading') {
    return <Surface name="works"><LoadingState label="Reading the library…" /></Surface>;
  }
  if (index.status === 'error') {
    return (
      <Surface name="works">
        <ErrorState title="Could not load works" error={index.error} onRetry={index.retry} />
      </Surface>
    );
  }

  const standalone = tree.filter((w) => w.depth === 0).length;
  const parts = tree.length - standalone;

  return (
    <Surface name="works">
      <div className="editorial-family-workspace" data-mobile-view={openId ? 'record' : 'cast'}>
        <SurfaceMasthead
          title={universe.data?.title ?? 'Works'}
          action={(
            <NewRecord
              label="New work"
              prompt="What is it called?"
              placeholder="The Harrowed Veil"
              briefPrompt="What should it be?"
              briefPlaceholder="A five-chapter story of the convoy's crossing, told from Mara's side"
              onCreate={async (title) => (await editorialApi.createWork(universeId, title)).id}
              onWrite={async (id, brief) => {
                // Written AND shaped: what it is, and what it is made of. The
                // parts arrive as a proposal to accept, not as rows already made.
                await editorialApi.askForWorkCanon(universeId, id, ['description'], brief);
                await editorialApi.askForWorkParts(universeId, id, brief);
              }}
              onCreated={(id, written) => {
                index.retry();
                requests.retry();
                set({ open: id });
                if (written) setSaid('Writing what it is and proposing its parts. Both arrive below.');
              }}
              onFailed={setSaid}
            />
          )}
          standfirst={tree.length
            ? `${plural(standalone, 'work')}, made of ${plural(parts, 'part')}.`
            : 'Nothing composed yet.'}
          status={said}
        />

        <div className="editorial-panes">
          <div className="editorial-cast-column">
            <div className="editorial-section-header">
              <h2 className="editorial-section-title">The library</h2>
              <span className="editorial-register__count">{plural(tree.length, 'entry', 'entries')}</span>
            </div>

            <nav className="editorial-pane editorial-pane--cast" aria-label="The library">
              {tree.length === 0 ? (
                <p className="editorial-rail__note">
                  Nothing composed yet. A work is made of parts, and each part of prose.
                </p>
              ) : (
                <ul className="editorial-placelist">
                  {tree.map((w) => (
                    <li key={w.id}>
                      <button
                        type="button"
                        className="editorial-button editorial-placelist__row editorial-worktree__row"
                        style={{ '--depth': w.depth } as React.CSSProperties}
                        aria-pressed={w.id === workId}
                        onClick={() => set({ open: w.id })}
                      >
                        <span className="editorial-placelist__name">{w.title || 'Untitled'}</span>
                        <span className="editorial-placelist__meta">
                          {w.depth === 0
                            ? [formatLabel(w.type), w.partCount ? plural(w.partCount, 'part') : null]
                              .filter(Boolean).join(' · ')
                            : [w.partNumber ? `Part ${w.partNumber}` : null,
                              w.words ? plural(w.words, 'word') : 'not written yet']
                              .filter(Boolean).join(' · ')}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </nav>
          </div>

          <div className="editorial-pane editorial-pane--record" ref={recordPane}>
            <BackToList label="The library" onBack={() => set({ open: '' })} />
            {open.data ? (
              <Detail
                universeId={universeId}
                depth={open.data}
                drafting={drafting}
                filing={filing}
                requests={live}
                history={requests.data ?? []}
                onOpen={(id) => set({ open: id })}
                onAskCanon={askForCanon}
                onChanged={reload}
                onSaid={setSaid}
              />
            ) : open.status === 'error' ? (
              <ErrorState title="Could not read this work" error={open.error} onRetry={open.retry} />
            ) : (
              <EmptyState
                title={tree.length ? 'Nothing chosen' : 'No works yet'}
                description={tree.length ? 'Pick a work or a part to read and add to it.' : 'Start one with New work, above.'}
              />
            )}
          </div>
        </div>
      </div>
    </Surface>
  );
}

/** One work or part, in full. */
function Detail({
  universeId, depth, drafting, filing, requests, history, onOpen, onAskCanon, onChanged, onSaid,
}: {
  universeId: string;
  depth: WorkInDepth;
  drafting: Set<string>;
  filing: boolean;
  requests: CanonRequest[];
  /** Everything asked of the works, including what was refused or failed. */
  history: CanonRequest[];
  onOpen: (id: string) => void;
  onAskCanon: (fields: string[]) => Promise<void>;
  onChanged: () => void;
  onSaid: (s: string) => void;
}) {
  const { work, parts, parent, cast } = depth;
  const isPart = Boolean(parent);
  const hasProse = Boolean(work.content?.trim());

  // A work that stands alone can carry prose of its own; one with parts may
  // still hold the draft it was planned with. Neither was shown before, while
  // its word count quietly included it.
  const fields = useMemo<RecordSpec[]>(() => {
    const base = isPart || hasProse
      ? [...(isPart ? PART_FIELDS : [...WORK_FIELDS, {
        ...PART_FIELDS[1],
        label: parts.length ? 'An earlier draft' : 'The prose',
      }])]
      : WORK_FIELDS;
    return base.map((f) => (f.key === 'content' && work.words > WRITTEN
      ? { ...f, noAgent: true, hint: WRITTEN_HINT }
      : f));
  }, [isPart, hasProse, parts.length, work.words]);
  const groups: RecordGroup[] = isPart
    ? PART_PARTS
    : hasProse
      ? [WORK_PARTS[0], { title: parts.length ? 'An earlier draft' : 'The prose', keys: ['content'], startClosed: true }]
      : WORK_PARTS;
  const partWords = parts.reduce((n, p) => n + (p.words || 0), 0);

  const mine = (r: CanonRequest) => (r.payload as { workId?: string }).workId === work.id;
  const proposals = requests.filter(
    (r) => mine(r) && r.payload?.proposed && r.artifactType === 'work_canon_request',
  );
  const partsProposed = requests.filter(
    (r) => mine(r) && r.payload?.proposed && r.artifactType === 'work_parts_request',
  );
  const partsPending = requests.some(
    (r) => mine(r) && !r.payload?.proposed && r.artifactType === 'work_parts_request',
  );

  // The newest thing asked of this work, when it came to nothing. Asking again,
  // or accepting anything since, is newer and so hides it.
  const lastAsked = history.filter(mine)
    .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))[0];
  const failure = lastAsked?.status === 'rejected' && lastAsked.payload?.failed
    ? {
      what: lastAsked.artifactType === 'work_parts_request'
        ? 'Proposing its parts'
        : (lastAsked.payload.fields ?? []).includes('content')
          ? 'Composing the prose'
          : `Writing ${(lastAsked.payload.fields ?? []).map((k) => fields.find((f) => f.key === k)?.label ?? k).join(', ')}`,
      reason: lastAsked.payload.failed.reason,
    }
    : null;

  const save = async (field: string, value: string | string[]) => {
    await editorialApi.updateWorkRecord(work.id, { [field]: value });
    onChanged();
  };

  const askForParts = async () => {
    try {
      await editorialApi.askForWorkParts(universeId, work.id);
      onSaid('Asked what this is made of. The proposal arrives below.');
      onChanged();
    } catch (e) {
      onSaid(`Not asked: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // What it draws on, grouped by kind, each linked to where it lives.
  const drawsOn = useMemo(() => {
    const byKind = new Map<string, Array<{ name: string; to: string | null }>>();
    const add = (kind: string, name: string, id: string) => {
      const place = CANON_SURFACE[kind];
      const to = place
        ? `${universeSectionPath(universeId, place.section)}?${place.param}=${encodeURIComponent(id)}${kind === 'character' ? '&cast=all' : ''}`
        : null;
      if (!byKind.has(kind)) byKind.set(kind, []);
      if (!byKind.get(kind)!.some((e) => e.name === name)) byKind.get(kind)!.push({ name, to });
    };
    for (const c of cast) add('character', c.name, c.id);
    for (const r of work.sourceCanonReferences ?? []) {
      if (r?.name && r?.entityId) add(r.entityType, r.name, r.entityId);
    }
    return [...byKind.entries()];
  }, [cast, work.sourceCanonReferences, universeId]);

  return (
    <>
      <div className="editorial-section-header editorial-place-head">
        <RecordTitle
          name={work.title}
          what={isPart ? 'part' : 'work'}
          onRename={async (title) => {
            await editorialApi.updateWorkRecord(work.id, { title });
            onChanged();
          }}
          onSaid={onSaid}
        />
        <div className="editorial-section-header__actions">
          <button
            type="button"
            className="editorial-button editorial-button--secondary"
            disabled={filing || drafting.size > 0}
            onClick={() => onAskCanon(fields.filter((f) => !f.noAgent)
              .map((f) => f.key).filter((k) => !drafting.has(k)))}
          >
            {filing ? 'Asking…' : drafting.size > 0 ? 'Drafting…' : 'Collaborate'}
          </button>
          {isReadable(work.type) && (parts.length ? partWords > 0 : work.words > 0) && (
            <Link
              className="editorial-link"
              to={readerPath(universeId, parts.length ? parts[0].id : work.id)}
            >
              {parts.length ? 'Read from the start' : 'Read it'}
            </Link>
          )}
        </div>
      </div>

      <p className="editorial-rail__note">
        {[formatLabel(work.type), work.status ? inWords(work.status) : null,
          parts.length
            ? `${plural(partWords, 'word')} across ${plural(parts.length, 'part')}`
            : work.words ? plural(work.words, 'word') : null].filter(Boolean).join(' · ')}
        {parent && (
          <>
            {' · '}
            {work.partNumber ? `part ${work.partNumber} of ` : 'part of '}
            <button type="button" className="editorial-link" onClick={() => onOpen(parent.id)}>
              {parent.title}
            </button>
          </>
        )}
      </p>

      <RecordSections
        key={work.id}
        name="work"
        specs={fields}
        groups={groups}
        valueOf={(k) => String((work as unknown as Record<string, unknown>)[k] ?? '')}
        drafting={drafting}
        onCollaborate={onAskCanon}
        onSave={save}
      />

      {failure && (
        <p className="editorial-field__failed" role="status">
          {`${failure.what} came to nothing: ${failure.reason.replace(/\.?$/, '.')} `}
          Collaborate to ask again.
        </p>
      )}

      {proposals.map((row) => (
        <Proposal
          key={row.id}
          request={row}
          labelFor={(key) => fields.find((f) => f.key === key)?.label ?? key}
          onAccept={async (proposed) => { await editorialApi.updateWorkRecord(work.id, proposed); }}
          onChanged={onChanged}
          onSaid={onSaid}
        />
      ))}

      <section className="editorial-band">
        <div className="editorial-section-header">
          <h3 className="editorial-section-title">{isPart ? 'What it is made of' : 'Its parts'}</h3>
          <div className="editorial-section-header__actions">
            <NewRecord
              label="New part"
              prompt="What is this part called?"
              placeholder="Chapter 6: The Long Burn"
              briefPrompt="What happens in it?"
              briefPlaceholder="The convoy's last jump, and what Malakor leaves behind at Nexus Prime"
              onCreate={async (title) => (await editorialApi.createWorkPart(work.id, title)).id}
              onWrite={async (id, brief) => {
                await editorialApi.askForWorkCanon(universeId, id, ['description'], brief);
              }}
              onCreated={(id) => { onChanged(); onOpen(id); }}
              onFailed={onSaid}
            />
            {/* A different ask from the record's Collaborate: this proposes
                PARTS, and each becomes a real one once it is accepted. */}
            {partsPending ? (
              <span className="editorial-field__drafting">Drafting…</span>
            ) : (
              <button type="button" className="editorial-link" onClick={askForParts}>
                Collaborate
              </button>
            )}
          </div>
        </div>

        {parts.length === 0 && partsProposed.length === 0 && (
          <p className="editorial-rail__note">
            {isPart
              ? 'Nothing inside it yet. A long chapter can be broken into scenes here.'
              : 'No parts yet. Add one, or Collaborate to have what it is made of proposed.'}
          </p>
        )}

        {parts.length > 0 && (
          <ul className="editorial-placelist">
            {parts.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="editorial-button editorial-placelist__row"
                  onClick={() => onOpen(p.id)}
                >
                  <span className="editorial-placelist__name">{p.title || 'Untitled'}</span>
                  <span className="editorial-placelist__meta">
                    {[p.partNumber ? `Part ${p.partNumber}` : null,
                      p.words ? plural(p.words, 'word') : 'not written yet'].filter(Boolean).join(' · ')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Below the parts that exist, numbered from the next one, because
            that is where they would go. Through the shared proposal block, so
            a set that is nearly right can be sent back with a reason rather
            than only added or refused. */}
        {partsProposed.map((row) => {
          const listed = ((row.payload as {
            proposed?: { parts?: Array<{ title: string; description: string }> };
          }).proposed?.parts) ?? [];
          return (
            <Proposal
              key={row.id}
              request={row}
              labelFor={() => 'Parts'}
              acceptLabel={`Add ${plural(listed.length, 'part')}`}
              acceptedMessage={`${plural(listed.length, 'part')} added, in order.`}
              render={() => (
                <ol
                  className="editorial-placeproposal__list editorial-placeproposal__list--ordered"
                  start={parts.length + 1}
                >
                  {listed.map((p) => (
                    <li key={p.title}>
                      <span className="editorial-workparts__title">{p.title}</span>
                      {p.description && <span className="editorial-workparts__summary">{p.description}</span>}
                    </li>
                  ))}
                </ol>
              )}
              onAccept={async () => {
                // In order, so the parts are numbered the way they were proposed.
                for (const p of listed) {
                  await editorialApi.createWorkPart(work.id, p.title, p.description);
                }
              }}
              onChanged={onChanged}
              onSaid={onSaid}
            />
          );
        })}
      </section>

      {drawsOn.length > 0 && (
        <section className="editorial-band">
          <div className="editorial-section-header">
            <h3 className="editorial-section-title">What it draws on</h3>
          </div>
          <ul className="editorial-entrygroup">
            {drawsOn.map(([kind, entries]) => (
              <li className="editorial-entrygroup__group" key={kind}>
                <span className="editorial-entrygroup__kind">{inWords(kind)}</span>
                <span className="editorial-entrygroup__who">
                  {entries.map((e, i) => (
                    <span key={e.name}>
                      {i > 0 && ', '}
                      {e.to ? <Link className="editorial-link" to={e.to}>{e.name}</Link> : e.name}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
