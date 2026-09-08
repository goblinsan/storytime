/**
 * How much an agent may do without being asked.
 *
 * The setting was stored, validated, returned in three payloads, and read by
 * nothing: three radio buttons that changed nothing, on the page whose whole
 * job is telling agents what they may do. These are the two decisions it now
 * makes, and the one thing it must never be able to override.
 *
 * That last one is the reason this file exists. `autonomous_explore` lets an
 * agent write canon that no person will read first, so the boundary of what it
 * may touch is the boundary of the damage. A protected record has to stay
 * untouched whatever the mode says.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const connectionString = process.env.CONTESORA_TEST_DATABASE_URL || process.env.STORYTIME_TEST_DATABASE_URL;
if (!connectionString) throw new Error('CONTESORA_TEST_DATABASE_URL is not set.');
process.env.CONTESORA_DATABASE_URL = connectionString;

let db;
let autonomy;
let projectId;

beforeAll(async () => {
  db = await import('../db.js');
  await db.migrate();
  autonomy = await import('../autonomy.js');
});

afterAll(async () => {
  await db.run('TRUNCATE stories CASCADE');
  await db.close();
});

beforeEach(async () => {
  await db.run('TRUNCATE stories CASCADE');
  projectId = randomUUID();
  await db.run(
    `INSERT INTO stories (id, title, author, description, content, type, created_at, updated_at)
     VALUES (?, 'A Universe', '', '', '', 'universe', now(), now())`, projectId,
  );
});

const givenCharacter = async ({ protectedRecord = false } = {}) => {
  const id = randomUUID();
  await db.run(
    `INSERT INTO characters (id, project_id, name, description, is_protected)
     VALUES (?, ?, 'Somebody', 'as written', ?)`, id, projectId, protectedRecord,
  );
  return id;
};

const setMode = (mode) =>
  db.run('UPDATE stories SET autonomy_mode = ? WHERE id = ?', mode, projectId);

describe('what each mode decides', () => {
  it('defaults to assisted, and to assisted for a universe that is not there', async () => {
    expect(await autonomy.autonomyOf(projectId)).toBe('assisted');
    // A universe that has been deleted mid-answer must not read as the most
    // permissive mode by accident.
    expect(await autonomy.autonomyOf('no-such-universe')).toBe('assisted');
  });

  it('cannot be set to a mode nobody recognises', async () => {
    // The database holds this, not just the route: a mode that reached the
    // column another way would be a mode nothing validated.
    await expect(
      db.run("UPDATE stories SET autonomy_mode = 'whatever' WHERE id = ?", projectId),
    ).rejects.toThrow(/autonomy_mode/);
  });

  it('only manual stops an answer, and only autonomous writes one down', () => {
    expect(autonomy.mayAnswer('manual')).toBe(false);
    expect(autonomy.mayAnswer('assisted')).toBe(true);
    expect(autonomy.mayAnswer('autonomous_explore')).toBe(true);

    expect(autonomy.mayAcceptUnread('manual')).toBe(false);
    expect(autonomy.mayAcceptUnread('assisted')).toBe(false);
    expect(autonomy.mayAcceptUnread('autonomous_explore')).toBe(true);
  });
});

describe('writing an answer into canon', () => {
  it('writes the fields it was given', async () => {
    const id = await givenCharacter();
    const result = await autonomy.acceptIntoCanon(id, {
      description: 'quiet, and watching',
      traits: ['patient', 'exact'],
    });

    expect(result.accepted).toBe(true);
    const row = await db.get('SELECT description, traits FROM characters WHERE id = ?', id);
    expect(row.description).toBe('quiet, and watching');
    expect(JSON.parse(row.traits)).toEqual(['patient', 'exact']);
  });

  it('refuses a protected record, whatever the mode is set to', async () => {
    // The one thing autonomy may not override. A person marked this record as
    // not to be touched; handing the rest of the universe to an agent is not
    // an instruction to touch it.
    await setMode('autonomous_explore');
    const id = await givenCharacter({ protectedRecord: true });

    const result = await autonomy.acceptIntoCanon(id, { description: 'rewritten' });
    expect(result.accepted).toBe(false);
    expect(result.why).toMatch(/protected/);

    const row = await db.get('SELECT description FROM characters WHERE id = ?', id);
    expect(row.description, 'the record is untouched').toBe('as written');
  });

  it('writes nothing when the answer holds no canon field', async () => {
    // An answer carrying only keys this does not know about must not become an
    // UPDATE with no assignments, and must not report success either.
    const id = await givenCharacter();
    const result = await autonomy.acceptIntoCanon(id, { nickname: 'Bo', mood: 'grim' });

    expect(result.accepted).toBe(false);
    const row = await db.get('SELECT description FROM characters WHERE id = ?', id);
    expect(row.description).toBe('as written');
  });

  it('says so when the character is gone', async () => {
    const result = await autonomy.acceptIntoCanon(randomUUID(), { description: 'x' });
    expect(result.accepted).toBe(false);
    expect(result.why).toMatch(/gone/);
  });

  it('will not write a field that is not on the canon list', async () => {
    // The list is the boundary of what an agent may change unread, so a key
    // that is a real column but not a canon field must still be ignored.
    const id = await givenCharacter();
    await autonomy.acceptIntoCanon(id, { name: 'Renamed', description: 'kept' });

    const row = await db.get('SELECT name, description FROM characters WHERE id = ?', id);
    expect(row.name, 'a name is not something an agent may change unread').toBe('Somebody');
    expect(row.description).toBe('kept');
  });
});
