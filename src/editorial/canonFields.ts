import type { CanonRow } from './api';

/**
 * Canon rows come straight from the database, so a field may be camelCase, or
 * snake_case, or absent. These read the first key that actually holds text.
 */
export const text = (row: CanonRow, ...keys: string[]): string => {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value;
    // Years arrive as integers. Returning '' for them silently dropped the
    // active timeframe from all 66 characters in a product about chronology.
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
};

export const isProtected = (row: CanonRow): boolean =>
  row.isProtected === true || row.is_protected === true;

/**
 * The canon a character record can carry, and how each field reads.
 *
 * Kept beside the other row readers rather than in the component that renders
 * them: which fields exist is a fact about the data, and a second surface that
 * wanted to know what is missing should not have to import a panel to find out.
 */
export type FieldKind = 'prose' | 'list';

export interface FieldSpec {
  key: string;
  label: string;
  kind: FieldKind;
  /** What this field is for, shown while editing it. */
  hint: string;
}

/**
 * In reading order, not schema order: who they are, then what drives them,
 * then what they can do. `description` sits with the background because the
 * seed wrote the same sentence into both on most records.
 */
export const CANON_FIELDS: FieldSpec[] = [
  { key: 'background', label: 'History', kind: 'prose', hint: 'Where they came from and what happened to them.' },
  {
    key: 'description',
    label: 'Bearing',
    kind: 'prose',
    // "In person" until it sat next to Appearance, where the two read as
    // synonyms and nobody could tell which one held what -- so the physical
    // facts kept being written here, and the pictures kept being drawn from
    // the wrong field. This one is the impression, not the look.
    hint: 'How they carry themselves: manner, presence, the impression they leave.',
  },
  {
    key: 'appearance',
    label: 'Appearance',
    kind: 'prose',
    // Written as a list of physical facts because this is what gets drawn, and
    // a picture cannot use "carries himself like a man who has lost something".
    hint: 'The physical facts, listed. Build, face, hair, dress, what they carry.',
  },
  { key: 'motivation', label: 'Wants', kind: 'prose', hint: 'What they are trying to get, in their own terms.' },
  { key: 'tendencies', label: 'Tends to', kind: 'prose', hint: 'How they behave under pressure, not their virtues.' },
  { key: 'traits', label: 'Traits', kind: 'list', hint: 'A few words each, separated by commas.' },
  { key: 'coreSkills', label: 'Core skills', kind: 'list', hint: 'What they are good at, separated by commas.' },
  { key: 'specialAbilities', label: 'Abilities', kind: 'list', hint: 'Anything they can do that others cannot.' },
  { key: 'notableMoments', label: 'Notable moments', kind: 'list', hint: 'One line per moment, separated by commas.' },
];

const asList = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch { /* a plain string is one entry */ }
    return [value];
  }
  return [];
};

export const readField = (person: CanonRow, spec: FieldSpec): string[] | string => {
  const raw = (person as unknown as Record<string, unknown>)[spec.key];
  if (spec.kind === 'list') return asList(raw);
  return typeof raw === 'string' ? raw.trim() : '';
};

export const isEmpty = (person: CanonRow, spec: FieldSpec) => {
  const value = readField(person, spec);
  return Array.isArray(value) ? value.length === 0 : value === '';
};

/** The fields with nothing in them, in reading order. */
export const gapsIn = (person: CanonRow) => CANON_FIELDS.filter((spec) => isEmpty(person, spec));

/**
 * The parts a person's record is made of.
 *
 * Not a new arrangement: the field order above was already described as "who
 * they are, then what drives them, then what they can do", and this is that
 * sentence written down where a surface can read it. Naming the parts is what
 * lets the cast fold them, the same way every other record folds.
 */
export const CANON_PARTS: Array<{ title: string; keys: string[] }> = [
  { title: 'Who they are', keys: ['background', 'description', 'appearance'] },
  { title: 'What drives them', keys: ['motivation', 'tendencies', 'traits'] },
  { title: 'What they can do', keys: ['coreSkills', 'specialAbilities', 'notableMoments'] },
];
