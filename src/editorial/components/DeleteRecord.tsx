import { useEffect, useRef, useState } from 'react';

/** Something the person deleting can choose about what else happens. */
export interface DeleteChoice {
  key: string;
  label: string;
  detail?: string;
  /** Whether it starts ticked. */
  on: boolean;
}
import { editorialApi, type RecordKind } from '../api';

/**
 * Deleting something, with what else it takes said first.
 *
 * Nothing on these surfaces could be deleted. The server could delete almost
 * everything and no page asked it to, so a mistaken record -- a character
 * created twice, a draft nobody wants -- stayed for good.
 *
 * It asks before it acts, because it cannot be taken back, and it says what
 * else changes: a place's own places moving up a level, the pictures that stop
 * pointing at anything. "Are you sure?" with nothing after it asks somebody to
 * be sure about something they have not been told.
 */
export default function DeleteRecord({
  what, name, label = 'Delete', consequences, onDelete, onDeleted, onSaid,
}: {
  /** What kind of thing this is, for the button: "draft", "character". */
  what: string;
  /** What it is called, for the question. */
  name: string;
  /** The control before it is opened. */
  label?: string;
  /**
   * What else changes, asked for when the dialog opens. `blocked` says why it
   * cannot be deleted at all -- a protected record -- and the dialog then
   * offers no delete.
   */
  consequences?: () => Promise<string[] | { effects: string[]; blocked?: string; choices?: DeleteChoice[] }>;
  /** Given what was ticked. A string it returns is what is said afterwards. */
  onDelete: (chosen: Record<string, boolean>) => Promise<unknown>;
  onDeleted: () => void;
  onSaid?: (s: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [effects, setEffects] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [choices, setChoices] = useState<DeleteChoice[]>([]);
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  const box = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);

  // showModal, as the New dialog does: the top layer, a focus trap, Escape.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const why = (e: unknown) => (e instanceof Error ? e.message : String(e));

  const show = async () => {
    setError(null);
    setBlocked(null);
    setChoices([]);
    setChosen({});
    setEffects(null);
    setOpen(true);
    if (!consequences) { setEffects([]); return; }
    try {
      const said = await consequences();
      if (Array.isArray(said)) {
        setEffects(said);
      } else {
        setEffects(said.effects);
        setBlocked(said.blocked ?? null);
        setChoices(said.choices ?? []);
        setChosen(Object.fromEntries((said.choices ?? []).map((c) => [c.key, c.on])));
      }
    } catch (e) {
      // Not knowing what else it touches is worth saying; it is not a reason
      // to refuse the delete somebody asked for.
      setEffects([]);
      setError(`Could not check what else it touches: ${why(e)}`);
    }
  };

  const close = () => {
    setOpen(false);
    opener.current?.focus();
  };

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const said = await onDelete(chosen);
      setOpen(false);
      onSaid?.(typeof said === 'string' ? said : `Deleted ${name}.`);
      onDeleted();
    } catch (e) {
      setError(`Not deleted: ${why(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        ref={opener}
        type="button"
        className="editorial-link editorial-link--discard"
        onClick={() => void show()}
      >
        {label}
      </button>

      <dialog
        ref={box}
        className="editorial-newrecord"
        aria-label={`Delete ${name}`}
        onClose={close}
        onCancel={close}
      >
        <div className="editorial-newrecord__form">
          <p className="editorial-newrecord__lead">{`Delete ${name}?`}</p>
          {effects === null ? (
            <p className="editorial-rail__note">Checking what else it touches…</p>
          ) : effects.length > 0 && (
            <ul className="editorial-deleterecord__effects">
              {effects.map((effect) => <li key={effect}>{effect}</li>)}
            </ul>
          )}
          {!blocked && choices.length > 0 && (
            <div className="editorial-deleterecord__choices">
              {choices.map((choice) => (
                <label key={choice.key} className="editorial-deleterecord__choice">
                  <input
                    type="checkbox"
                    className="editorial-deleterecord__tick"
                    checked={Boolean(chosen[choice.key])}
                    onChange={(e) => setChosen((c) => ({ ...c, [choice.key]: e.target.checked }))}
                  />
                  <span className="editorial-deleterecord__choice-text">
                    <span className="editorial-deleterecord__choice-label">{choice.label}</span>
                    {choice.detail && <span className="editorial-deleterecord__choice-detail">{choice.detail}</span>}
                  </span>
                </label>
              ))}
            </div>
          )}
          {blocked
            ? <p className="editorial-field__failed" role="alert">{blocked}</p>
            : <p className="editorial-rail__note">This cannot be undone.</p>}
          {error && <p className="editorial-field__failed" role="alert">{error}</p>}
          <div className="editorial-field__actions">
            <button
              type="button"
              className="editorial-button editorial-button--danger"
              disabled={busy || effects === null || Boolean(blocked)}
              onClick={() => void confirm()}
            >
              {busy ? 'Deleting…' : `Delete this ${what}`}
            </button>
            <button type="button" className="editorial-link" onClick={close}>Keep it</button>
          </div>
        </div>
      </dialog>
    </>
  );
}

/**
 * Delete for a record: the server says what else it takes, refuses what is
 * protected, and tidies what pointed at it. The one control every record
 * surface shows.
 */
export function DeleteCanon({
  kind, id, what, name, label, onDeleted, onSaid,
}: {
  kind: RecordKind;
  id: string;
  what: string;
  name: string;
  label?: string;
  onDeleted: () => void;
  onSaid?: (s: string) => void;
}) {
  return (
    <DeleteRecord
      what={what}
      name={name}
      label={label}
      consequences={async () => {
        const said = await editorialApi.recordConsequences(kind, id);
        const choices: DeleteChoice[] = [];
        if (said.pictures > 0) {
          choices.push({
            key: 'pictures',
            label: said.pictures === 1 ? 'Delete its picture as well' : `Delete its ${said.pictures} pictures as well`,
            detail: `Otherwise ${said.pictures === 1 ? 'it stays' : 'they stay'} in Media, linked to nothing.`,
            on: false,
          });
        }
        if (said.mentions.length > 0) {
          const n = said.mentions.length;
          const them = kind === 'character' ? 'them' : 'it';
          choices.push({
            key: 'tidy',
            label: n === 1
              ? `Have the agent tidy the record that mentions ${them}`
              : `Have the agent tidy the ${n} records that mention ${them}`,
            detail: `${listed(said.mentions.map((m) => m.name))}. Each mention is removed or rewritten as a `
              + 'proposal on that record, to put in force, send back or refuse. Nothing changes until you do.',
            on: true,
          });
        }
        return {
          effects: said.effects,
          choices,
          blocked: said.protected
            ? `${said.name} is protected from changes and cannot be deleted. Lift the protection first.`
            : undefined,
        };
      }}
      onDelete={async (chosen) => {
        const done = await editorialApi.deleteRecord(kind, id, {
          pictures: chosen.pictures, tidy: chosen.tidy,
        });
        return [
          `Deleted ${done.name}.`,
          done.picturesDeleted ? `${done.picturesDeleted === 1 ? 'Its picture' : `Its ${done.picturesDeleted} pictures`} went with it.` : '',
          done.tidied.length ? `Asked the agent to tidy ${listed(done.tidied)}; the proposals arrive on each.` : '',
        ].filter(Boolean).join(' ');
      }}
      onDeleted={onDeleted}
      onSaid={onSaid}
    />
  );
}

/** "A, B and 3 more" -- enough names to recognize, not a wall of them. */
function listed(names: string[]) {
  if (names.length <= 1) return names.join('');
  const shown = names.slice(0, 4);
  const rest = names.length - shown.length;
  return rest > 0
    ? `${shown.join(', ')} and ${rest} more`
    : `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
}
