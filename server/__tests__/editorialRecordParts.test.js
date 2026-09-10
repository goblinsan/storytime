/**
 * One record, folded the same way everywhere.
 *
 * A record is read by parts on every surface that has one, and the parts are
 * named per surface because a place is not a person. What must NOT vary is the
 * mechanism: the disclosure control, what a closed part says it holds, and the
 * rule for what is open when you arrive.
 *
 * The failure this stops is the one the owner has already had to report twice:
 * a fifth surface hand-rolls a `<details>`, picks a slightly different marker
 * or a slightly different default, and moving between tabs stops feeling like
 * one application. It is the same lesson as the masthead and the record field,
 * and it earns a check for the same reason -- a convention nobody enforces is
 * how the last two drifted.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const editorial = path.join(here, '..', '..', 'src', 'editorial');
const SECTIONS = path.join(editorial, 'components', 'RecordSections.tsx');

const sources = (dir) => readdirSync(dir)
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => ({ file: f, src: readFileSync(path.join(dir, f), 'utf8') }));

/** Every surface that has a record to fold, and what it folds it with. */
const SURFACES = [
  ['pages/Societies.tsx', 'RecordSections'],
  ['pages/Timeline.tsx', 'RecordSections'],
  ['pages/Geography.tsx', 'RecordSections'],
  // The cast keeps what is written apart from what is missing, so it fills its
  // own parts and uses the shared shell rather than the shared driver.
  ['components/RecordFields.tsx', 'Section'],
];

describe('one way to fold a record', () => {
  it('has somewhere for the mechanism to live', () => {
    // Without this the checks below pass by matching nothing, which is how a
    // guard reports success for a rule it never looked at.
    const src = readFileSync(SECTIONS, 'utf8');
    expect(src).toMatch(/className="editorial-recordpart"/);
    expect(src).toMatch(/editorial-recordpart__count/);
    expect(src).toMatch(/export function Section\b/);
    expect(src).toMatch(/export default function RecordSections\b/);
  });

  it('is the only place that writes the disclosure markup', () => {
    const offenders = [...sources(path.join(editorial, 'pages')),
      ...sources(path.join(editorial, 'components'))]
      .filter((p) => p.file !== 'RecordSections.tsx')
      .filter((p) => /className="editorial-recordpart(__|")/.test(p.src))
      .map((p) => p.file);
    expect(
      offenders,
      `${offenders.join(', ')} writes the record disclosure itself. Use Section `
        + 'from src/editorial/components/RecordSections.tsx.',
    ).toEqual([]);
  });

  it('is what every surface with a record actually folds with', () => {
    for (const [file, used] of SURFACES) {
      const src = readFileSync(path.join(editorial, file), 'utf8');
      expect(src, `${file} no longer imports the shared sections`)
        .toMatch(/from '\.\.?\/components\/RecordSections'|from '\.\/RecordSections'/);
      expect(src, `${file} imports the sections but renders none`)
        .toMatch(new RegExp(`<${used}[\\s>]`));
    }
  });

  it('names the parts of every record exactly once', () => {
    // A surface that declares its groups inline is a surface whose parts
    // cannot be read by anything else -- including the next person deciding
    // whether a new field belongs to one.
    const declared = [
      ['pages/Societies.tsx', 'SOCIETY_PARTS'],
      ['pages/Timeline.tsx', 'EVENT_PARTS'],
      ['pages/Geography.tsx', 'PLACE_PARTS'],
    ];
    for (const [file, name] of declared) {
      const src = readFileSync(path.join(editorial, file), 'utf8');
      expect(src, `${file} does not declare ${name}`)
        .toMatch(new RegExp(`const ${name}: RecordGroup\\[\\] = \\[`));
    }
    expect(readFileSync(path.join(editorial, 'canonFields.ts'), 'utf8'))
      .toMatch(/export const CANON_PARTS/);
  });
});
