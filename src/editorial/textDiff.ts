/**
 * What a revision changed, paragraph by paragraph and word by word.
 *
 * A proposed revision of a chapter arrived as sixteen hundred words to read
 * against the sixteen hundred words already there, with nothing to say which
 * of them were different. Paragraphs are matched first, so a chapter where
 * three paragraphs changed reads as three changes and not as a wall; inside a
 * changed paragraph the words are matched, so the change is the words that
 * changed.
 */

export type DiffWord = { kind: 'same' | 'added' | 'removed'; text: string };
export type DiffBlock =
  | { kind: 'same'; count: number }
  | { kind: 'changed'; words: DiffWord[] }
  | { kind: 'added'; text: string }
  | { kind: 'removed'; text: string };

export interface ProseDiff {
  blocks: DiffBlock[];
  changed: number;
  added: number;
  removed: number;
  total: number;
}

export const paragraphsOf = (text: string) => String(text ?? '')
  .split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

/** The longest run the two sequences share, as pairs of indexes, in order. */
function common<T>(a: T[], b: T[], same: (x: T, y: T) => boolean): Array<[number, number]> {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table = new Uint32Array(rows * cols);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i * cols + j] = same(a[i], b[j])
        ? table[(i + 1) * cols + j + 1] + 1
        : Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1]);
    }
  }
  const pairs: Array<[number, number]> = [];
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (same(a[i], b[j])) { pairs.push([i, j]); i += 1; j += 1; } else if (table[(i + 1) * cols + j] >= table[i * cols + j + 1]) i += 1; else j += 1;
  }
  return pairs;
}

/**
 * Word by word, runs of one kind joined. A word carries the space after it:
 * matched as separate tokens, the spaces between words matched each other and
 * an edit came out as six interleaved pieces instead of one struck phrase and
 * one new one.
 */
export function diffWords(before: string, after: string): DiffWord[] {
  const a = before.match(/\S+\s*/g) ?? [];
  const b = after.match(/\S+\s*/g) ?? [];
  const out: DiffWord[] = [];
  const push = (kind: DiffWord['kind'], text: string) => {
    const last = out[out.length - 1];
    if (last && last.kind === kind) last.text += text; else out.push({ kind, text });
  };
  let i = 0;
  let j = 0;
  for (const [x, y] of [...common(a, b, (p, q) => p.trim() === q.trim()), [a.length, b.length] as [number, number]]) {
    while (i < x) push('removed', a[i++]);
    while (j < y) push('added', b[j++]);
    if (x < a.length) { push('same', b[y]); i = x + 1; j = y + 1; }
  }
  return out;
}

const wordsIn = (text: string) => new Set(text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []);

/**
 * Alike enough to be an edit: sharing at least half the words of the shorter,
 * and at least two of them -- a two-word paragraph shares "not" with half the
 * chapter, and that is not an edit of anything.
 */
export function alike(a: string, b: string): boolean {
  const x = wordsIn(a);
  const y = wordsIn(b);
  const fewer = Math.min(x.size, y.size);
  if (!fewer) return false;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared += 1;
  return shared >= 2 && shared / fewer >= 0.5;
}

export function diffProse(before: string, after: string): ProseDiff {
  const a = paragraphsOf(before);
  const b = paragraphsOf(after);
  const blocks: DiffBlock[] = [];
  let changed = 0;
  let added = 0;
  let removed = 0;
  const same = (count: number) => {
    const last = blocks[blocks.length - 1];
    if (last && last.kind === 'same') last.count += count; else blocks.push({ kind: 'same', count });
  };
  // Between two paragraphs they share, what one lost and the other gained.
  // A lost paragraph and a gained one are an edit of each other only when
  // they are alike; paired by position, a paragraph cut and an unrelated one
  // written in its place read as one sentence struck into the next.
  const gap = (lost: string[], gained: string[]) => {
    let k = 0;
    let l = 0;
    while (k < lost.length && l < gained.length) {
      if (alike(lost[k], gained[l])) {
        blocks.push({ kind: 'changed', words: diffWords(lost[k], gained[l]) });
        changed += 1; k += 1; l += 1;
      } else if (gained.slice(l + 1).some((g) => alike(lost[k], g))) {
        blocks.push({ kind: 'added', text: gained[l] }); added += 1; l += 1;
      } else {
        blocks.push({ kind: 'removed', text: lost[k] }); removed += 1; k += 1;
      }
    }
    for (const text of lost.slice(k)) { blocks.push({ kind: 'removed', text }); removed += 1; }
    for (const text of gained.slice(l)) { blocks.push({ kind: 'added', text }); added += 1; }
  };
  let i = 0;
  let j = 0;
  for (const [x, y] of common(a, b, (p, q) => p === q)) {
    gap(a.slice(i, x), b.slice(j, y));
    same(1);
    i = x + 1;
    j = y + 1;
  }
  gap(a.slice(i), b.slice(j));
  return { blocks, changed, added, removed, total: b.length };
}
