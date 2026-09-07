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

/**
 * How to find each character in prose.
 *
 * A short form is only usable if it belongs to one person: this universe holds
 * a Lyra Zephyrine and a Lyra of the Outer Rim, so "Lyra" names nobody in
 * particular and counting it would bill the wrong character.
 */
const shortForms = new Map();
for (const c of characters) {
  const bare = String(c.name ?? '').replace(TITLES, '').trim();
  const first = bare.split(/\s+/)[0] ?? '';
  if (first.length >= 4) shortForms.set(first.toLowerCase(), (shortForms.get(first.toLowerCase()) ?? 0) + 1);
}

const needlesFor = (c) => {
  const full = String(c.name ?? '').trim();
  const bare = full.replace(TITLES, '').trim();
  const first = bare.split(/\s+/)[0] ?? '';
  const forms = new Set([full, bare].filter((f) => f.length > 2));
  if (first.length >= 4 && shortForms.get(first.toLowerCase()) === 1) forms.add(first);
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
    .map((c) => ({ characterId: c.id, name: c.name, mentions: countIn(prose, needlesFor(c)) }))
    .filter((row) => row.mentions > 0)
    .sort((a, b) => b.mentions - a.mentions || String(a.name).localeCompare(String(b.name)));

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
