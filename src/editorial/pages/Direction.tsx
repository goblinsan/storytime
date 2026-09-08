import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { editorialApi, type UniverseDirectionResponse } from '../api';
import { useAsync } from '../useAsync';
import { ErrorState, LoadingState } from '../components/StateViews';
import Surface from '../components/Surface';

/**
 * What this universe is for, and what agents may do inside it.
 *
 * It was a settings form: three textareas the full width of the page, a
 * fieldset of native radios, and one Save button for all of it. Every field on
 * it is read by an agent before it drafts, which makes this a document that
 * happens to be editable rather than a form that happens to be read -- so it
 * reads first and edits in place, one section at a time, the way a character
 * record does.
 *
 * The guardrails are the clearest case. They are stored as a list, enforced one
 * at a time, and quoted individually in an agent's prompt; editing the third of
 * five inside a textarea was the only shape that made them look like prose.
 */

type Mode = UniverseDirectionResponse['autonomyMode'];

/**
 * The modes, described by what they permit rather than by how they feel.
 *
 * "Assisted" and "Autonomous explore" are adjectives; an author deciding
 * between them needs to know which one lets something change canon while they
 * are not looking.
 */
const AUTONOMY: Array<{ key: Mode; label: string; permits: string }> = [
  {
    key: 'manual',
    label: 'Manual',
    permits: 'Nothing is generated unless you ask. A request you file waits until you run an agent yourself.',
  },
  {
    key: 'assisted',
    label: 'Assisted',
    permits: 'Agents answer when asked, and every answer is a draft. Nothing enters canon until you accept it.',
  },
  {
    key: 'autonomous_explore',
    label: 'Autonomous explore',
    permits: 'Agents write unprotected records straight into canon, with nobody reading them first. Protected records still wait for you.',
  },
];

/**
 * One field of the direction, read until somebody edits it.
 *
 * The editor takes the section's own place rather than opening elsewhere, and
 * carries a measure: these are paragraphs, and a textarea 1232px wide sets
 * about 160 characters to the line.
 */
function Field({
  label, hint, value, placeholder, onSave,
}: {
  label: string;
  hint: string;
  value: string;
  placeholder: string;
  onSave: (next: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (editing) box.current?.focus(); }, [editing]);

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
    <section className="editorial-band">
      <div className="editorial-section-header">
        <h2 className="editorial-section-title">{label}</h2>
        {!editing && (
          <button type="button" className="editorial-link" onClick={() => { setDraft(value); setEditing(true); }}>
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="editorial-field__editor">
          <label className="editorial-field__hint" htmlFor={`direction-${label}`}>{hint}</label>
          <textarea
            id={`direction-${label}`}
            ref={box}
            className="editorial-field__input"
            rows={5}
            value={draft}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }}
          />
          <div className="editorial-field__actions">
            <button type="button" className="editorial-button editorial-button--secondary" disabled={busy} onClick={commit}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="editorial-link" onClick={() => setEditing(false)}>Cancel</button>
          </div>
          {failed && <span className="editorial-field__failed" role="alert">{failed}</span>}
        </div>
      ) : (
        <p className={value.trim() ? 'editorial-direction__prose' : 'editorial-direction__absent'}>
          {value.trim() || hint}
        </p>
      )}
    </section>
  );
}

/**
 * The guardrails, as the list they are.
 *
 * Each one is a prohibition an agent is held to, so each one is its own row
 * with its own way out. The text box is still here behind "Edit all as text",
 * because pasting five rules or rewriting the set wholesale is a real thing to
 * want and rows are a poor shape for it.
 */
function Guardrails({
  rules, onSave,
}: {
  rules: string[];
  onSave: (next: string[]) => Promise<void>;
}) {
  const [adding, setAdding] = useState('');
  const [bulk, setBulk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const write = async (next: string[]) => {
    setBusy(true);
    setFailed(null);
    try {
      await onSave(next);
      return true;
    } catch (e) {
      setFailed(`Not saved: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    } finally { setBusy(false); }
  };

  return (
    <section className="editorial-band">
      <div className="editorial-section-header">
        <h2 className="editorial-section-title">Guardrails</h2>
        <button
          type="button"
          className="editorial-link"
          onClick={() => setBulk(bulk === null ? rules.join('\n') : null)}
        >
          {bulk === null ? 'Edit all as text' : 'Back to rules'}
        </button>
      </div>

      {bulk === null ? (
        <>
          {rules.length === 0 ? (
            <p className="editorial-direction__absent">
              None yet. A guardrail is something nothing writing into this universe may do, and
              agents are held to it before they draft.
            </p>
          ) : (
            <ol className="editorial-rules">
              {rules.map((rule, i) => (
                <li className="editorial-rule" key={rule}>
                  <span className="editorial-rule__text">{rule}</span>
                  <button
                    type="button"
                    className="editorial-link editorial-link--discard"
                    disabled={busy}
                    onClick={() => write(rules.filter((_, at) => at !== i))}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ol>
          )}

          <div className="editorial-field__actions">
            <input
              className="editorial-field__input editorial-rule__new"
              value={adding}
              placeholder="Do not resolve the central mystery."
              aria-label="A new guardrail"
              onChange={(e) => setAdding(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key !== 'Enter' || !adding.trim()) return;
                e.preventDefault();
                if (await write([...rules, adding.trim()])) setAdding('');
              }}
            />
            <button
              type="button"
              className="editorial-button editorial-button--secondary"
              disabled={busy || !adding.trim()}
              onClick={async () => { if (await write([...rules, adding.trim()])) setAdding(''); }}
            >
              Add
            </button>
          </div>
        </>
      ) : (
        <div className="editorial-field__editor">
          <label className="editorial-field__hint" htmlFor="guardrails-bulk">One per line.</label>
          <textarea
            id="guardrails-bulk"
            className="editorial-field__input"
            rows={8}
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
          />
          <div className="editorial-field__actions">
            <button
              type="button"
              className="editorial-button editorial-button--secondary"
              disabled={busy}
              onClick={async () => {
                const next = bulk.split('\n').map((g) => g.trim()).filter(Boolean);
                if (await write(next)) setBulk(null);
              }}
            >
              {busy ? 'Saving…' : 'Save all'}
            </button>
            <button type="button" className="editorial-link" onClick={() => setBulk(null)}>Cancel</button>
          </div>
        </div>
      )}

      {failed && <span className="editorial-field__failed" role="alert">{failed}</span>}
    </section>
  );
}

/**
 * How much an agent may do here without being asked.
 *
 * Not a field among fields: it is the only control on the page that grants
 * authority rather than stating an intention, and until recently it granted
 * nothing because nothing read it. Each mode says what it permits, and the one
 * that lets an agent write canon unread asks before it takes effect -- a radio
 * you can hit with a stray click is the wrong weight for that decision.
 */
function Autonomy({
  mode, onChange,
}: {
  mode: Mode;
  onChange: (next: Mode) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState<Mode | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const apply = async (next: Mode) => {
    setBusy(true);
    setFailed(null);
    try {
      await onChange(next);
      setConfirming(null);
    } catch (e) {
      setFailed(`Not changed: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
  };

  return (
    <section className="editorial-band">
      <div className="editorial-section-header">
        <h2 className="editorial-section-title">What agents may do</h2>
      </div>

      <ul className="editorial-autonomy">
        {AUTONOMY.map((option) => (
          <li className="editorial-autonomy__option" key={option.key} data-current={option.key === mode ? 'true' : undefined}>
            <button
              type="button"
              className="editorial-link editorial-autonomy__choice"
              disabled={busy || option.key === mode}
              aria-pressed={option.key === mode}
              onClick={() => (option.key === 'autonomous_explore' ? setConfirming(option.key) : apply(option.key))}
            >
              {option.label}
            </button>
            <p className="editorial-autonomy__permits">{option.permits}</p>
            {option.key === mode && <span className="editorial-autonomy__mark">In force</span>}
          </li>
        ))}
      </ul>

      {confirming && (
        <div className="editorial-autonomy__confirm" role="alertdialog" aria-label="Allow agents to write canon">
          <p className="editorial-direction__prose">
            Autonomous explore lets an agent write into canon without you reading it first. Records
            you have protected are still left alone. You can change this back at any time, but
            anything already written stays written.
          </p>
          <div className="editorial-field__actions">
            <button type="button" className="editorial-button editorial-button--secondary" disabled={busy} onClick={() => apply(confirming)}>
              {busy ? 'Changing…' : 'Allow it'}
            </button>
            <button type="button" className="editorial-link" onClick={() => setConfirming(null)}>Keep it as it is</button>
          </div>
        </div>
      )}

      {failed && <span className="editorial-field__failed" role="alert">{failed}</span>}
    </section>
  );
}

export default function Direction() {
  const { id: universeId = '' } = useParams();
  const loaded = useAsync((signal) => editorialApi.getDirection(universeId, signal), [universeId]);

  if (loaded.status === 'loading') {
    return <Surface name="direction"><LoadingState label="Reading the direction…" /></Surface>;
  }
  if (loaded.status === 'error') {
    return (
      <Surface name="direction">
        <ErrorState title="Could not load the direction" error={loaded.error} onRetry={loaded.retry} />
      </Surface>
    );
  }

  const { persistentGoal, temporaryFocus, guardrails, autonomyMode } = loaded.data;

  const save = async (patch: Partial<UniverseDirectionResponse>) => {
    await editorialApi.saveDirection(universeId, patch);
    loaded.retry();
  };

  return (
    <Surface name="direction">
      <header className="editorial-masthead">
        <div className="editorial-masthead__line">
          <h1 className="editorial-masthead__title">Direction</h1>
        </div>
        <p className="editorial-direction__standfirst">
          Everything on this page is read by an agent before it writes anything. The direction and
          the focus tell it what this universe is for; the guardrails are what it may not do.
        </p>
      </header>

      {/* Paired, so a section's heading and its text share a column and the
          Edit control lands on the edge of what it edits. Left as full-width
          sections the prose kept its measure while the header spanned the page,
          and Edit floated 700px from the paragraph it opens. */}
      <div className="editorial-pair">
        <Field
          label="Standing direction"
          hint="The through-line this universe is always working toward. It rarely changes."
          value={persistentGoal}
          placeholder="What this universe is always working toward."
          onSave={(next) => save({ persistentGoal: next })}
        />

        <Field
          label="Current focus"
          hint="What matters right now. Change this often; the standing direction rarely."
          value={temporaryFocus}
          placeholder="What matters right now."
          onSave={(next) => save({ temporaryFocus: next })}
        />
      </div>

      <div className="editorial-pair">
        <Guardrails rules={guardrails} onSave={(next) => save({ guardrails: next })} />

        <Autonomy mode={autonomyMode} onChange={(next) => save({ autonomyMode: next })} />
      </div>
    </Surface>
  );
}
