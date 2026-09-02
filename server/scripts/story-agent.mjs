#!/usr/bin/env node
/**
 * story-agent.mjs
 * CLI tool enabling local AI agents (Claude Code, Codex, Antigravity, Aider, etc.)
 * running on your Mac to inspect the universe encyclopedia, generate review dossiers,
 * and directly update novel prose in StoryTime.
 *
 * Usage:
 *   node server/scripts/story-agent.mjs list-chapters [projectId]
 *   node server/scripts/story-agent.mjs dossier <chapterId>
 *   node server/scripts/story-agent.mjs encyclopedia [projectId]
 *   node server/scripts/story-agent.mjs update <chapterId> <path/to/revised-prose.md>
 */

import fs from 'fs';
import path from 'path';
import pg from 'pg';

const DEFAULT_PROJECT_ID = 'de11bcbe-9c8f-4378-a299-c8be3d07c0af'; // Void Requiem

function getDbPool() {
  const connStr = process.env.STORYTIME_DATABASE_URL;
  if (!connStr) {
    throw new Error('STORYTIME_DATABASE_URL is not set. Run with node --env-file=.env ...');
  }
  return new pg.Pool({ connectionString: connStr });
}

function safeJson(val, fallback) {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

async function listChapters(pool, projectId = DEFAULT_PROJECT_ID) {
  const res = await pool.query(
    `SELECT id, title, type, status, metadata->>'wordCount' as words, created_at
     FROM derivative_works
     WHERE project_id = $1 AND type = 'story'
     ORDER BY created_at ASC`,
    [projectId]
  );
  console.log(`\n=== Story Chapters for Project: ${projectId} ===\n`);
  for (const row of res.rows) {
    console.log(`- ID: ${row.id}`);
    console.log(`  Title: ${row.title} (${row.words || 0} words) [${row.status}]`);
  }
  console.log('');
}

async function getEncyclopedia(pool, projectId = DEFAULT_PROJECT_ID) {
  const [storyRes, charRes, locRes, facRes, timeRes, bestRes] = await Promise.all([
    pool.query(`SELECT id, title, description, content FROM stories WHERE id = $1`, [projectId]),
    pool.query(`SELECT id, name, role, importance, background, motivation, traits FROM characters WHERE project_id = $1`, [projectId]),
    pool.query(`SELECT id, name, description, region_type FROM locations WHERE project_id = $1`, [projectId]),
    pool.query(`SELECT id, name, description, goals FROM factions WHERE project_id = $1`, [projectId]),
    pool.query(`SELECT id, title, date, description FROM timeline_events WHERE project_id = $1`, [projectId]),
    pool.query(`SELECT id, name, category, description, in_universe_backstory FROM bestiary WHERE project_id = $1`, [projectId]),
  ]);

  const output = {
    project: storyRes.rows[0],
    characters: charRes.rows,
    locations: locRes.rows,
    factions: facRes.rows,
    timelineEvents: timeRes.rows,
    bestiary: bestRes.rows,
  };

  console.log(JSON.stringify(output, null, 2));
}

async function getDossier(pool, chapterId) {
  const dRes = await pool.query(`SELECT * FROM derivative_works WHERE id = $1`, [chapterId]);
  if (dRes.rows.length === 0) {
    throw new Error(`Chapter derivative work not found: ${chapterId}`);
  }
  const chapter = dRes.rows[0];
  const projectId = chapter.project_id;

  const [storyRes, charRes, locRes, facRes, timeRes] = await Promise.all([
    pool.query(`SELECT * FROM stories WHERE id = $1`, [projectId]),
    pool.query(`SELECT * FROM characters WHERE project_id = $1`, [projectId]),
    pool.query(`SELECT * FROM locations WHERE project_id = $1`, [projectId]),
    pool.query(`SELECT * FROM factions WHERE project_id = $1`, [projectId]),
    pool.query(`SELECT * FROM timeline_events WHERE project_id = $1`, [projectId]),
  ]);

  const story = storyRes.rows[0];
  const characters = charRes.rows;
  const locations = locRes.rows;
  const factions = facRes.rows;
  const timelineEvents = timeRes.rows;
  const metadata = safeJson(chapter.metadata, {});
  const beats = metadata?.structure?.sections || metadata?.acts || [];

  const textLower = ((chapter.content || '') + ' ' + (chapter.description || '')).toLowerCase();
  const relevantChars = characters.filter((c) => {
    const n = c.name.toLowerCase();
    return textLower.includes(n) || c.importance === 'principal';
  });

  const relevantLocs = locations.filter((l) => textLower.includes(l.name.toLowerCase()));
  const relevantFactions = factions.filter((f) => textLower.includes(f.name.toLowerCase()));

  const words = chapter.content ? chapter.content.trim().split(/\s+/).length : 0;

  const doc = [
    `# Editorial Review Dossier: ${chapter.title}`,
    ``,
    `> **Universe**: ${story?.title || 'Universe'}`,
    `> **Chapter ID**: \`${chapter.id}\` | **Current Words**: ${words} | **Status**: \`${chapter.status}\``,
    ``,
    `---`,
    ``,
    `## 1. Narrative Mission & Premise`,
    `**Title**: ${chapter.title}`,
    `**Premise**: ${chapter.description || 'N/A'}`,
    ``,
    `### Scene Beats / Plot Structure`,
    beats.length > 0
      ? beats.map((b, i) => `${i + 1}. **${b.title}**: ${b.summary || ''}`).join('\n')
      : `_No discrete beats outlined._`,
    ``,
    `---`,
    ``,
    `## 2. Current Draft Prose Under Review`,
    ``,
    `\`\`\`markdown`,
    chapter.content || '_No draft text populated._',
    `\`\`\``,
    ``,
    `---`,
    ``,
    `## 3. Scoped Ground-Truth Lore (From Encyclopedia)`,
    ``,
    `### Key Personas`,
    relevantChars.map((c) => {
      const traits = Array.isArray(c.traits) ? c.traits : safeJson(c.traits, []);
      return `- **${c.name}** [${(c.importance || 'supporting').toUpperCase()} / ${c.role || 'Key Figure'}]\n` +
             `  - Motivation: ${c.motivation || 'N/A'}\n` +
             `  - Background: ${c.background || 'N/A'}\n` +
             `  - Traits: ${traits.join(', ') || 'N/A'}`;
    }).join('\n\n'),
    ``,
    `### Settings & Geography`,
    relevantLocs.length > 0
      ? relevantLocs.map((l) => `- **${l.name}**: ${l.description || 'N/A'}`).join('\n')
      : `_Outer rim void and derelict sectors._`,
    ``,
    `### Relevant Factions`,
    relevantFactions.length > 0
      ? relevantFactions.map((f) => `- **${f.name}**: ${f.description || f.goals || 'N/A'}`).join('\n')
      : `_Corporate syndicates & rim scavengers._`,
    ``,
    `### Key Timeline Crises`,
    timelineEvents.slice(0, 4).map((e) => `- **${e.date ?? '?'} - ${e.title}**: ${e.description || ''}`).join('\n'),
    ``,
    `---`,
    ``,
    `## 4. Editorial Review Rubric`,
    `Review this draft for:`,
    `1. Canon fidelity against character motivations, physical cybernetic descriptions, and faction terminology.`,
    `2. Visceral, literary atmosphere with strong sensory grounding.`,
    `3. Dynamic show-don't-tell action and emotional depth during flashbacks.`,
    ``,
    `---`,
    ``,
    `## 5. Direct Update Command`,
    `Once you have revised this prose, you can apply it directly to the database with:`,
    `\`node --env-file=.env server/scripts/story-agent.mjs update ${chapter.id} <path/to/revised.md>\``,
  ].join('\n');

  console.log(doc);
}

async function updateProse(pool, chapterId, filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Revised prose file not found: ${filePath}`);
  }
  const newContent = fs.readFileSync(filePath, 'utf8').trim();
  const wordCount = newContent.split(/\s+/).length;

  const res = await pool.query(
    `UPDATE derivative_works
     SET content = $1,
         metadata = jsonb_set(
           jsonb_set(COALESCE(metadata, '{}'::jsonb), '{isComposedProse}', 'true'),
           '{wordCount}', to_jsonb($2::int)
         ),
         updated_at = NOW()
     WHERE id = $3
     RETURNING id, title, updated_at`,
    [newContent, wordCount, chapterId]
  );

  if (res.rows.length === 0) {
    throw new Error(`Chapter ${chapterId} not found to update.`);
  }

  console.log(`\nSuccessfully updated "${res.rows[0].title}" (${chapterId})!`);
  console.log(`Word Count: ${wordCount} words.`);
  console.log(`Timestamp: ${res.rows[0].updated_at}\n`);
}

async function main() {
  const [,, cmd, arg1, arg2] = process.argv;
  if (!cmd) {
    console.log(`
Usage:
  node --env-file=.env server/scripts/story-agent.mjs list-chapters [projectId]
  node --env-file=.env server/scripts/story-agent.mjs dossier <chapterId>
  node --env-file=.env server/scripts/story-agent.mjs encyclopedia [projectId]
  node --env-file=.env server/scripts/story-agent.mjs update <chapterId> <path/to/revised.md>
`);
    process.exit(1);
  }

  const pool = getDbPool();
  try {
    switch (cmd) {
      case 'list-chapters':
        await listChapters(pool, arg1);
        break;
      case 'dossier':
        if (!arg1) throw new Error('Missing chapterId argument');
        await getDossier(pool, arg1);
        break;
      case 'encyclopedia':
        await getEncyclopedia(pool, arg1);
        break;
      case 'update':
        if (!arg1 || !arg2) throw new Error('Usage: update <chapterId> <path/to/revised.md>');
        await updateProse(pool, arg1, arg2);
        break;
      default:
        console.error(`Unknown command: ${cmd}`);
        process.exit(1);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('\nError:', err.message);
  process.exit(1);
});
