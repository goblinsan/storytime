import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { env } from './env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

const connectionString = env('DATABASE_URL', 'DATABASE_URL');

if (!connectionString) {
  throw new Error(
    'Contesora needs a database: set CONTESORA_DATABASE_URL (or DATABASE_URL). ' +
      'STORYTIME_DATABASE_URL is still read while the rename is in progress. ' +
      'There is no local-file fallback -- an unset connection used to mean a ' +
      'silently different database, which is worse than not starting.',
  );
}

const pool = new pg.Pool({ connectionString });

// better-sqlite3 took ? placeholders; pg takes $1, $2. Rewriting here keeps the
// route modules readable and identical in shape to the queries they replaced.
function positional(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

export async function all(sql, ...params) {
  const result = await pool.query(positional(sql), params);
  return result.rows;
}

export async function get(sql, ...params) {
  const result = await pool.query(positional(sql), params);
  return result.rows[0] ?? null;
}

export async function run(sql, ...params) {
  const result = await pool.query(positional(sql), params);
  return { changes: result.rowCount };
}

export async function migrate() {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  await pool.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())',
  );

  for (const name of files) {
    const applied = await pool.query(
      'SELECT 1 FROM schema_migrations WHERE name = $1',
      [name],
    );
    if (applied.rowCount > 0) continue;

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [
        name,
      ]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`migration ${name} failed: ${error.message}`);
    } finally {
      client.release();
    }
  }
}

export async function transaction(fn) {
  const client = await pool.connect();
  const scoped = {
    all: async (sql, ...params) => (await client.query(positional(sql), params)).rows,
    get: async (sql, ...params) =>
      (await client.query(positional(sql), params)).rows[0] ?? null,
    run: async (sql, ...params) => ({
      changes: (await client.query(positional(sql), params)).rowCount,
    }),
  };
  try {
    await client.query('BEGIN');
    const result = await fn(scoped);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function close() {
  await pool.end();
}

export default { all, get, run, transaction, migrate, close };
