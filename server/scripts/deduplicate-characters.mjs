import pg from 'pg';

const connectionString = process.env.STORYTIME_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error('STORYTIME_DATABASE_URL required');
  process.exit(1);
}

const isDryRun = process.argv.includes('--dry-run');
const pool = new pg.Pool({ connectionString });

function safeJson(val, fallback) {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

export async function deduplicateCharacters(client, options = { dryRun: false }) {
  console.log(`Starting character deduplication audit (dryRun: ${options.dryRun})...`);

  // 1. Find all duplicate groups
  const dupeGroupsRes = await client.query(`
    SELECT project_id, LOWER(TRIM(name)) as norm_name, count(*) as count
    FROM characters
    WHERE LOWER(TRIM(name)) NOT IN ('new character', 'unnamed character', '')
    GROUP BY project_id, LOWER(TRIM(name))
    HAVING count(*) > 1
  `);

  console.log(`Found ${dupeGroupsRes.rows.length} duplicate character name group(s).`);

  const auditLog = [];

  for (const group of dupeGroupsRes.rows) {
    const { project_id, norm_name } = group;

    // Get all rows in this group
    const charsRes = await client.query(`
      SELECT id, name, role, importance, is_protected, background, description, traits, relationships, created_at
      FROM characters
      WHERE project_id = $1 AND LOWER(TRIM(name)) = $2
      ORDER BY
        is_protected DESC,
        CASE WHEN importance = 'principal' THEN 1 WHEN importance = 'supporting' THEN 2 ELSE 3 END,
        LENGTH(COALESCE(background, '') || COALESCE(description, '')) DESC,
        created_at ASC
    `, [project_id, norm_name]);

    const characters = charsRes.rows;
    const survivor = characters[0];
    const duplicates = characters.slice(1);

    const survivorReason = survivor.is_protected
      ? 'is_protected = true'
      : survivor.importance === 'principal'
      ? 'importance = principal'
      : 'longest background/earliest created';

    const groupAudit = {
      name: survivor.name,
      normName: norm_name,
      projectId: project_id,
      survivorId: survivor.id,
      survivorReason,
      removedIds: duplicates.map((d) => d.id),
      rewrittenRelationships: 0,
      rewrittenTimelineEvents: 0,
      rewrittenDerivatives: 0,
    };

    for (const dupe of duplicates) {
      const dupeId = dupe.id;

      if (!options.dryRun) {
        // A. Rewrite canon_relationships (source and target)
        const relSource = await client.query(`
          UPDATE canon_relationships
          SET source_entity_id = $1
          WHERE project_id = $2 AND source_entity_type = 'character' AND source_entity_id = $3
        `, [survivor.id, project_id, dupeId]);

        const relTarget = await client.query(`
          UPDATE canon_relationships
          SET target_entity_id = $1
          WHERE project_id = $2 AND target_entity_type = 'character' AND target_entity_id = $3
        `, [survivor.id, project_id, dupeId]);

        groupAudit.rewrittenRelationships += (relSource.rowCount || 0) + (relTarget.rowCount || 0);

        // Delete any duplicate self-relationships or colliding relationships created by the merge
        await client.query(`
          DELETE FROM canon_relationships
          WHERE source_entity_id = target_entity_id
             OR id IN (
               SELECT id FROM (
                 SELECT id, ROW_NUMBER() OVER (PARTITION BY project_id, source_entity_id, target_entity_id, relationship_type ORDER BY id) as rnum
                 FROM canon_relationships
                 WHERE project_id = $1
               ) t WHERE t.rnum > 1
             )
        `, [project_id]);

        // B. Rewrite timeline_events.characters JSON array
        const eventsRes = await client.query(`
          SELECT id, characters
          FROM timeline_events
          WHERE project_id = $1 AND characters::text LIKE $2
        `, [project_id, `%${dupeId}%`]);

        for (const ev of eventsRes.rows) {
          const charsArr = safeJson(ev.characters, []);
          if (charsArr.includes(dupeId)) {
            const updated = Array.from(new Set(charsArr.map((cid) => (cid === dupeId ? survivor.id : cid))));
            await client.query(`
              UPDATE timeline_events
              SET characters = $1::jsonb
              WHERE id = $2
            `, [JSON.stringify(updated), ev.id]);
            groupAudit.rewrittenTimelineEvents++;
          }
        }

        // C. Rewrite derivative_works.source_canon_references
        const derivRes = await client.query(`
          SELECT id, source_canon_references
          FROM derivative_works
          WHERE project_id = $1 AND source_canon_references::text LIKE $2
        `, [project_id, `%${dupeId}%`]);

        for (const d of derivRes.rows) {
          const refs = safeJson(d.source_canon_references, []);
          let changed = false;
          const updatedRefs = refs.map((ref) => {
            if (ref.entityId === dupeId) {
              changed = true;
              return { ...ref, entityId: survivor.id, name: survivor.name };
            }
            return ref;
          });
          if (changed) {
            await client.query(`
              UPDATE derivative_works
              SET source_canon_references = $1::jsonb
              WHERE id = $2
            `, [JSON.stringify(updatedRefs), d.id]);
            groupAudit.rewrittenDerivatives++;
          }
        }

        // D. Delete the duplicate character row
        await client.query('DELETE FROM characters WHERE id = $1', [dupeId]);
      }
    }

    auditLog.push(groupAudit);
  }

  console.log(`Deduplication audit complete. Processed ${auditLog.length} group(s).`);
  return auditLog;
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const audit = await deduplicateCharacters(client, { dryRun: isDryRun });
    console.log('--- AUDIT REPORT ---');
    for (const item of audit) {
      console.log(`[${item.name}] Survivor: ${item.survivorId} (${item.survivorReason}) | Deleted: ${item.removedIds.join(', ')} | Rel Rewrites: ${item.rewrittenRelationships}, Event Rewrites: ${item.rewrittenTimelineEvents}`);
    }
    if (isDryRun) {
      console.log('Dry run requested. Rolling back.');
      await client.query('ROLLBACK');
    } else {
      await client.query('COMMIT');
      console.log('Changes committed successfully.');
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Deduplication failed; rolled back:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1]?.endsWith('deduplicate-characters.mjs')) {
  main();
}
