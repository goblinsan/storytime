import { useState, type ReactNode } from 'react';
import { CanonField, CanonListField } from './CanonField';

/**
 * A record, in the parts it is actually made of.
 *
 * Every surface had grown a flat run of fields -- nine on a character, seven
 * on a group -- and a flat run has no shape to skim. One faction's record ran
 * to 2884 pixels in a pane 731 tall, so the only way to find how it pays for
 * itself was to scroll past what it believes.
 *
 * Sections give it joints. They are the same idea on every surface, which is
 * the point: the parts are named differently because a place is not a person,
 * but the behavior, the disclosure control and the summary are one component,
 * so a reader who learns the record on one tab has learned it on all of them.
 *
 * WHAT IS OPEN WHEN YOU ARRIVE
 * A section holding anything is open; a section that is entirely blank starts
 * closed. Written canon is never hidden -- collapsing prose somebody wrote is
 * how a record starts looking emptier than it is -- while the parts nobody has
 * filled in fold down to one line that says so. That line is the whole reason
 * this is safe: a closed section still reports what it holds, so nothing is
 * concealed, only deferred.
 */

export interface RecordSpec {
  key: string;
  label: string;
  hint: string;
  /** Held as a list of short phrases rather than a paragraph. */
  list?: boolean;
}

export interface RecordGroup {
  title: string;
  keys: string[];
}

/**
 * One collapsible part of a record.
 *
 * Presentational and unopinionated about what is inside it, because the cast
 * fills its sections differently from every other surface: it keeps what is
 * written apart from what is missing, and that is a deliberate arrangement
 * rather than a thing to unify away.
 */
export function Section({
  title, written, total, defaultOpen, children,
}: {
  title: string;
  written: number;
  total: number;
  /** Overrides the "open when it holds something" rule. */
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? written > 0);

  // Opens when a reason to be open arrives after the part has mounted -- a
  // draft that starts on a record already on screen. It never closes one:
  // somebody who opened a part keeps it open, and a draft that finishes has
  // usually just filled it with something to read.
  //
  // Adjusted during render rather than in an effect. An effect that sets state
  // renders the part shut first and open a frame later, which is a flicker on
  // exactly the part somebody is watching for their draft to appear in.
  const [wasAsked, setWasAsked] = useState(Boolean(defaultOpen));
  if (Boolean(defaultOpen) !== wasAsked) {
    setWasAsked(Boolean(defaultOpen));
    if (defaultOpen) setOpen(true);
  }

  return (
    <details
      className="editorial-recordpart"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="editorial-recordpart__head">
        <span className="editorial-recordpart__title">{title}</span>
        <span className="editorial-recordpart__count">
          {written === 0
            ? 'nothing written yet'
            : written === total
              ? `all ${total} written`
              : `${written} of ${total} written`}
        </span>
      </summary>
      <div className="editorial-recordpart__body">{children}</div>
    </details>
  );
}

/**
 * The whole record, as sections of fields.
 *
 * Used by every surface whose fields are read and written in place. The caller
 * says what the groups are and how to read a value; everything else -- the
 * counting, the disclosure, which editor a field gets -- is decided here so it
 * cannot drift between tabs.
 *
 * Mount it with `key={record.id}`: the open sections are computed from what
 * the record holds, and without a remount the second record you open inherits
 * the first one's disclosure.
 */
export default function RecordSections({
  name, specs, groups, valueOf, drafting, onSave, onCollaborate,
}: {
  /** Distinguishes this record's fields from another's for label targeting. */
  name: string;
  specs: RecordSpec[];
  groups: RecordGroup[];
  valueOf: (key: string) => string | string[];
  drafting: Set<string>;
  onSave: (key: string, value: string | string[]) => Promise<void>;
  onCollaborate: (keys: string[]) => void;
}) {
  const specOf = (key: string) => specs.find((s) => s.key === key);
  const isWritten = (key: string) => {
    const value = valueOf(key);
    return Array.isArray(value) ? value.length > 0 : Boolean(value.trim());
  };

  // A record with nothing in it at all -- one just created -- opens its first
  // part. Folding is for deferring what you are not working on, and there is
  // nothing to defer: leaving it shut means somebody who has this second
  // written down a name is met by three lines saying nothing is written.
  const blank = !specs.some((spec) => isWritten(spec.key));

  return (
    <div className="editorial-recordparts">
      {groups.map((group, i) => {
        const keys = group.keys.filter(specOf);
        return (
          <Section
            key={group.title}
            title={group.title}
            written={keys.filter(isWritten).length}
            total={keys.length}
            // Open while something is being written into it. A part that
            // folds over its own "Drafting…" is a record that looks idle
            // while five agents are working on it, which is exactly how
            // somebody comes back later to find proposals they were never
            // told had been asked for.
            defaultOpen={
              keys.some((k) => drafting.has(k)) || (blank && i === 0) ? true : undefined
            }
          >
            <div className="editorial-placefields">
              {keys.map((key) => {
                const spec = specOf(key)!;
                const value = valueOf(key);
                return spec.list ? (
                  <CanonListField
                    key={key}
                    name={name}
                    label={spec.label}
                    hint={spec.hint}
                    values={Array.isArray(value) ? value : []}
                    drafting={drafting.has(key)}
                    onCollaborate={() => onCollaborate([key])}
                    onSave={(v) => onSave(key, v)}
                  />
                ) : (
                  <CanonField
                    key={key}
                    name={name}
                    label={spec.label}
                    hint={spec.hint}
                    value={Array.isArray(value) ? value.join(', ') : value}
                    drafting={drafting.has(key)}
                    onCollaborate={() => onCollaborate([key])}
                    onSave={(v) => onSave(key, v)}
                  />
                );
              })}
            </div>
          </Section>
        );
      })}
    </div>
  );
}
