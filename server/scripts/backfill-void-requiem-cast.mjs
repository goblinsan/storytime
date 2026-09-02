import pg from 'pg';

const connectionString = process.env.STORYTIME_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error('STORYTIME_DATABASE_URL required');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });

async function run() {
  const client = await pool.connect();
  try {
    const projectId = 'de11bcbe-9c8f-4378-a299-c8be3d07c0af';

    console.log('Backfilling calendar label on Void Requiem universe...');
    await client.query(
      "UPDATE stories SET calendar_label = 'Year of the Iron Dirge' WHERE id = $1",
      [projectId]
    );

    console.log('Promoting principal actors...');
    const principalUpdates = [
      { id: 'char-vane', start: 164, end: null },
      { id: 'char-lyra', start: 294, end: null },
      { id: 'char-mara-sunder', start: 275, end: null },
      { id: 'character-kai-ren', start: 268, end: null },
      { id: 'character-elyse-vane', start: 170, end: 304 },
      { id: 'char-solenne', start: 292, end: 304 },
      { id: 'character-zephyrine', start: 250, end: null },
    ];

    for (const p of principalUpdates) {
      await client.query(
        `UPDATE characters
         SET importance = 'principal',
             active_timeframe_start = COALESCE($1, active_timeframe_start),
             active_timeframe_end = $2
         WHERE id = $3 OR name ILIKE $4`,
        [p.start, p.end, p.id, `%${p.id.replace('char-', '').replace('character-', '')}%`]
      );
    }

    console.log('Classifying historical lineage ancestors as background...');
    await client.query(`
      UPDATE characters
      SET importance = 'background',
          active_timeframe_start = COALESCE(active_timeframe_start, 120),
          active_timeframe_end = COALESCE(active_timeframe_end, 180)
      WHERE project_id = $1
        AND (role ILIKE '%ancestor%' OR role ILIKE '%forebear%' OR role ILIKE '%elder%' OR role ILIKE '%founder%')
        AND importance != 'principal'
    `, [projectId]);

    console.log('Assigning default contemporary timeframe to supporting cast...');
    await client.query(`
      UPDATE characters
      SET active_timeframe_start = COALESCE(active_timeframe_start, 280),
          active_timeframe_end = active_timeframe_end
      WHERE project_id = $1
        AND active_timeframe_start IS NULL
    `, [projectId]);

    // Ensure family canon relationships exist for the primary lineage
    const familyRelations = [
      { s: 'char-vane', t: 'character-elyse-vane', type: 'married_to', notes: 'Murdered wife; ghost transmission echoes through chassis' },
      { s: 'char-vane', t: 'char-solenne', type: 'parent_of', notes: 'Lost daughter perished in shuttle destruction' },
      { s: 'character-elyse-vane', t: 'char-solenne', type: 'parent_of', notes: 'Daughter lost in the Fall of Oakhaven' },
      { s: 'char-vane', t: 'char-lyra', type: 'protective_bond', notes: 'Refugee girl strikingly similar to lost Solenne' },
      { s: 'char-mara-sunder', t: 'char-lyra', type: 'guardian_of', notes: 'Protector of the Rim refugees' },
    ];

    for (const rel of familyRelations) {
      const sRow = await client.query('SELECT id FROM characters WHERE id = $1 OR name ILIKE $2 LIMIT 1', [rel.s, `%${rel.s.replace('char-', '').replace('character-', '')}%`]);
      const tRow = await client.query('SELECT id FROM characters WHERE id = $1 OR name ILIKE $2 LIMIT 1', [rel.t, `%${rel.t.replace('char-', '').replace('character-', '')}%`]);

      if (sRow.rows[0] && tRow.rows[0]) {
        const sId = sRow.rows[0].id;
        const tId = tRow.rows[0].id;

        await client.query(`
          INSERT INTO canon_relationships (
            id, project_id, source_entity_type, source_entity_id,
            target_entity_type, target_entity_id, relationship_type, notes
          ) VALUES (
            'rel-fam-' || substr(md5(random()::text), 1, 8),
            $1, 'character', $2, 'character', $3, $4, $5
          ) ON CONFLICT DO NOTHING
        `, [projectId, sId, tId, rel.type, rel.notes]);
      }
    }

    console.log('Void Requiem cast backfill complete!');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
