import { useCallback, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  editorialApi, type CanonRequest, type Society, type SocietyInDepth, type SocietyTie,
} from '../api';
import { useAsync, useRefreshWhile } from '../useAsync';
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews';
import Surface from '../components/Surface';
import SurfaceMasthead from '../components/SurfaceMasthead';
import { CanonField, CanonListField } from '../components/CanonField';
import { universeSectionPath } from '../paths';

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

/** What a group's record holds, in reading order. Declared once. */
const SOCIETY_FIELDS: Array<{ key: string; label: string; hint: string; list?: true }> = [
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
 * How a recorded tie reads in a sentence.
 *
 * `active_skirmish` is a column value; "is in an active skirmish with" is what
 * it means. Anything unmapped falls back to its own words with the underscores
 * taken out, so a relationship type added to the database later shows up
 * legibly instead of not at all.
 */
const TIE_WORDS: Record<string, string> = {
  active_skirmish: 'In an active skirmish with',
  cold_war: 'In a cold war with',
  trade_war: 'In a trade war with',
  hostile: 'Hostile to',
  feud: 'In a feud with',
  uneasy_alliance: 'In an uneasy alliance with',
  protective_bond: 'Protects',
  allied: 'Allied with',
};

const tieWords = (kind: string) => TIE_WORDS[kind]
  ?? kind.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/**
 * Who a group is up against, read from the graph.
 *
 * Grouped by what the tie is rather than listed flat: "three active skirmishes"
 * is the fact about a cartel, and a flat list of five names in edge order does
 * not say it. The far end links to wherever that record actually lives, which
 * is this same surface for another group and the cast for a person.
 */
function Ties({ ties, universeId, onOpen }: {
  ties: SocietyTie[];
  universeId: string;
  onOpen: (id: string) => void;
}) {
  const grouped = useMemo(() => {
    const byKind = new Map<string, SocietyTie[]>();
    for (const tie of ties) {
      if (!byKind.has(tie.kind)) byKind.set(tie.kind, []);
      byKind.get(tie.kind)!.push(tie);
    }
    return [...byKind.entries()];
  }, [ties]);

  if (ties.length === 0) {
    return (
      <p className="editorial-rail__note">
        {'Nothing recorded. Ties are kept as relationships between records rather than '
          + 'written into the text here, so this stays true when the other side changes.'}
      </p>
    );
  }

  return (
    <ul className="editorial-ties">
      {grouped.map(([kind, rows]) => (
        <li className="editorial-ties__group" key={kind}>
          <span className="editorial-ties__kind">{tieWords(kind)}</span>
          {/* One row per tie rather than a comma-joined run. The notes are
              whole paragraphs, and two of them separated by a comma reads as
              one sentence that has lost its way. */}
          <span className="editorial-ties__who">
            {rows.map((tie) => (
              <span className="editorial-ties__one" key={tie.id}>
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
                {tie.notes && <span className="editorial-ties__note">{tie.notes}</span>}
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
    if (!factionId) return;
    setSaid(null);
    try {
      // One request per field, for the same reason the other records ask that
      // way: several fields in one answer come back as one field.
      for (const field of fields) {
        await editorialApi.askForSocietyCanon(universeId, factionId, [field]);
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
      <div className="editorial-family-workspace">
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

          <div className="editorial-pane editorial-pane--record">
            {open.data ? (
              <Detail
                universeId={universeId}
                depth={open.data}
                drafting={drafting}
                asking={asking}
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
  universeId, depth, drafting, asking, requests,
  onOpen, onAskCanon, onAskPicture, onChanged, onSaid,
}: {
  universeId: string;
  depth: SocietyInDepth;
  drafting: Set<string>;
  asking: boolean;
  requests: CanonRequest[];
  onOpen: (id: string) => void;
  onAskCanon: (fields: string[]) => Promise<void>;
  onAskPicture: () => Promise<void>;
  onChanged: () => void;
  onSaid: (s: string) => void;
}) {
  const { faction, ties, pictures } = depth;
  const [busy, setBusy] = useState(false);

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
        <h2 className="editorial-section-title">{faction.name || 'Unnamed'}</h2>
        <div className="editorial-section-header__actions">
          <button
            type="button"
            className="editorial-button editorial-button--secondary"
            disabled={drafting.size > 0}
            onClick={() => onAskCanon(SOCIETY_FIELDS.map((f) => f.key))}
          >
            {drafting.size > 0 ? 'Drafting…' : 'Collaborate'}
          </button>
          <button type="button" className="editorial-link" disabled={asking} onClick={onAskPicture}>
            {asking ? 'Drawing…' : 'Ask for a crest'}
          </button>
        </div>
      </div>

      <p className="editorial-rail__note">
        {[
          ties.length ? `${ties.length} recorded tie${ties.length > 1 ? 's' : ''}` : 'No recorded ties',
          faction.isProtected ? 'protected from automated changes' : null,
        ].filter(Boolean).join(' · ')}
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
        <div className="editorial-section-header">
          <h3 className="editorial-section-title">The record</h3>
        </div>
        <div className="editorial-placefields">
          {SOCIETY_FIELDS.map((spec) => (spec.list ? (
            <CanonListField
              key={spec.key}
              name="society"
              label={spec.label}
              hint={spec.hint}
              values={faction.goals ?? []}
              drafting={drafting.has(spec.key)}
              onCollaborate={() => onAskCanon([spec.key])}
              onSave={(v) => save(spec.key, v)}
            />
          ) : (
            <CanonField
              key={spec.key}
              name="society"
              label={spec.label}
              hint={spec.hint}
              value={String((faction as unknown as Record<string, unknown>)[spec.key] ?? '')}
              drafting={drafting.has(spec.key)}
              onCollaborate={() => onAskCanon([spec.key])}
              onSave={(v) => save(spec.key, v)}
            />
          )))}
        </div>
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

      <section className="editorial-band">
        <div className="editorial-section-header">
          <h3 className="editorial-section-title">Who it is up against</h3>
        </div>
        <Ties ties={ties} universeId={universeId} onOpen={onOpen} />
      </section>
    </>
  );
}
