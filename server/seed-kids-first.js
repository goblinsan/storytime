/**
 * Seed script: Realm of the Crossing Universe Encyclopedia.
 *
 * Reframes the StoryTime MVP seed as a setting encyclopedia whose durable canon
 * feeds downstream campaigns, stories, screenplays, and game concepts.
 *
 * Preserves existing project IDs and generated canon without duplicates or data loss.
 * Run with:  node --env-file=.env server/seed-kids-first.js
 */

import { randomUUID } from 'crypto';
import db from './db.js';

const SEED_PROJECT_ID = '3763a3f2-7fcc-40f7-bd2d-973845d3d03f';
const now = new Date().toISOString();

const UNIVERSE_TITLE = 'Realm of the Crossing: Frontier Universe';
const UNIVERSE_AUTHOR = 'StoryTime Universe Archive';
const UNIVERSE_DESCRIPTION =
  'A compact setting encyclopedia for the Realm of the Crossing — a frontier universe of ' +
  'mist-shrouded pine forests, basalt sea-walls, ancient watchtowers, and conflicting factions. ' +
  'Serves as the durable canon catalog that feeds downstream campaigns, stories, screenplays, ' +
  'and game concepts.';

async function runSeed() {
  await db.migrate();

  // 1. Check if seed project exists (by ID or legacy titles)
  let project = await db.get(
    'SELECT id, title, type FROM stories WHERE id = ? OR title = ? OR title = ? OR title = ?',
    SEED_PROJECT_ID,
    UNIVERSE_TITLE,
    'StoryTime MVP Campaign Seed',
    'Search & Rescue: Pinewhistle Woods',
  );

  let projectId = project?.id || SEED_PROJECT_ID;

  if (project) {
    console.log(`Found existing project: ${project.id} ("${project.title}")`);
    console.log('Reframing project as Universe Encyclopedia...');
    await db.run(
      `UPDATE stories
       SET title = ?, author = ?, description = ?, type = 'universe', updated_at = ?
       WHERE id = ?`,
      UNIVERSE_TITLE,
      UNIVERSE_AUTHOR,
      UNIVERSE_DESCRIPTION,
      now,
      project.id,
    );
  } else {
    console.log(`Creating new Universe Encyclopedia project: ${projectId}`);
    await db.run(
      `INSERT INTO stories (id, title, author, description, content, type, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'universe', ?, ?)`,
      projectId,
      UNIVERSE_TITLE,
      UNIVERSE_AUTHOR,
      UNIVERSE_DESCRIPTION,
      '',
      now,
      now,
    );
  }

  // 2. Ensure Bestiary entries exist
  const bestiaryCount = await db.get(
    'SELECT count(*)::int as n FROM bestiary WHERE project_id = ?',
    projectId,
  );

  if (bestiaryCount.n === 0) {
    console.log('Seeding initial bestiary catalog...');
    const creatures = [
      {
        name: 'Slime Queen',
        category: 'Aberration / Slime',
        hearts: 8,
        tactics: ['Crown removal weakens her', 'Ruler of sunken crypts', 'Acid pulse'],
        status: 'defeated',
        description: 'Former ruler of the subterranean Crossing crypts. Her arcane power was anchored to her crown.',
        notes: 'Crown stolen by the Rogue; residual slime clusters remain active.',
      },
      {
        name: 'Lesser Slimes',
        category: 'Ooze',
        hearts: 2,
        tactics: ['Reanimate via necro-tech', 'Harmless in solitude, corrosive in swarms'],
        status: 'active',
        description: 'Magical ooze remnants infused with ancient Crossing runoff.',
        notes: 'Tends to respond to rhythmic resonance or heat.',
      },
      {
        name: 'Pinewhistle Mini-Goblins',
        category: 'Humanoid / Goblinoid',
        hearts: 2,
        tactics: ['Use volatile sap bombs', 'Concealed trench traps', 'Swarm with numbers'],
        status: 'active',
        description: 'Tree-dwelling scouts of the northern forest who use explosive resin and underground tunnels.',
        notes: 'Disrupt northern merchant caravans.',
      },
      {
        name: 'Pinewhistle Goblin Chief',
        category: 'Humanoid / Goblinoid',
        hearts: 5,
        tactics: ['Directs bomb barrages', 'Retreats to tunnels if disarmed'],
        status: 'active',
        description: 'Cunning warband leader armed with scavenged watchtower gear.',
        notes: 'Coordinates with subterranean dens.',
      },
      {
        name: 'Harbor Skimmer',
        category: 'Beast',
        hearts: 3,
        tactics: ['Glides low over water', 'Distracted by thrown fish'],
        status: 'active',
        description: 'Large coastal avian with glass-sharp talons native to the island shores.',
        notes: 'Used by harbor watchmen as weather omens.',
      },
    ];

    for (const c of creatures) {
      await db.run(
        `INSERT INTO bestiary (id, project_id, name, category, hearts, tactics, status, description, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        randomUUID(),
        projectId,
        c.name,
        c.category,
        c.hearts,
        JSON.stringify(c.tactics),
        c.status,
        c.description,
        c.notes,
        now,
        now,
      );
    }
  }

  // 3. Ensure Factions exist
  const factionCount = await db.get(
    'SELECT count(*)::int as n FROM factions WHERE project_id = ?',
    projectId,
  );

  if (factionCount.n === 0) {
    console.log('Seeding initial factions...');
    const factions = [
      {
        name: 'Tallgate Loyalists',
        description: 'Guardians of the fortress town, dedicated to sacred oaths and safe harbor.',
        goals: ['Maintain maritime law', 'Defend coastal roads', 'Contain goblin dens'],
      },
      {
        name: 'Merchant Skeptics',
        description: 'Dockside commercial syndicate seeking to deregulate border tariffs and open trade.',
        goals: ['Bypass iron tariffs', 'Establish independent sea corridors'],
      },
      {
        name: 'Pinewhistle Goblin Clans',
        description: 'Tribe controlling the northern tree line and subterranean iron pits.',
        goals: ['Reclaim ancestral ridge lines', 'Ambush high-value supply lines'],
      },
    ];

    for (const f of factions) {
      await db.run(
        `INSERT INTO factions (id, project_id, name, description, goals)
         VALUES (?, ?, ?, ?, ?)`,
        `faction-${randomUUID().slice(0, 8)}`,
        projectId,
        f.name,
        f.description,
        JSON.stringify(f.goals),
      );
    }
  }

  // 4. Ensure Timeline Events exist
  const timelineCount = await db.get(
    'SELECT count(*)::int as n FROM timeline_events WHERE project_id = ?',
    projectId,
  );

  if (timelineCount.n === 0) {
    console.log('Seeding initial timeline events...');
    const events = [
      {
        date: 'Era of the Crossing, 42 Rainwane',
        title: 'Fall of the Slime Queen',
        description: 'The party dethroned the Slime Queen in the deep crypts beneath Tallgate, breaking her subterranean hold.',
      },
      {
        date: 'Era of the Crossing, 1 Frostfall',
        title: 'The Great Forest Treaty Renewal',
        description: 'Tallgate commanders and frontier rangers convened to review border treaties as goblin skirmishes rose.',
      },
      {
        date: 'Era of the Crossing, 14 Frostfall',
        title: 'The Quenching of the Watchtower Beacon',
        description: 'The high beacon north of Pinewhistle Woods went dark under mysterious circumstances, signaling open conflict.',
      },
    ];

    for (const e of events) {
      await db.run(
        `INSERT INTO timeline_events (id, project_id, date, title, description)
         VALUES (?, ?, ?, ?, ?)`,
        `event-${randomUUID().slice(0, 8)}`,
        projectId,
        e.date,
        e.title,
        e.description,
      );
    }
  }

  // 5. Final dimension counts check
  const [chars, locs, facs, times, beasts, drafts] = await Promise.all([
    db.get('SELECT count(*)::int as n FROM characters WHERE project_id = ?', projectId),
    db.get('SELECT count(*)::int as n FROM locations WHERE project_id = ?', projectId),
    db.get('SELECT count(*)::int as n FROM factions WHERE project_id = ?', projectId),
    db.get('SELECT count(*)::int as n FROM timeline_events WHERE project_id = ?', projectId),
    db.get('SELECT count(*)::int as n FROM bestiary WHERE project_id = ?', projectId),
    db.get('SELECT count(*)::int as n FROM generated_drafts WHERE project_id = ?', projectId),
  ]);

  console.log('\n--- Universe Encyclopedia Seed Status ---');
  console.log(`Project ID: ${projectId}`);
  console.log(`Title: ${UNIVERSE_TITLE}`);
  console.log(`Type: universe`);
  console.log(`Characters: ${chars.n}`);
  console.log(`Locations: ${locs.n}`);
  console.log(`Factions: ${facs.n}`);
  console.log(`Timeline Events: ${times.n}`);
  console.log(`Bestiary Entries: ${beasts.n}`);
  console.log(`Generated Drafts: ${drafts.n}`);
  console.log('Seed execution completed successfully.');
}

runSeed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failure:', err);
    process.exit(1);
  });
