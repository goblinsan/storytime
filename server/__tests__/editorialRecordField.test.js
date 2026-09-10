/**
 * One record field, shared, not one per surface.
 *
 * Geography and Timeline each declared a local `Field`. They were the same
 * component down to the whitespace apart from the prefix on a label's `htmlFor`
 * -- and they had already drifted, one setting the textarea to four rows and
 * the other to five. Societies was about to be the third copy.
 *
 * That drift is what "every tab looks different" is made of. Nobody decided
 * that a place's fields should be shorter than an event's; a copy was made,
 * one side was adjusted, and the other never heard about it.
 *
 * So the markup lives in CanonField and a surface that writes it again fails
 * the build. Direction is exempt by shape rather than by name: its fields are
 * whole bands with `h2` heads, not rows in a record panel, and it uses none of
 * this markup.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const pagesDir = path.join(here, '..', '..', 'src', 'editorial', 'pages');
const componentsDir = path.join(here, '..', '..', 'src', 'editorial', 'components');
const FIELD = path.join(componentsDir, 'CanonField.tsx');

const pages = () => readdirSync(pagesDir)
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => ({ file: f, src: readFileSync(path.join(pagesDir, f), 'utf8') }));

describe('one record field', () => {
  it('has somewhere for the markup to live', () => {
    // Without this the check below passes by matching nothing, which is how a
    // guard reports success for a rule it never looked at.
    const src = readFileSync(FIELD, 'utf8');
    expect(src).toMatch(/className="editorial-placefield__head"/);
    expect(src).toMatch(/className="editorial-placefield__editor"/);
    expect(src).toMatch(/export function CanonField\b/);
    expect(src).toMatch(/export function CanonListField\b/);
  });

  it('is the only place that writes the record field markup', () => {
    const offenders = pages()
      .filter((p) => /className="editorial-placefield(__|")/.test(p.src))
      .map((p) => p.file);
    expect(
      offenders,
      `${offenders.join(', ')} writes the record field markup itself. Use `
        + 'CanonField from src/editorial/components/CanonField.tsx.',
    ).toEqual([]);
  });

  it('is what the surfaces with record panels actually reach', () => {
    // The rule above can be satisfied by a page that renders no fields at all.
    // These three have records, so they have to be reading them from here --
    // now by way of RecordSections, which owns the folding and drives the
    // fields. Reaching the field THROUGH the sections is the arrangement; a
    // page that went back to rendering CanonField itself would be a page that
    // no longer folds like the others.
    const driver = readFileSync(
      path.join(componentsDir, 'RecordSections.tsx'), 'utf8',
    );
    expect(driver, 'the sections no longer drive the shared field')
      .toMatch(/from '\.\/CanonField'/);
    expect(driver).toMatch(/<CanonField/);
    expect(driver).toMatch(/<CanonListField/);

    for (const file of ['Geography.tsx', 'Timeline.tsx', 'Societies.tsx']) {
      const src = readFileSync(path.join(pagesDir, file), 'utf8');
      expect(src, `${file} no longer renders a record`)
        .toMatch(/from '\.\.\/components\/RecordSections'/);
      expect(src, `${file} imports the sections but renders none`)
        .toMatch(/<RecordSections/);
    }
  });
});
