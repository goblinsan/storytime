#!/usr/bin/env node
/**
 * Bring pictures that live on a render machine onto the storage volume.
 *
 * Assets cataloged before adoption existed point at the ComfyUI that drew
 * them: `http://<render host>:5410/view?filename=contesora_00009_.png`. That
 * folder gets cleared, and its filenames count from one and start again when
 * it is, so the reference is a position rather than a name -- the same URL is a
 * different picture next week, or a 404. Every one of them is a portrait
 * somebody chose deliberately and would have to choose again.
 *
 *   node scripts/adopt-media.mjs <projectId>            say what it would do
 *   node scripts/adopt-media.mjs <projectId> --apply    do it
 *
 * Needs CONTESORA_MEDIA_DIR pointing at the storage mount, and the render
 * machine still reachable -- this reads the bytes from it one last time.
 *
 * WHAT IT WILL NOT TOUCH
 * Anything already on /media-files or /reference, and anything it cannot fetch.
 * A row is only rewritten after its bytes are on the volume, so a failure
 * leaves the old URL in place: still fragile, but still pointing at a picture.
 * The other order would trade a fragile reference for a broken one.
 */
import db from '../server/db.js';
import { keepImage, mediaDir } from '../server/mediaStore.js';

const args = process.argv.slice(2);
const PROJECT = args.find((a) => !a.startsWith('--'));
const APPLY = args.includes('--apply');

if (!PROJECT) {
  console.error('usage: node scripts/adopt-media.mjs <projectId> [--apply]');
  process.exit(2);
}
if (!mediaDir()) {
  console.error('CONTESORA_MEDIA_DIR is not set, so there is nowhere to put them.');
  process.exit(1);
}

/** Somewhere else's machine: an absolute URL this app does not serve. */
const elsewhere = (url) => /^https?:\/\//i.test(url);

const rows = await db.all(
  'SELECT id, url, title FROM media_assets WHERE project_id = ? ORDER BY created_at',
  PROJECT,
);
const stranded = rows.filter((r) => elsewhere(r.url));

console.log(`${rows.length} assets, ${stranded.length} pointing at a machine that is not storage.`);
if (!stranded.length) {
  await db.close();
  process.exit(0);
}

let moved = 0;
const failed = [];

for (const row of stranded) {
  process.stdout.write(`  ${row.title || row.id}… `);
  if (!APPLY) {
    console.log(`would copy from ${new URL(row.url).host}`);
    continue;
  }
  try {
    const kept = await keepImage(row.url);
    if (!kept.stored) throw new Error(kept.detail);
    // Only now: the bytes are on the volume, so the row can stop pointing at
    // the render machine.
    await db.run('UPDATE media_assets SET url = ?, updated_at = now() WHERE id = ?', kept.url, row.id);
    moved += 1;
    console.log(`${kept.url} (${kept.bytes} bytes)`);
  } catch (error) {
    failed.push(`${row.title || row.id}: ${error.message}`);
    console.log(`left alone (${error.message})`);
  }
}

if (APPLY) {
  console.log(`\n${moved} moved, ${failed.length} left pointing where they were.`);
  for (const line of failed) console.log(`  ${line}`);
} else {
  console.log('\nDry run. Nothing was copied or rewritten. Pass --apply.');
}

await db.close();
