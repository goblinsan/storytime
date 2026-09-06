/**
 * Prose is stored as plain text with blank-line paragraph breaks.
 *
 * Each paragraph gets a stable index so a passage can be addressed by
 * (workId, sectionId, offset) and a link to it survives being shared. The
 * offsets are character offsets into the whole work, which is what the
 * passage-revision contract's locator expects.
 */
export interface Paragraph {
  index: number;
  text: string;
  startOffset: number;
  endOffset: number;
}

export function toParagraphs(content: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  let cursor = 0;
  let index = 0;

  for (const chunk of content.split(/\n{2,}/)) {
    const start = content.indexOf(chunk, cursor);
    const text = chunk.trim();
    if (text) {
      paragraphs.push({
        index: index++,
        text,
        startOffset: start,
        endOffset: start + chunk.length,
      });
    }
    cursor = start + chunk.length;
  }
  return paragraphs;
}

/** Rough reading time, at a deliberately unhurried 220 words a minute. */
export function readingMinutes(content: string): number {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

export const passageAnchor = (index: number): string => `p${index}`;
