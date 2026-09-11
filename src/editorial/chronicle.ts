import type { TimelineEvent } from './api';

/**
 * The chronicle as it nests, in the order things happened.
 *
 * Events in the same year were listed by title, so in 304 the glassing of
 * Oakhaven came before the breach that led to it. The order within a year is
 * already recorded -- each event says what it comes before -- so siblings in
 * a year follow those links, and only what they do not settle (or a loop in
 * them) keeps the order it arrived in.
 */
export function nestChronicle(events: TimelineEvent[]): Map<string | null, TimelineEvent[]> {
  const shown = new Set(events.map((e) => e.id));
  const under = new Map<string | null, TimelineEvent[]>();
  for (const e of events) {
    // A part whose event is not shown (outside the chosen years) stands at the top.
    const key = e.parentId && shown.has(e.parentId) ? e.parentId : null;
    if (!under.has(key)) under.set(key, []);
    under.get(key)!.push(e);
  }
  for (const [key, siblings] of under) under.set(key, inSequence(siblings));
  return under;
}

/** Siblings by year, and within a year by what each comes before. */
export function inSequence(siblings: TimelineEvent[]): TimelineEvent[] {
  const years = new Map<string, TimelineEvent[]>();
  const order: string[] = [];
  for (const e of siblings) {
    const year = e.year === null || e.year === undefined ? 'none' : String(e.year);
    if (!years.has(year)) { years.set(year, []); order.push(year); }
    years.get(year)!.push(e);
  }
  return order.flatMap((year) => byLinks(years.get(year)!));
}

function byLinks(group: TimelineEvent[]): TimelineEvent[] {
  if (group.length < 2) return group;
  const byId = new Map(group.map((e) => [e.id, e]));
  const waiting = new Map(group.map((e) => [e.id, 0]));
  for (const e of group) {
    for (const next of e.beforeEventIds ?? []) {
      if (byId.has(next) && next !== e.id) waiting.set(next, waiting.get(next)! + 1);
    }
  }
  const ready = group.filter((e) => waiting.get(e.id) === 0);
  const out: TimelineEvent[] = [];
  while (ready.length) {
    const e = ready.shift()!;
    out.push(e);
    for (const next of e.beforeEventIds ?? []) {
      if (!byId.has(next) || next === e.id) continue;
      waiting.set(next, waiting.get(next)! - 1);
      if (waiting.get(next) === 0) ready.push(byId.get(next)!);
    }
  }
  // A loop leaves some unplaced: they keep the order they arrived in.
  for (const e of group) if (!out.includes(e)) out.push(e);
  return out;
}
