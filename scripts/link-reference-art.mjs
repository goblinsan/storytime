#!/usr/bin/env node
/**
 * Give the files in import/ an entry in the media catalog.
 *
 * There were two asset systems and no bridge between them. import/README.md
 * tells the author to drop files in `import/`; that pipeline writes blobs into
 * `assets`, whose content no route returns. The editorial media studio reads
 * `media_assets`, which stores a URL and a subject. So reference art could sit
 * on disk, be named by the harness inside canon prose, and never be reachable
 * by anything that wanted to show it.
 *
 * server/app.js now serves import/ read-only at /reference. This registers what
 * is in there against the character it depicts, matched on the filename.
 *
 *   node scripts/link-reference-art.mjs <projectId> [--dry-run]
 *
 * Re-running is safe: a file already registered at the same URL is skipped.
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = process.env.STORYTIME_API ?? 'http://localhost:3001/api';
const [projectId, ...flags] = process.argv.slice(2);
const dryRun = flags.includes('--dry-run');

if (!projectId) {
  console.error('usage: node scripts/link-reference-art.mjs <projectId> [--dry-run]');
  process.exit(2);
}

const root = fileURLToPath(new URL('../import/', import.meta.url));
const IMAGE = /\.(png|jpe?g|gif|webp|svg)$/i;

const walk = (dir, prefix = '') =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full, `${prefix}${entry}/`);
    return IMAGE.test(entry) ? [`${prefix}${entry}`] : [];
  });

/**
 * Filenames carry the subject plus bookkeeping. "reference", "portrait" and
 * version markers are bookkeeping; what is left should name somebody.
 */
const NOISE = new Set(['reference', 'portrait', 'ref', 'art', 'concept', 'human']);
const tokensOf = (name) =>
  name.replace(IMAGE, '').split(/[^a-z0-9]+/i).map((t) => t.toLowerCase())
    .filter((t) => t && !NOISE.has(t) && !/^v\d+$/.test(t));

const json = async (method, path, body) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
};

const characters = await json('GET', `/characters?projectId=${encodeURIComponent(projectId)}`);
const existing = await json('GET', `/media?projectId=${encodeURIComponent(projectId)}`);
const alreadyAt = new Map(existing.map((a) => [a.url, a]));

const nameTokens = (name) => String(name ?? '').toLowerCase().split(/[^a-z0-9]+/i).filter(Boolean);

/**
 * What this file is, beyond whose it is.
 *
 * A character can carry several plates and the record shows one at a time, so
 * the caption has to say which one you are looking at. Both of Malakor's read
 * "Lord Malakor Vane, reference" when the title is all there is. The words the
 * author left in the filename after the name are the distinguishing part:
 * "malakor-vane-human-reference" is the human one.
 */
function qualifierOf(file, character) {
  const stem = file.split('/').pop().replace(IMAGE, '');
  const owned = new Set(nameTokens(character.name));
  const rest = stem.split(/[^a-z0-9]+/i).map((t) => t.toLowerCase())
    .filter((t) => t && !owned.has(t));
  if (rest.length === 0) return '';
  const phrase = rest.join(' ');
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

const files = walk(root);
let linked = 0;
let skipped = 0;

let retitled = 0;

for (const file of files) {
  const url = `/reference/${file}`;
  const tokens = tokensOf(file.split('/').pop());
  if (tokens.length === 0) { skipped += 1; continue; }

  // Every token has to appear in the name. "malakor vane" matches "Lord
  // Malakor Vane"; "ship iron cinnabar" matches nobody, which is correct --
  // a ship is not a character.
  const match = characters.find((c) => {
    const name = String(c.name ?? '').toLowerCase();
    return tokens.every((t) => name.includes(t));
  });

  if (!match) {
    console.log(`  no character matches ${file} (${tokens.join(' ')})`);
    skipped += 1;
    continue;
  }

  const caption = qualifierOf(file, match);
  const known = alreadyAt.get(url);

  if (known) {
    // Registered already, but possibly before the caption told them apart.
    if ((known.caption ?? '') === caption) { skipped += 1; continue; }
    if (dryRun) {
      console.log(`  would recaption ${file} -> "${caption}"`);
    } else {
      await json('PATCH', `/media/${encodeURIComponent(known.id)}`, { caption });
      console.log(`  recaptioned ${file} -> "${caption}"`);
    }
    retitled += 1;
    continue;
  }

  if (dryRun) {
    console.log(`  would link ${file} -> ${match.name} ("${caption}")`);
  } else {
    await json('POST', '/media', {
      projectId, url, kind: 'reference', title: `${match.name}, ${caption.toLowerCase()}`, caption,
      subject: { type: 'character', id: match.id },
    });
    console.log(`  linked ${file} -> ${match.name} ("${caption}")`);
  }
  linked += 1;
}

const verb = dryRun ? 'would link' : 'linked';
console.log(`${verb} ${linked}, recaptioned ${retitled}, skipped ${skipped}, of ${files.length} images`);
