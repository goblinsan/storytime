#!/usr/bin/env node
/**
 * Does the canon's chronology hold together?
 *
 * Void Requiem's active spans were seeded per HOUSE rather than per person:
 * eleven Vanes began in 164, twenty-two Zephyrines in 250, twenty-three Rens
 * and Sunders in 280. Parents, children and grandchildren all "began" in the
 * same year, so fifteen of eighteen parent-to-child edges were impossible --
 * twelve with a gap of exactly zero, two negative, and two over a century.
 * Elyse Vane was a hundred and twenty-two years old when she had Solenne.
 *
 * None of it was visible until the cast could be grouped by century and
 * filtered by year, at which point it was the first thing anybody saw. A
 * chronology nothing checks is a chronology that drifts, so this checks it.
 *
 *   node scripts/check-canon-timing.mjs <projectId> [--base=URL] [--json]
 *
 * Reports, never writes. Exits non-zero when the canon contradicts itself, so
 * it can stand in a gate.
 */
const args = process.argv.slice(2);
const PROJECT = args.find((a) => !a.startsWith('--'));
const BASE = (args.find((a) => a.startsWith('--base=')) ?? '--base=http://localhost:5173').slice(7);
const AS_JSON = args.includes('--json');

if (!PROJECT) {
  console.error('usage: node scripts/check-canon-timing.mjs <projectId> [--base=URL] [--json]');
  process.exit(2);
}

/**
 * A generation is a range, not a number. Sixteen is young for a parent and
 * forty-five is late, but both happen; what does not happen is a parent and
 * child coming of age in the same year, which is what house-level seeding
 * produces.
 */
const GENERATION = { min: 16, max: 45 };
const SPOUSE_SPREAD = 12;
const SIBLING_SPREAD = 20;
/** Enough people sharing one start year to suggest it was stamped, not chosen. */
const STAMPED = 6;

const get = async (path) => {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
};

const characters = await get(`/api/characters?projectId=${encodeURIComponent(PROJECT)}&limit=500`);
const rels = await get(`/api/relationships?projectId=${encodeURIComponent(PROJECT)}`);
const enc = await get(`/api/stories/${encodeURIComponent(PROJECT)}/encyclopedia`);

const byId = new Map(characters.map((c) => [String(c.id), c]));
const nameOf = (id) => byId.get(String(id))?.name ?? id;
const start = (id) => {
  const v = byId.get(String(id))?.activeTimeframeStart;
  return v === null || v === undefined ? null : Number(v);
};
const end = (id) => {
  const c = byId.get(String(id));
  if (!c || c.activeTimeframeOpen) return null;
  return c.activeTimeframeEnd === null || c.activeTimeframeEnd === undefined
    ? null : Number(c.activeTimeframeEnd);
};

const findings = [];
const report = (kind, message) => findings.push({ kind, message });

for (const c of characters) {
  const s = start(c.id);
  const e = end(c.id);
  if (s === null) { report('no-start', `${c.name} has no active start year`); continue; }
  if (e !== null && e <= s) report('span', `${c.name} is active ${s} to ${e}, which ends at or before it starts`);
  if (c.activeTimeframeOpen && c.activeTimeframeEnd !== null && c.activeTimeframeEnd !== undefined) {
    report('span', `${c.name} is recorded as unending and as ending in ${c.activeTimeframeEnd}`);
  }
}

const edges = { parent: [], spouse: [], sibling: [], ancestor: [] };
for (const r of rels) {
  if (r.sourceEntityType !== 'character' || r.targetEntityType !== 'character') continue;
  const a = String(r.sourceEntityId);
  const b = String(r.targetEntityId);
  switch (r.relationshipType) {
    case 'parent': case 'parent_of': edges.parent.push([a, b]); break;
    case 'child_of': edges.parent.push([b, a]); break;
    case 'spouse': edges.spouse.push([a, b]); break;
    case 'sibling': edges.sibling.push([a, b]); break;
    case 'ancestor': edges.ancestor.push([a, b]); break;
    default: break;
  }
}

for (const [p, c] of edges.parent) {
  const ps = start(p);
  const cs = start(c);
  if (ps === null || cs === null) continue;
  const gap = cs - ps;
  if (gap < GENERATION.min || gap > GENERATION.max) {
    report('generation', `${nameOf(p)} (${ps}) -> ${nameOf(c)} (${cs}): ${gap} years`
      + `${gap <= 0 ? ', so the child is not younger than the parent' : ''}`);
  }
}
for (const [a, b] of edges.spouse) {
  const d = Math.abs(start(a) - start(b));
  if (Number.isFinite(d) && d > SPOUSE_SPREAD) {
    report('spouse', `${nameOf(a)} and ${nameOf(b)} are married but begin ${d} years apart`);
  }
}
for (const [a, b] of edges.sibling) {
  const d = Math.abs(start(a) - start(b));
  if (Number.isFinite(d) && d > SIBLING_SPREAD) {
    report('sibling', `${nameOf(a)} and ${nameOf(b)} are siblings but begin ${d} years apart`);
  }
}
for (const [a, b] of edges.ancestor) {
  const d = start(b) - start(a);
  if (Number.isFinite(d) && d < GENERATION.min) {
    report('ancestor', `${nameOf(a)} is an ancestor of ${nameOf(b)} but begins only ${d} years earlier`);
  }
}

/** A dated event is a claim that everybody it names was there to see it. */
const yearOf = (event) => {
  const m = /(\d{3,4})/.exec(String(event.date ?? ''));
  return m ? Number(m[1]) : null;
};
for (const event of enc.catalog?.timelineEvents ?? []) {
  const year = yearOf(event);
  if (year === null) continue;
  for (const entry of event.characters ?? []) {
    const id = String(typeof entry === 'object' ? entry.id : entry);
    if (!byId.has(id)) continue;
    const s = start(id);
    const e = end(id);
    if (s === null) continue;
    if (s > year) report('timeline', `${nameOf(id)} begins in ${s} but is named in "${event.title}" in ${year}`);
    else if (e !== null && e < year) {
      report('timeline', `${nameOf(id)} ends in ${e} but is named in "${event.title}" in ${year}`);
    }
  }
}

const perYear = new Map();
for (const c of characters) {
  const s = start(c.id);
  if (s === null) continue;
  perYear.set(s, (perYear.get(s) ?? 0) + 1);
}
for (const [year, n] of [...perYear.entries()].sort((a, b) => b[1] - a[1])) {
  if (n < STAMPED) break;
  report('stamped', `${n} characters all begin in ${year}, which reads as a year stamped on a house `
    + 'rather than chosen for a person');
}

if (AS_JSON) {
  console.log(JSON.stringify({ characters: characters.length, findings }, null, 1));
} else {
  console.log(`${characters.length} characters, ${edges.parent.length} parent-to-child edges, `
    + `${enc.catalog?.timelineEvents?.length ?? 0} dated events.\n`);
  if (!findings.length) console.log('chronology holds: no contradictions found.');
  const byKind = new Map();
  for (const f of findings) {
    if (!byKind.has(f.kind)) byKind.set(f.kind, []);
    byKind.get(f.kind).push(f.message);
  }
  for (const [kind, list] of byKind) {
    console.log(`${kind} (${list.length})`);
    for (const m of list) console.log(`   ${m}`);
    console.log();
  }
}
process.exit(findings.length ? 1 : 0);
