import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  editorialApi, type CanonRequest, type Society, type SocietyInDepth, type SocietyTie,
} from '../api';
import { useAsync, useRefreshWhile } from '../useAsync';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import Surface from '../components/Surface';
import SurfaceMasthead from '../components/SurfaceMasthead';
import RecordSections, { type RecordGroup, type RecordSpec } from '../components/RecordSections';
import { universeSectionPath } from '../paths';
import BackToList from '../components/BackToList';
import NewRecord from '../components/NewRecord';

/**
 * Who holds power here, and who they hold it against.
 *
 * Everything below the name was already recorded and none of it was shown. A
 * faction row carried a truncated description and three fragments of other
 * fields jammed into one grey line, while what the group wants, believes, can
 * build and lives off sat in columns nothing read.
 *
 * WHO THEY ARE UP AGAINST IS NOT PROSE
 * The rivalries are edges in `canon_relationships` -- active skirmishes, cold
 * wars, a trade war, feuds with named people -- and until now the application
 * had never displayed a single one of them. They are shown here as the graph
 * holds them, from whichever end this group sits on, and they are not copied
 * into any text field: two written copies of one fact eventually disagree, and
 * then nobody knows which is canon.
 *
 * WHERE RELIGION IS
 * There is a `religions` table. It holds no rows, in any universe, and never
 * has. What a group believes and tells its own people is its doctrine, which
 * is a field on the group itself, so that is where the creed is written and
 * that is the field the agent is asked about. A faith that outgrows one group
 * -- held across several, or by none -- is a record of its own, and gets a
 * surface of its own on the day something is written in it.
 */

/**
 * The parts a group's record is made of.
 *
 * What it is and where it came from is one question; what it is trying to do
 * is another; what it can actually bring to bear is a third. Somebody checking
 * whether a cartel could blockade a rim world wants the last of those and
 * should not have to read its creed to reach it.
 */
const SOCIETY_PARTS: RecordGroup[] = [
  { title: 'What it is', keys: ['description', 'history'] },
  { title: 'What it wants', keys: ['goals', 'doctrine'] },
  { title: 'What it can do', keys: ['technology', 'economy', 'structure'] },
];

/** What a group's record holds. Declared once, arranged by the parts above. */
const SOCIETY_FIELDS: RecordSpec[] = [
  {
    key: 'description',
    label: 'What it is',
    hint: 'The group in two or three sentences, as somebody would introduce it.',
  },
  {
    key: 'history',
    label: 'How it came to be',
    hint: 'Where it started, what changed it, and what it lost on the way.',
  },
  {
    key: 'goals',
    label: 'What it wants',
    list: true,
    hint: 'Ends rather than methods.',
  },
  {
    key: 'doctrine',
    label: 'What it believes',
    hint: 'Its creed, and what it tells its own people. A faith, an ideology, or a '
      + 'business principle held with the fervor of one.',
  },
  {
    key: 'technology',
    label: 'What it can build',
    hint: 'What it has that others do not, and what that lets it do. The difference '
      + 'between a rival and a threat.',
  },
  {
    key: 'economy',
    label: 'How it pays for itself',
    hint: 'What it sells, controls or extracts, and who depends on it.',
  },
  {
    key: 'structure',
    label: 'Who decides',
    hint: 'Who holds the decision, and how somebody comes to be the one holding it.',
  },
];

/**
 * Who a group stands with or against, read from the graph.
 *
 * Grouped by what the tie is rather than listed flat: "three open conflicts"
 * is the fact about a cartel, and five names in edge order does not say it.
 * The far end links to wherever that record lives -- this same surface for
 * another group, the cast for a person.
 *
 * The phrasing and the direction both come from the server, which knows which
 * end of the edge this group sits on. A `protective_bond` read from the wrong
 * end says a group protects the one protecting it.
 */
function Ties({ ties, universeId, onOpen, absent }: {
  ties: SocietyTie[];
  universeId: string;
  onOpen: (id: string) => void;
  absent: string;
}) {
  const grouped = useMemo(() => {
    const byReading = new Map<string, SocietyTie[]>();
    for (const tie of ties) {
      if (!byReading.has(tie.reads)) byReading.set(tie.reads, []);
      byReading.get(tie.reads)!.push(tie);
    }
    return [...byReading.entries()];
  }, [ties]);

  if (ties.length === 0) return <p className="editorial-rail__note">{absent}</p>;

  return (
    <ul className="editorial-entrygroup">
      {grouped.map(([reads, rows]) => (
        <li className="editorial-entrygroup__group" key={reads}>
          <span className="editorial-entrygroup__kind">{reads}</span>
          {/* One row per tie rather than a comma-joined run. The notes are
              whole paragraphs, and two of them separated by a comma reads as
              one sentence that has lost its way. */}
          <span className="editorial-entrygroup__who">
            {rows.map((tie) => (
              <span className="editorial-entrygroup__one" key={tie.id}>
                {tie.otherType === 'faction' ? (
                  <button
                    type="button"
                    className="editorial-link"
                    onClick={() => onOpen(tie.otherId)}
                  >
                    {tie.otherName}
                  </button>
                ) : tie.otherType === 'character' ? (
                  <Link
                    className="editorial-link"
                    to={`${universeSectionPath(universeId, 'characters')}?open=${encodeURIComponent(tie.otherId)}`}
                  >
                    {tie.otherName}
                  </Link>
                ) : (
                  <span>{tie.otherName}</span>
                )}
                {tie.notes && <span className="editorial-entrygroup__note">{tie.notes}</span>}
              </span>
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function Societies() {
  const { id: universeId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const openId = params.get('open');
  const [said, setSaid] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  /** A request is in flight. `drafting` cannot say so: it only knows what the
      last refresh returned, and the refresh happens after the loop ends. */
  const [filing, setFiling] = useState(false);

  const universe = useAsync((s) => editorialApi.getUniverse(universeId, s), [universeId]);
  const index = useAsync((s) => editorialApi.listSocieties(universeId, s), [universeId]);

  const factionId = openId ?? index.data?.factions[0]?.id ?? null;
  const open = useAsync<SocietyInDepth | null>(
    (s) => (factionId ? editorialApi.getSociety(factionId, s) : Promise.resolve(null)),
    [factionId],
  );

  const requests = useAsync((s) => editorialApi.listSocietyRequests(universeId, s), [universeId]);
  const outstanding = useMemo(
    () => (requests.data ?? []).some((r) => !r.payload?.proposed),
    [requests.data],
  );
  useRefreshWhile(outstanding, requests.retry);

  const setOpen = useCallback((id: string) => {
    const merged = new URLSearchParams(params);
    merged.set('open', id);
    setParams(merged);
  }, [params, setParams]);

  const clearOpen = useCallback(() => {
    const merged = new URLSearchParams(params);
    merged.delete('open');
    setParams(merged);
  }, [params, setParams]);

  /**
   * Following a rivalry lands you at the top of the group you chose.
   *
   * The record pane is the scroll container and it keeps its offset across a
   * swap, so clicking a rival from the ties -- 1300px down -- opened the other
   * group 1300px down, mid-record, with nothing on screen naming it. The
   * button that was clicked is also gone by then, which left keyboard focus on
   * the document body and the tab order back at the top of the page.
   */
  const recordPane = useRef<HTMLDivElement>(null);
  const chosenBefore = useRef(false);

  // The offset resets the moment a different group is asked for, so nobody
  // watches the old record scroll past while the new one loads.
  useEffect(() => {
    if (recordPane.current) recordPane.current.scrollTop = 0;
  }, [factionId]);

  // Focus waits for the record to actually exist. Keyed on the id that came
  // BACK rather than the one that was asked for: at the moment of the click
  // the pane still holds the previous group, so focusing then puts the cursor
  // on the heading of the record you just left.
  const loadedId = open.data?.faction.id ?? null;
  useEffect(() => {
    if (!loadedId) return;
    // Not on the first render: arriving at the surface should not take focus
    // away from wherever the reader already is.
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

  /** Fields of this group an agent is already writing. */
  const drafting = useMemo(() => {
    const claimed = new Set<string>();
    for (const row of requests.data ?? []) {
      const p = row.payload as { factionId?: string; fields?: string[] };
      if (row.payload?.proposed || p.factionId !== factionId) continue;
      for (const f of p.fields ?? []) claimed.add(f);
    }
    return claimed;
  }, [requests.data, factionId]);

  const askForCanon = async (fields: string[]) => {
    if (!factionId || filing) return;
    setFiling(true);
    setSaid(null);
    // Counted rather than assumed: these are real agent runs, and a failure
    // on the fourth still leaves three of them running. Reporting only the
    // error would say nothing was asked when most of it was.
    let filed = 0;
    try {
      // One request per field, for the same reason the other records ask that
      // way: several fields in one answer come back as one field.
      for (const field of fields) {
        await editorialApi.askForSocietyCanon(universeId, factionId, [field]);
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
    if (!factionId) return;
    setAsking(true);
    setSaid(null);
    try {
      await editorialApi.askForSocietyPicture(universeId, factionId);
      setSaid('Drawing its mark. Candidates appear with the crests.');
      requests.retry();
    } catch (e) {
      setSaid(`Not asked: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setAsking(false); }
  };

  if (index.status === 'loading') {
    return <Surface name="societies"><LoadingState label="Reading the societies…" /></Surface>;
  }
  if (index.status === 'error') {
    return (
      <Surface name="societies">
        <ErrorState title="Could not load societies" error={index.error} onRetry={index.retry} />
      </Surface>
    );
  }

  const { factions } = index.data;

  if (factions.length === 0) {
    return (
      <Surface name="societies">
        <SurfaceMasthead title={universe.data?.title ?? 'Societies'} />
        <EmptyState
          title="No societies yet"
          description="Groups recorded for this universe will appear here."
        />
      </Surface>
    );
  }

  // How many are entangled, not how many ties there are: a tie between two
  // groups is counted at both ends, so summing tieCount would report nineteen
  // rivalries where there are eleven.
  const entangled = factions.filter((f) => (f.tieCount ?? 0) > 0).length;

  return (
    <Surface name="societies">
      <div className="editorial-family-workspace" data-mobile-view={openId ? 'record' : 'cast'}>
        <SurfaceMasthead
          title={universe.data?.title ?? 'Societies'}
          standfirst={`${factions.length} groups`
            + `${entangled ? `, ${entangled} of them tied to another group or to somebody in the cast` : ''}.`}
          status={said}
        />

        <div className="editorial-panes">
          <div className="editorial-cast-column">
            <div className="editorial-section-header">
              <h2 className="editorial-section-title">The groups</h2>
              <span className="editorial-register__count">{`${factions.length} groups`}</span>
            </div>

            <NewRecord
              label="New group"
              prompt="What is it called?"
              placeholder="The Charnel Compact"
              onCreate={async (name) => (await editorialApi.createSociety(universeId, name)).id}
              onCreated={(id) => { index.retry(); setOpen(id); }}
              onFailed={setSaid}
            />

            <nav className="editorial-pane editorial-pane--cast" aria-label="The groups">
              <ul className="editorial-placelist">
                {factions.map((f: Society) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      className="editorial-button editorial-placelist__row"
                      aria-pressed={f.id === factionId}
                      onClick={() => setOpen(f.id)}
                    >
                      <span className="editorial-placelist__name">{f.name || 'Unnamed'}</span>
                      <span className="editorial-placelist__meta">
                        {[
                          f.tieCount ? `${f.tieCount} tie${f.tieCount > 1 ? 's' : ''}` : null,
                          f.pictureCount ? `${f.pictureCount} crest${f.pictureCount > 1 ? 's' : ''}` : null,
                          f.isProtected ? 'protected' : null,
                        ].filter(Boolean).join(' · ')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          <div className="editorial-pane editorial-pane--record" ref={recordPane}>
            <BackToList label="The groups" onBack={() => clearOpen()} />
            {open.data ? (
              <Detail
                universeId={universeId}
                depth={open.data}
                drafting={drafting}
                asking={asking}
                filing={filing}
                requests={requests.data ?? []}
                onOpen={setOpen}
                onAskCanon={askForCanon}
                onAskPicture={askForPicture}
                onChanged={reload}
                onSaid={setSaid}
              />
            ) : open.status === 'error' ? (
              // Not "nothing chosen": something was chosen and could not be
              // read. Offering an empty pane for a failure sends the reader
              // looking for a selection they already made.
              <ErrorState
                title="Could not read this group"
                error={open.error}
                onRetry={open.retry}
              />
            ) : (
              <EmptyState
                title="Nothing chosen"
                description="Pick a group to read and add to it."
              />
            )}
          </div>
        </div>
      </div>
    </Surface>
  );
}

/**
 * One group, in full.
 *
 * Who it is up against sits under the record rather than above it: the ties
 * only mean something once you know what the group wants, and a reader who
 * opened this to check a rivalry can see the count in the standfirst without
 * reading anything else.
 */
function Detail({
  universeId, depth, drafting, asking, filing, requests,
  onOpen, onAskCanon, onAskPicture, onChanged, onSaid,
}: {
  universeId: string;
  depth: SocietyInDepth;
  drafting: Set<string>;
  asking: boolean;
  filing: boolean;
  requests: CanonRequest[];
  onOpen: (id: string) => void;
  onAskCanon: (fields: string[]) => Promise<void>;
  onAskPicture: () => Promise<void>;
  onChanged: () => void;
  onSaid: (s: string) => void;
}) {
  const { faction, ties, pictures } = depth;
  const [busy, setBusy] = useState(false);
  const tieSection = useRef<HTMLElement>(null);

  const showTies = () => {
    tieSection.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    tieSection.current?.querySelector<HTMLElement>('.editorial-section-title')?.focus();
  };

  const mine = (r: CanonRequest) => (r.payload as { factionId?: string }).factionId === faction.id;
  const drawn = requests.filter(
    (r) => mine(r) && r.payload?.proposed && r.artifactType === 'faction_image_request',
  );
  const proposals = requests.filter(
    (r) => mine(r) && r.payload?.proposed && r.artifactType === 'faction_canon_request',
  );

  const save = async (field: string, value: string | string[]) => {
    await editorialApi.updateSociety(faction.id, { [field]: value });
    onChanged();
  };

  return (
    <>
      <div className="editorial-section-header editorial-place-head">
        <h2 className="editorial-section-title" tabIndex={-1}>{faction.name || 'Unnamed'}</h2>
        <div className="editorial-section-header__actions">
          <button
            type="button"
            className="editorial-button editorial-button--secondary"
            disabled={filing || drafting.size > 0}
            onClick={() => onAskCanon(SOCIETY_FIELDS.map((f) => f.key))}
          >
            {filing ? 'Asking…' : drafting.size > 0 ? 'Drafting…' : 'Collaborate'}
          </button>
          <button type="button" className="editorial-link" disabled={asking} onClick={onAskPicture}>
            {asking ? 'Drawing…' : 'Ask for a crest'}
          </button>
        </div>
      </div>

      {/* The count is a link to what it counts, for the same reason it is one
          on the bestiary: it named a section a screen and a half below it. */}
      <p className="editorial-rail__note">
        <button type="button" className="editorial-link" onClick={showTies}>
          {ties.length ? `${ties.length} recorded tie${ties.length > 1 ? 's' : ''}` : 'No recorded ties'}
        </button>
        {faction.isProtected && ' · protected from automated changes'}
      </p>

      {pictures.length > 0 && (
        <ul className="editorial-placepics">
          {pictures.map((pic) => (
            <li key={pic.id} className="editorial-placepics__item">
              <img src={pic.url} alt={pic.title || `The mark of ${faction.name}`} />
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
                  <img src={url} alt={`A candidate mark for ${faction.name}`} />
                  <figcaption>
                    <button
                      type="button"
                      className="editorial-button editorial-button--secondary"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await editorialApi.keepSocietyPicture(universeId, faction.id, url);
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
          key={faction.id}
          name="society"
          specs={SOCIETY_FIELDS}
          groups={SOCIETY_PARTS}
          valueOf={(k) => (faction as unknown as Record<string, string | string[]>)[k] ?? ''}
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
                  <dt>{SOCIETY_FIELDS.find((f) => f.key === key)?.label ?? key}</dt>
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
                    await editorialApi.updateSociety(faction.id, proposed);
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

      {/* Split, because one heading cannot carry both. "In an uneasy alliance
          with Lord Malakor Vane" filed under "Who it is up against" tells an
          author the politics are the opposite of what the canon records, and
          this is the surface they would check to find out. */}
      <section className="editorial-band" ref={tieSection}>
        <div className="editorial-section-header">
          <h3 className="editorial-section-title" tabIndex={-1}>Who it is up against</h3>
        </div>
        <Ties
          ties={ties.filter((t) => !t.aligned)}
          universeId={universeId}
          onOpen={onOpen}
          absent={'No quarrels recorded. Ties are kept as relationships between records rather '
            + 'than written into the text here, so this stays true when the other side changes.'}
        />
      </section>

      {ties.some((t) => t.aligned) && (
        <section className="editorial-band">
          <div className="editorial-section-header">
            <h3 className="editorial-section-title">Who it stands with</h3>
          </div>
          <Ties ties={ties.filter((t) => t.aligned)} universeId={universeId} onOpen={onOpen} absent="" />
        </section>
      )}
    </>
  );
}
