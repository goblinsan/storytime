import { useEffect, useId, useRef, useState } from 'react';
import { editorialApi, type CollaborateTurn } from '../api';

/** What a Collaborate is about: the record, and which of its fields. */
export interface CollaborateAbout {
  kind: string;
  id: string;
  fields?: string[];
}

/**
 * What goes with the request when the author asks for changes: the
 * conversation they had first, so the proposal follows from it, and what
 * they want now.
 */
const briefFrom = (thread: CollaborateTurn[], now: string) => {
  if (!thread.length) return now;
  const talk = thread.slice(-10)
    .map((t) => `${t.role === 'author' ? 'Author' : 'You'}: ${t.text}`).join('\n');
  return [
    `You and the author talked this over before they asked:\n${talk}`,
    now ? `What they want now: ${now}` : 'Make the changes that conversation settled on.',
  ].join('\n\n').slice(-6000);
};

/**
 * Talking a record over with the agent, and asking it for changes.
 *
 * Every Collaborate asked for changes straight away, with at most a line of
 * instruction. Often what somebody wants first is an answer -- what is known
 * about her mother, whether the war is in this arc, what would fit here --
 * and only then a change. So the panel is a conversation: Ask puts a question
 * and the answer comes back in the panel, as many times as it takes. Propose
 * changes then files the usual request, carrying the conversation as its
 * brief, and what comes back is a proposal to put in force, send back or
 * refuse like any other. Nothing is changed by talking.
 *
 * Without `about` there is nothing to ask a question about, and it is the
 * plain instruction-then-ask panel.
 */
export default function Collaborate({
  onAsk, label = 'Collaborate', variant = 'link', disabled = false, placeholder, about,
}: {
  /** Asks for changes, given the brief: an instruction, or a conversation and one. */
  onAsk: (brief: string) => unknown;
  label?: string;
  variant?: 'link' | 'button';
  disabled?: boolean;
  placeholder?: string;
  about?: CollaborateAbout;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [thread, setThread] = useState<CollaborateTurn[]>([]);
  const [busy, setBusy] = useState<'question' | 'proposal' | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const id = useId();
  const box = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const log = useRef<HTMLOListElement>(null);

  // A click anywhere else closes it. The conversation stays, so reopening it
  // picks up where it was.
  useEffect(() => {
    if (!open) return undefined;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  // The newest turn in view.
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [thread.length, busy]);

  const why = (e: unknown) => (e instanceof Error ? e.message : String(e));

  const close = () => {
    setOpen(false);
    setFailed(null);
    trigger.current?.focus();
  };

  const question = async () => {
    const q = text.trim();
    if (!q || busy || !about) return;
    setBusy('question');
    setFailed(null);
    const asked: CollaborateTurn[] = [...thread, { role: 'author', text: q }];
    setThread(asked);
    setText('');
    try {
      const { answer } = await editorialApi.askAbout({ ...about, thread, question: q });
      setThread([...asked, { role: 'agent', text: answer }]);
    } catch (e) {
      // Put the question back, so a failure costs nothing but a retry.
      setThread(thread);
      setText(q);
      setFailed(`No answer: ${why(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const propose = async () => {
    if (busy) return;
    setBusy('proposal');
    setFailed(null);
    try {
      await onAsk(briefFrom(thread, text.trim()));
      setText('');
      setThread([]);
      setOpen(false);
    } catch (e) {
      setFailed(`Not asked: ${why(e)}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <span className="editorial-collaborate" ref={box}>
      <button
        ref={trigger}
        type="button"
        className={variant === 'button' ? 'editorial-button editorial-button--secondary' : 'editorial-link'}
        disabled={disabled || busy === 'proposal'}
        aria-expanded={open}
        onClick={() => { setFailed(null); setOpen((was) => !was); }}
      >
        {busy === 'proposal' ? 'Asking…' : label}
      </button>
      {open && (
        <form
          className="editorial-collaborate__panel"
          onSubmit={(e) => { e.preventDefault(); void (about ? question() : propose()); }}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}
        >
          {thread.length > 0 && (
            <ol className="editorial-collaborate__thread" ref={log} aria-live="polite">
              {thread.map((turn, i) => (
                <li
                  // A conversation only grows, so a turn's place is its identity.
                  key={i}
                  className={turn.role === 'agent'
                    ? 'editorial-collaborate__turn editorial-collaborate__turn--agent'
                    : 'editorial-collaborate__turn'}
                >
                  <span className="editorial-collaborate__who">{turn.role === 'agent' ? 'The agent' : 'You'}</span>
                  <span className="editorial-collaborate__said">{turn.text}</span>
                </li>
              ))}
              {busy === 'question' && (
                <li className="editorial-collaborate__turn editorial-collaborate__turn--agent">
                  <span className="editorial-collaborate__who">The agent</span>
                  <span className="editorial-collaborate__said">Thinking…</span>
                </li>
              )}
            </ol>
          )}
          <label className="editorial-collaborate__label" htmlFor={id}>
            {about
              ? 'Ask about it, or say what you want changed.'
              : 'Anything to steer it? Optional: it works from the record either way.'}
          </label>
          <textarea
            id={id}
            className="editorial-field__input"
            rows={3}
            autoFocus
            value={text}
            placeholder={placeholder ?? (about
              ? 'Who raised her? Is the war in this at all?'
              : 'Keep it short, and leave the war out of it.')}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void (about ? question() : propose());
              }
            }}
          />
          {failed && <p className="editorial-field__failed" role="alert">{failed}</p>}
          <div className="editorial-field__actions">
            {about && (
              <button
                type="submit"
                className="editorial-button editorial-button--secondary"
                disabled={Boolean(busy) || !text.trim()}
              >
                {busy === 'question' ? 'Asking…' : 'Ask'}
              </button>
            )}
            <button
              type={about ? 'button' : 'submit'}
              className="editorial-button editorial-button--secondary"
              disabled={Boolean(busy)}
              onClick={about ? () => void propose() : undefined}
            >
              {busy === 'proposal' ? 'Asking…' : about ? 'Propose changes' : 'Ask'}
            </button>
            {thread.length > 0 && (
              <button type="button" className="editorial-link" onClick={() => { setThread([]); setFailed(null); }}>
                Start over
              </button>
            )}
            <button type="button" className="editorial-link" onClick={close}>Close</button>
          </div>
          {about && (
            <p className="editorial-collaborate__note">
              Propose changes sends this conversation with the request. What comes back is a
              proposal, to put in force, send back or refuse.
            </p>
          )}
        </form>
      )}
    </span>
  );
}
