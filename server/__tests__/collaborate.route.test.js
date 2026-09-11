import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const connectionString = process.env.CONTESORA_TEST_DATABASE_URL || process.env.STORYTIME_TEST_DATABASE_URL;
if (!connectionString) throw new Error('CONTESORA_TEST_DATABASE_URL is not set.');
process.env.CONTESORA_DATABASE_URL = connectionString;

// An agent that writes down what it was asked and answers in one sentence.
const heard = path.join(os.tmpdir(), `collaborate-heard-${process.pid}.txt`);
const stub = path.join(os.tmpdir(), `collaborate-stub-${process.pid}.sh`);
writeFileSync(stub, `#!/bin/sh\ncat > "${heard}"\nif [ -n "$COLLAB_REPLY_FILE" ]; then cat "$COLLAB_REPLY_FILE"; else echo "Nothing recorded says she has a sister."; fi\n`);
chmodSync(stub, 0o755);

let db;
let app;
let P;

beforeAll(async () => {
  db = await import('../db.js');
  await db.migrate();
  await db.run('TRUNCATE stories CASCADE');
  app = (await import('../app.js')).default;
  P = (await request(app).post('/api/stories').send({ title: 'Talking it over' })).body.id;
  await db.run("INSERT INTO characters (id, project_id, name, role, background) VALUES ('ch-mara', ?, 'Mara Sunder', 'Pilot', 'Raised on freighters by her aunt.')", P);
  await db.run("INSERT INTO characters (id, project_id, name, role) VALUES ('ch-teo', ?, 'Teodor Ren', 'Refugee')", P);
  process.env.CONTESORA_CANON_AGENT_COMMAND = stub;
});

afterAll(async () => {
  delete process.env.CONTESORA_CANON_AGENT_COMMAND;
  await db.run('TRUNCATE stories CASCADE');
  await db.close();
});

const ask = (body) => request(app).post('/api/collaborate/ask').send(body);

describe('talking a record over', () => {
  it('answers from the record, what else is recorded, and what was already said', async () => {
    const res = await ask({
      kind: 'character', id: 'ch-mara', fields: ['background'],
      thread: [{ role: 'author', text: 'Who raised her?' }, { role: 'agent', text: 'Her aunt, on freighters.' }],
      question: 'Does she have a sister?',
    });
    expect(res.status).toBe(200);
    expect(res.body.answer).toBe('Nothing recorded says she has a sister.');
    const prompt = readFileSync(heard, 'utf8');
    expect(prompt).toMatch(/THE CHARACTER: Mara Sunder/);
    expect(prompt).toMatch(/History: Raised on freighters by her aunt\./);
    expect(prompt).toMatch(/THE AUTHOR IS LOOKING AT: background/);
    expect(prompt).toMatch(/Characters: Mara Sunder \(Pilot\); Teodor Ren \(Refugee\)/);
    expect(prompt).toMatch(/Author: Who raised her\?\nYou: Her aunt, on freighters\./);
    expect(prompt).toMatch(/THE AUTHOR ASKS: Does she have a sister\?$/m);
  });

  // An answer once said nothing connected two events the chronicle records
  // in sequence: the conversation was never shown the sequence.
  it('knows where an event sits: what it is part of, and what comes before and after', async () => {
    await db.run("INSERT INTO timeline_events (id, project_id, title, date, year) VALUES ('ev-fall', ?, 'The Fall', '299', 299)", P);
    await db.run(`INSERT INTO timeline_events (id, project_id, title, date, year, parent_id, before_event_ids)
      VALUES ('ev-defense', ?, 'The Defense', '301', 301, 'ev-fall', '["ev-breach"]')`, P);
    await db.run(`INSERT INTO timeline_events (id, project_id, title, date, year, parent_id, after_event_ids)
      VALUES ('ev-breach', ?, 'The Breach', '303', 303, 'ev-fall', '["ev-defense"]')`, P);
    expect((await ask({ kind: 'event', id: 'ev-defense', question: 'What follows it?' })).status).toBe(200);
    const prompt = readFileSync(heard, 'utf8');
    expect(prompt).toMatch(/Part of: The Fall/);
    expect(prompt).toMatch(/It comes before: The Breach/);
    await ask({ kind: 'event', id: 'ev-fall', question: 'What is in it?' });
    expect(readFileSync(heard, 'utf8')).toMatch(/What happened inside it: The Defense; The Breach/);
  });

  it('talks about the universe itself', async () => {
    const res = await ask({ kind: 'universe', id: P, question: 'What is this for?' });
    expect(res.status).toBe(200);
    expect(readFileSync(heard, 'utf8')).toMatch(/THE UNIVERSE: Talking it over/);
  });

  it('asks for a question, and for something to talk about', async () => {
    expect((await ask({ kind: 'character', id: 'ch-mara', question: '  ' })).status).toBe(400);
    expect((await ask({ kind: 'character', id: 'nobody', question: 'Who?' })).status).toBe(404);
    expect((await ask({ kind: 'spaceship', id: 'x', question: 'Who?' })).status).toBe(404);
  });

  it('proposes only new records of kinds it may make, placed inside what exists', async () => {
    await db.run("INSERT INTO locations (id, project_id, name) VALUES ('pl-nexus', ?, 'Nexus Prime')", P);
    const reply = path.join(os.tmpdir(), `collaborate-reply-${process.pid}.json`);
    writeFileSync(reply, JSON.stringify({ records: [
      { kind: 'character', name: 'Ilsa Sunder', brief: "Mara's older sister, lost in the belt." },
      { kind: 'character', name: 'teodor ren', brief: 'Already recorded, in other letters.' },
      { kind: 'place', name: 'Sunder Dock', inside: 'nexus prime', brief: 'Where the sisters grew up.' },
      { kind: 'spaceship', name: 'The Cinnabar', brief: 'Not a kind that is made here.' },
      { kind: 'act', name: 'Act Four', brief: 'An act, but this is not an arc.' },
    ] }));
    process.env.COLLAB_REPLY_FILE = reply;
    try {
      const res = await request(app).post('/api/collaborate/propose-records').send({
        kind: 'character', id: 'ch-mara', thread: [{ role: 'author', text: 'Did she have a sister?' }],
      });
      expect(res.status).toBe(200);
      expect(res.body.projectId).toBe(P);
      expect(res.body.records).toEqual([
        { kind: 'character', name: 'Ilsa Sunder', brief: "Mara's older sister, lost in the belt.", parentId: null, parentName: null },
        { kind: 'place', name: 'Sunder Dock', brief: 'Where the sisters grew up.', parentId: 'pl-nexus', parentName: 'Nexus Prime' },
      ]);
      expect(readFileSync(heard, 'utf8')).toMatch(/Author: Did she have a sister\?/);
    } finally {
      delete process.env.COLLAB_REPLY_FILE;
    }
  });

  it('asks for a made record to be written, carrying the conversation', async () => {
    process.env.CONTESORA_CANON_AGENT = 'off';
    try {
      const made = (await request(app).post('/api/characters').send({ projectId: P, name: 'Ilsa Sunder' })).body.id;
      const res = await request(app).post('/api/collaborate/write').send({
        records: [{ kind: 'character', id: made, brief: "Mara's older sister." }],
        thread: [{ role: 'author', text: 'Did she have a sister?' }, { role: 'agent', text: 'Nothing says so.' }],
      });
      expect(res.status).toBe(200);
      expect(res.body.filed).toBe(9);
      const asked = await db.all("SELECT payload FROM generated_drafts WHERE project_id = ? AND payload->>'characterId' = ?", P, made);
      expect(asked).toHaveLength(9);
      const brief = asked[0].payload.brief;
      expect(brief).toMatch(/^Mara's older sister\./);
      expect(brief).toMatch(/Author: Did she have a sister\?\nYou: Nothing says so\./);
    } finally {
      delete process.env.CONTESORA_CANON_AGENT;
    }
  });

  it('says so when the agent is turned off', async () => {
    process.env.CONTESORA_CANON_AGENT = 'off';
    try {
      const res = await ask({ kind: 'character', id: 'ch-mara', question: 'Who?' });
      expect(res.status).toBe(503);
    } finally {
      delete process.env.CONTESORA_CANON_AGENT;
    }
  });
});
