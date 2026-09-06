import type { DerivativeWork } from './api';

/**
 * Chapters read in the order they were written, not the order the database
 * returns them.
 *
 * The works in a universe are individual chapters titled "Chapter 1: ...",
 * "Chapter 2: ...", so a plain string sort puts chapter 10 before chapter 2.
 * The number in the title is the ordering when there is one; otherwise fall
 * back to creation order, which is the next best evidence of sequence.
 */
export function chapterNumber(title: string): number | null {
  const match = /(?:chapter|part|book)\s+(\d+)/i.exec(title ?? '');
  return match ? Number(match[1]) : null;
}

export function orderChapters<T extends Pick<DerivativeWork, 'title' | 'createdAt'>>(works: T[]): T[] {
  return [...works].sort((a, b) => {
    const na = chapterNumber(a.title);
    const nb = chapterNumber(b.title);
    if (na !== null && nb !== null && na !== nb) return na - nb;
    if (na !== null && nb === null) return -1;
    if (na === null && nb !== null) return 1;
    return String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? ''))
      || String(a.title ?? '').localeCompare(String(b.title ?? ''));
  });
}
