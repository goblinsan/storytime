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

    console.log('Resetting non-core cast to supporting / background...');
    await client.query("UPDATE characters SET importance = 'supporting' WHERE project_id = $1", [projectId]);

    console.log('Promoting only the TRUE core principal actors...');
    const principalActors = [
      { id: 'char-vane', name: 'Lord Malakor Vane', start: 164, end: null },
      { id: 'char-lyra', name: 'Lyra of the Outer Rim', start: 294, end: null },
      { id: 'char-mara-sunder', name: 'Mara Sunder', start: 275, end: null },
      { id: 'character-kai-ren', name: 'Kai Ren', start: 268, end: null },
      { id: 'character-elyse-vane', name: 'Lady Elyse Vane', start: 170, end: 304 },
      { id: 'char-solenne', name: 'Solenne Vane', start: 292, end: 304 },
    ];

    for (const p of principalActors) {
      await client.query(
        `UPDATE characters
         SET importance = 'principal',
             active_timeframe_start = $1,
             active_timeframe_end = $2
         WHERE project_id = $3 AND (id = $4 OR name = $5)`,
        [p.start, p.end, projectId, p.id, p.name]
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

    console.log('Void Requiem cast cleanup complete!');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
