#!/usr/bin/env node
/**
 * Propose a running order for each derivative work, from the work's own prose.
 *
 * Importance belongs to a character in a work. Nothing had ever recorded that,
 * so work_characters starts empty and every work's cast is unknown. This reads
 * what each work actually says and proposes an order: who is named most is
 * billed first.
 *
 * Everything it writes is marked `derived`. The API refuses to let a derived
 * pass overwrite an authored row, so this can be re-run after somebody has
 * fixed an order by hand without undoing them.
 *
 *   node scripts/derive-work-cast.mjs <projectId> [--dry-run]
 */
const API = process.env.STORYTIME_API ?? 'http://localhost:3001/api';
const [projectId, ...flags] = process.argv.slice(2);
const dryRun = flags.includes('--dry-run');

if (!projectId) {
  console.error('usage: node scripts/derive-work-cast.mjs <projectId> [--dry-run]');
  process.exit(2);
}

const json = async (method, path, body) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
};

const escape = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Honorifics are not part of a name for the purpose of finding one in prose. */
const TITLES = /^(lord|lady|sir|dame|captain|commander|doctor|dr|professor|the)\s+/i;

const characters = await json('GET', `/characters?projectId=${encodeURIComponent(projectId)}`);
const works = await json('GET', `/derivatives?projectId=${encodeURIComponent(projectId)}`);
const graph = await json('GET', `/relationships?projectId=${encodeURIComponent(projectId)}`);
const edges = (Array.isArray(graph) ? graph : graph.relationships ?? [])
  .filter((e) => e.sourceEntityType === 'character' && e.targetEntityType === 'character');

/** Who each character is tied to in the canon graph, in either direction. */
const tiedTo = new Map();
for (const e of edges) {
  const [a, b] = [String(e.sourceEntityId), String(e.targetEntityId)];
  tiedTo.set(a, (tiedTo.get(a) ?? new Set()).add(b));
  tiedTo.set(b, (tiedTo.get(b) ?? new Set()).add(a));
}

/**
 * How to find each character in prose.
 *
 * A short form can belong to several people: this universe holds four
 * characters called Lyra, and none of their full names appears anywhere in the
 * main arc -- the prose only ever says "Lyra". Refusing to count an ambiguous
 * form is not the safe choice it looks like: it dropped the third most
 * mentioned character in the arc, 51 mentions, entirely out of the billing.
 *
 * So ambiguity is resolved rather than avoided, in a second pass, using the
 * canon graph: the candidate tied to the people the work is unambiguously
 * about is the one the prose means. In the arc, Lyra of the Outer Rim is
 * guarded by Mara, protected by Malakor and Solenne, and family to Mara; the
 * other three Lyras are tied to none of them.
 */
const firstNameOf = (c) => (String(c.name ?? '').replace(TITLES, '').trim().split(/\s+/)[0] ?? '');

const claimants = new Map();
for (const c of characters) {
  const first = firstNameOf(c);
  if (first.length < 4) continue;
  const key = first.toLowerCase();
  claimants.set(key, [...(claimants.get(key) ?? []), c]);
}

/** Only the forms that name exactly one person. */
const unambiguousNeedles = (c) => {
  const full = String(c.name ?? '').trim();
  const bare = full.replace(TITLES, '').trim();
  const first = firstNameOf(c);
  const forms = new Set([full, bare].filter((f) => f.length > 2));
  if (first.length >= 4 && (claimants.get(first.toLowerCase()) ?? []).length === 1) forms.add(first);
  return [...forms];
};

const countIn = (text, needles) => {
  let total = 0;
  for (const needle of needles) {
    const hits = text.match(new RegExp(`\\b${escape(needle)}\\b`, 'gi'));
    total = Math.max(total, hits ? hits.length : 0);
  }
  return total;
};

let touched = 0;
for (const work of works) {
  const prose = `${work.title ?? ''}\n${work.description ?? ''}\n${work.content ?? ''}`;
  if (prose.trim().length < 40) continue;

  const billed = characters
    .map((c) => ({ characterId: c.id, name: c.name, mentions: countIn(prose, unambiguousNeedles(c)) }))
    .filter((row) => row.mentions > 0);

  // Second pass: a shared first name goes to whoever this work is already
  // about, measured on the canon graph rather than guessed from the string.
  const certain = new Set(billed.map((r) => String(r.characterId)));
  for (const [key, candidates] of claimants) {
    if (candidates.length < 2) continue;
    if (candidates.some((c) => certain.has(String(c.id)))) continue;
    const mentions = countIn(prose, [key]);
    if (mentions === 0) continue;

    const scored = candidates
      .map((c) => ({
        c,
        ties: [...(tiedTo.get(String(c.id)) ?? [])].filter((other) => certain.has(other)).length,
      }))
      .sort((a, b) => b.ties - a.ties);

    if (scored[0].ties === 0 || scored[0].ties === (scored[1]?.ties ?? 0)) {
      console.log(`  ${work.title}: "${key}" is ambiguous (${candidates.length} candidates) and the graph does not settle it -- left unbilled`);
      continue;
    }
    billed.push({ characterId: scored[0].c.id, name: scored[0].c.name, mentions });
  }

  billed.sort((a, b) => b.mentions - a.mentions || String(a.name).localeCompare(String(b.name)));

  if (billed.length === 0) {
    console.log(`  ${work.title}: names nobody in the cast`);
    continue;
  }

  const top = billed.slice(0, 4).map((r) => `${r.name} (${r.mentions})`).join(', ');
  if (dryRun) {
    console.log(`  ${work.title}: ${billed.length} billed -- ${top}`);
  } else {
    await json('PUT', `/derivatives/${encodeURIComponent(work.id)}/cast`, {
      source: 'derived',
      cast: billed.map((r) => ({ characterId: r.characterId, notes: `${r.mentions} mentions` })),
    });
    console.log(`  ${work.title}: billed ${billed.length} -- ${top}`);
  }
  touched += 1;
}

console.log(`${dryRun ? 'would update' : 'updated'} ${touched} of ${works.length} works`);
