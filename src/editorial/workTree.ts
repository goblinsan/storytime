import type { WorkNode } from './api';

/**
 * The library as a tree, and a story as something read in order.
 *
 * The reader used to open one work and list every work in the universe beside
 * it, flat, in no order. A story in five chapters read as Chapter 1 and then
 * nothing: no way on from the last line, and a drawer where Chapter 2 sat
 * between two unrelated works. The order already existed -- `parent_id` and
 * `part_number` -- and the works surface drew it; the reader never asked.
 */

/** Every work, depth-first: a work, then its parts in order, then the next work. */
export function inOrder(works: WorkNode[]): Array<WorkNode & { depth: number }> {
  const byParent = new Map<string | null, WorkNode[]>();
  const known = new Set(works.map((w) => w.id));
  for (const w of works) {
    const key = w.parentId && known.has(w.parentId) ? w.parentId : null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(w);
  }
  const out: Array<WorkNode & { depth: number }> = [];
  const walk = (parent: string | null, depth: number, seen: Set<string>) => {
    for (const w of byParent.get(parent) ?? []) {
      if (seen.has(w.id)) continue;
      out.push({ ...w, depth });
      walk(w.id, depth + 1, new Set(seen).add(w.id));
    }
  };
  walk(null, 0, new Set());
  return out;
}

export interface ReadingOrder {
  /** The work this is ultimately a part of: the story being read. */
  story: WorkNode & { depth: number };
  /** What is read, in order: the story's parts that have no parts of their own. */
  pages: Array<WorkNode & { depth: number }>;
  /** Where the open work sits in `pages`, or -1 when it is not a page. */
  at: number;
  /** The nearest written pages either side. An unwritten chapter is not a page to turn to. */
  previous: (WorkNode & { depth: number }) | null;
  next: (WorkNode & { depth: number }) | null;
}

export function readingOrder(works: WorkNode[], workId: string): ReadingOrder | null {
  const ordered = inOrder(works);
  const byId = new Map(ordered.map((w) => [w.id, w]));
  let story = byId.get(workId);
  const climbed = new Set<string>();
  while (story?.parentId && byId.has(story.parentId) && !climbed.has(story.id)) {
    climbed.add(story.id);
    story = byId.get(story.parentId);
  }
  if (!story) return null;

  const start = ordered.findIndex((w) => w.id === story!.id);
  const subtree = [ordered[start]];
  for (const w of ordered.slice(start + 1)) {
    if (w.depth <= story.depth) break;
    subtree.push(w);
  }
  const hasParts = new Set(works.map((w) => w.parentId).filter(Boolean));
  const pages = subtree.filter((w) => !hasParts.has(w.id));

  const at = pages.findIndex((w) => w.id === workId);
  const written = (w: WorkNode) => w.words > 0;
  const previous = at > 0 ? [...pages.slice(0, at)].reverse().find(written) ?? null : null;
  const next = at >= 0 ? pages.slice(at + 1).find(written) ?? null : null;
  return { story, pages, at, previous, next };
}
