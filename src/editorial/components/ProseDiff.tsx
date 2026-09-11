import { Fragment, useMemo } from 'react';
import { diffProse } from '../textDiff';

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/**
 * A revision, shown as what it changed: changed paragraphs with the removed
 * words struck and the new ones marked, whole paragraphs added or gone, and
 * the untouched ones counted rather than repeated.
 */
export default function ProseDiff({ before, after }: { before: string; after: string }) {
  const diff = useMemo(() => diffProse(before, after), [before, after]);
  const summary = [
    diff.changed ? `${plural(diff.changed, 'paragraph')} changed` : null,
    diff.added ? `${plural(diff.added, 'paragraph')} added` : null,
    diff.removed ? `${plural(diff.removed, 'paragraph')} removed` : null,
  ].filter(Boolean).join(', ');

  return (
    <div className="editorial-prosediff">
      <p className="editorial-prosediff__summary">
        {summary ? `${summary}, of ${diff.total}.` : 'Nothing changed.'}
      </p>
      {diff.blocks.map((block, i) => {
        // A diff only grows forward, so a block's place is its identity.
        const key = `${block.kind}-${i}`;
        if (block.kind === 'same') {
          return <p key={key} className="editorial-prosediff__same">{`${plural(block.count, 'paragraph')} unchanged`}</p>;
        }
        if (block.kind === 'added') {
          return <p key={key} className="editorial-prosediff__para"><ins className="editorial-prosediff__ins">{block.text}</ins></p>;
        }
        if (block.kind === 'removed') {
          return <p key={key} className="editorial-prosediff__para"><del className="editorial-prosediff__del">{block.text}</del></p>;
        }
        return (
          <p key={key} className="editorial-prosediff__para">
            {block.words.map((w, j) => (w.kind === 'same' ? w.text
              : w.kind === 'added'
                ? <ins key={`w${j}`} className="editorial-prosediff__ins">{w.text}</ins>
                : (
                  <Fragment key={`w${j}`}>
                    <del className="editorial-prosediff__del">{w.text}</del>
                    {/* A struck phrase that ends without a space would run
                        straight into the words that replace it. */}
                    {block.words[j + 1]?.kind === 'added' && !/\s$/.test(w.text) ? ' ' : null}
                  </Fragment>
                )))}
          </p>
        );
      })}
    </div>
  );
}
