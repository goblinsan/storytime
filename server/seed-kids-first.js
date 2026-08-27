/**
 * Seed script: imports/DnD/kids-first reference files into the SQLite database.
 * Run with:  node server/seed-kids-first.js
 */

import { randomUUID } from 'crypto';
import db from './db.js';

const now = new Date().toISOString();

// ── 1. Project (story) ────────────────────────────────────────────────
const PROJECT_ID = randomUUID();

const existingProject = db.prepare(
  `SELECT id FROM stories WHERE title = 'Search & Rescue: Pinewhistle Woods'`
).get();

if (existingProject) {
  console.log('Project already exists — skipping seed to avoid duplicates.');
  console.log('Project ID:', existingProject.id);
  process.exit(0);
}

db.prepare(`
  INSERT INTO stories (id, title, author, description, content, type, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  PROJECT_ID,
  'Search & Rescue: Pinewhistle Woods',
  'Kids First Campaign',
  'A kids-first DnD campaign set in the Realm of the Crossing. The party investigates goblin trouble after celebrating their victory over the Slime Queen.',
  '',
  'campaign',
  now, now
);

console.log('Created project:', PROJECT_ID);

// ── 2. Story Arcs ─────────────────────────────────────────────────────
const arcs = [
  {
    arcNumber: 1,
    title: 'Aftermath of the Slime Queen',
    description: 'The party celebrates their victory and receives new rewards and rumours.',
    details: [
      'Celebration at Tallgate Keep',
      'Slime Gifts awarded',
      'Rumors of trouble to the north',
    ],
  },
  {
    arcNumber: 2,
    title: 'The Lost Cousin',
    description: 'A tavern hook sends the party north into Pinewhistle Woods.',
    details: [
      'Tavern hook via Finn the server',
      'Journey north along the road',
      'Enter Pinewhistle Woods',
    ],
  },
  {
    arcNumber: 3,
    title: 'Goblin Escalation',
    description: 'The party encounters increasingly dangerous goblin activity.',
    details: [
      'Warning bells and traps',
      'Bomb-throwing goblins',
      'Old watchtower encounter',
    ],
  },
  {
    arcNumber: 4,
    title: 'The Goblin Den',
    description: 'The party descends into the goblin underground to rescue Tobin.',
    details: [
      'Underground tunnels',
      'Prisoners and hoard',
      'Rescue of Tobin',
    ],
  },
  {
    arcNumber: 5,
    title: 'Consequences',
    description: 'The party returns to Tallgate Keep as growing heroes.',
    details: [
      'Return to Tallgate Keep',
      'Reputation grows',
      'New threats hinted beyond the mountains',
    ],
  },
];

const insertArc = db.prepare(`
  INSERT INTO story_arcs (id, project_id, arc_number, title, description, details, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

for (const arc of arcs) {
  insertArc.run(
    randomUUID(), PROJECT_ID,
    arc.arcNumber, arc.title, arc.description,
    JSON.stringify(arc.details),
    now, now
  );
}
console.log(`Inserted ${arcs.length} story arcs.`);

// ── 3. Party Characters (player characters) ───────────────────────────
const partyMembers = [
  {
    name: 'Cyborg-Necromancer',
    description: 'A fusion of lost technology and forbidden magic who experiments boldly, sometimes recklessly.',
    background: 'A fusion of lost technology and forbidden magic.',
    characterType: 'party',
    role: 'Ranged damage / weird magic',
    hearts: 10,
    coreSkills: ['Blast', 'Necro-Tech', 'Scan'],
    specialAbilities: ['Slime Overcharge', 'Adaptive Scan'],
    notableMoments: [
      'Successfully raised slime creatures (sometimes unpredictably)',
      'Tends to act impulsively ("pew pew" first, think later)',
    ],
    tendencies: 'High creativity; benefits from planning boosts or control upgrades.',
    location: 'Tallgate Keep',
    motivation: 'Experiments boldly with magic and technology.',
  },
  {
    name: 'Butterfly Princess',
    description: 'A gentle but brave fairy noble who believes kindness can change the world.',
    background: 'A gentle but brave fairy noble.',
    characterType: 'party',
    role: 'Support / flight / diplomacy',
    hearts: 10,
    coreSkills: ['Care', 'Flight', 'Magic'],
    specialAbilities: ['Slime Calm'],
    notableMoments: [
      'Tried diplomacy with the Slime Queen',
      'Chose to leave danger when instincts warned her',
    ],
    tendencies: 'Strong emotional intelligence; future potential as a peacemaker or healer.',
    location: 'Tallgate Keep',
    motivation: 'Believes kindness can change the world.',
  },
  {
    name: 'Dwarf',
    description: 'A seasoned warrior who trusts strength and courage above all else.',
    background: 'A seasoned warrior.',
    characterType: 'party',
    role: 'Frontline melee / tank',
    hearts: 10,
    coreSkills: ['Melee', 'Stone', 'Toughness'],
    specialAbilities: ['Stone-Bound Resilience'],
    notableMoments: [
      'Final blow against the Slime Queen',
      'Frequent "Leroy Jenkins" instincts',
    ],
    tendencies: 'Excellent under pressure; may gain leadership or defensive abilities.',
    location: 'Tallgate Keep',
    motivation: 'Trusts strength and courage above all else.',
  },
  {
    name: 'Rogue (Guide)',
    description: 'A clever wanderer who knows when to strike and when to vanish.',
    background: 'A clever wanderer.',
    characterType: 'party',
    role: 'Scout / trickster',
    hearts: 10,
    coreSkills: ['Sneak', 'Luck', 'Tricks'],
    specialAbilities: ["Queen-Slipped Shadows"],
    notableMoments: [
      "Stole the Slime Queen's crown",
      'Manipulated enemies with deception',
    ],
    tendencies: 'Strategic thinker; excellent candidate for utility and team buffs.',
    location: 'Tallgate Keep',
    motivation: 'Knows when to strike and when to vanish.',
  },
];

const insertChar = db.prepare(`
  INSERT INTO characters
    (id, project_id, name, description, background, traits, relationships,
     character_type, role, hearts, core_skills, special_abilities, notable_moments,
     tendencies, location, motivation, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

for (const c of partyMembers) {
  insertChar.run(
    randomUUID(), PROJECT_ID,
    c.name, c.description, c.background,
    '[]', '[]',
    c.characterType, c.role, c.hearts,
    JSON.stringify(c.coreSkills),
    JSON.stringify(c.specialAbilities),
    JSON.stringify(c.notableMoments),
    c.tendencies, c.location, c.motivation,
    now, now
  );
}
console.log(`Inserted ${partyMembers.length} party characters.`);

// ── 4. NPCs ───────────────────────────────────────────────────────────
const npcs = [
  {
    name: 'Finn',
    description: 'Tavern server at the Copper Ladle Tavern in Tallgate Keep.',
    background: 'Local to Tallgate Keep, works at the Copper Ladle Tavern.',
    characterType: 'npc',
    role: 'Quest giver',
    hearts: null,
    coreSkills: [],
    specialAbilities: [],
    notableMoments: [],
    tendencies: '',
    location: 'Copper Ladle Tavern, Tallgate Keep',
    motivation: 'Rescue cousin Tobin.',
  },
  {
    name: 'Tobin',
    description: 'Missing traveler captured by goblins, held in the Goblin Den.',
    background: 'Cousin of Finn. Traveler captured by goblins.',
    characterType: 'npc',
    role: 'Civilian, information source',
    hearts: null,
    coreSkills: [],
    specialAbilities: [],
    notableMoments: ['Rescued from the Goblin Den'],
    tendencies: '',
    location: 'Goblin Den (rescued)',
    motivation: 'Survive and return safely.',
  },
  {
    name: 'Captain of Tallgate Keep',
    description: 'Authority figure who grants rewards and issues missions to the party.',
    background: 'Military commander of Tallgate Keep.',
    characterType: 'npc',
    role: 'Authority figure',
    hearts: null,
    coreSkills: [],
    specialAbilities: [],
    notableMoments: [],
    tendencies: '',
    location: 'Tallgate Keep',
    motivation: 'Protect Tallgate Keep and its trade routes.',
  },
  {
    name: 'Quartermaster',
    description: 'Handles gear upgrades and equipment flavor for the party.',
    background: 'Logistics officer at Tallgate Keep.',
    characterType: 'npc',
    role: 'Gear upgrades, equipment flavor',
    hearts: null,
    coreSkills: [],
    specialAbilities: [],
    notableMoments: [],
    tendencies: '',
    location: 'Tallgate Keep',
    motivation: 'Keep the party well-equipped.',
  },
];

for (const c of npcs) {
  insertChar.run(
    randomUUID(), PROJECT_ID,
    c.name, c.description, c.background,
    '[]', '[]',
    c.characterType, c.role, c.hearts,
    JSON.stringify(c.coreSkills),
    JSON.stringify(c.specialAbilities),
    JSON.stringify(c.notableMoments),
    c.tendencies, c.location, c.motivation,
    now, now
  );
}
console.log(`Inserted ${npcs.length} NPCs.`);

// ── 5. Bestiary ───────────────────────────────────────────────────────
const bestiary = [
  {
    name: 'Slime Queen',
    category: 'Slime',
    hearts: null,
    tactics: ['Crown removal weakens her', 'Ruler of underground dungeon'],
    status: 'defeated',
    description: 'Former ruler of an underground dungeon. Her power is tied to her crown.',
    notes: 'Defeated — crown stolen by the Rogue.',
  },
  {
    name: 'Lesser Slimes',
    category: 'Slime',
    hearts: null,
    tactics: ['Raised via necro-tech', 'Harmless or unpredictable'],
    status: 'active',
    description: 'Magical remnants raised through necro-tech. Behaviour is harmless or unpredictable.',
    notes: '',
  },
  {
    name: 'Mini-Goblins',
    category: 'Goblin',
    hearts: 2,
    tactics: ['Use bombs', 'Set traps', 'Swarm with numbers'],
    status: 'active',
    description: 'Small goblins that rely on explosives, traps, and swarm tactics.',
    notes: '',
  },
  {
    name: 'Goblin Boss',
    category: 'Goblin',
    hearts: 4,
    tactics: ['Bomb-focus', 'Cowardly if disarmed'],
    status: 'active',
    description: 'Tougher goblin leader who fights aggressively until disarmed, then turns cowardly.',
    notes: '',
  },
];

const insertBestiary = db.prepare(`
  INSERT INTO bestiary (id, project_id, name, category, hearts, tactics, status, description, notes, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

for (const b of bestiary) {
  insertBestiary.run(
    randomUUID(), PROJECT_ID,
    b.name, b.category, b.hearts,
    JSON.stringify(b.tactics),
    b.status, b.description, b.notes,
    now, now
  );
}
console.log(`Inserted ${bestiary.length} bestiary entries.`);

// ── 6. Locations (world regions) ─────────────────────────────────────
const locations = [
  {
    name: 'Tallgate Keep',
    description: 'Fortified harbor town and trade hub. Quest origin for the party.',
    regionType: 'town',
    races: ['Humans', 'Dwarves'],
    politicalNotes: 'Protects trade routes; military authority resides here.',
  },
  {
    name: 'Glowwillow Crossing',
    description: 'Peaceful heartland protected by Tallgate Keep.',
    regionType: 'heartland',
    races: ['Humans', 'Fair Folk'],
    politicalNotes: 'Relies on Tallgate Keep for protection.',
  },
  {
    name: 'Pinewhistle Woods',
    description: 'Dense forest north of Tallgate Keep. Current goblin territory and site of the main campaign.',
    regionType: 'forest',
    races: ['Goblins'],
    politicalNotes: 'Goblins disrupt roads and test Tallgate defenses.',
  },
  {
    name: 'Dragontooth Mountains',
    description: 'Mountain range running north-south with strong dwarven influence.',
    regionType: 'mountain',
    races: ['Dwarves'],
    politicalNotes: 'Dwarves hold mountain passes against Far-Lands threats.',
  },
  {
    name: 'Far-Lands',
    description: 'Eastern badlands — a Mordor-like region held back by mountain strongholds.',
    regionType: 'badlands',
    races: [],
    politicalNotes: 'Far-Lands pressure may increase as the balance shifts.',
  },
];

const insertLocation = db.prepare(`
  INSERT INTO locations (id, project_id, name, description, region_type, races, political_notes)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

for (const l of locations) {
  insertLocation.run(
    randomUUID(), PROJECT_ID,
    l.name, l.description, l.regionType,
    JSON.stringify(l.races),
    l.politicalNotes
  );
}
console.log(`Inserted ${locations.length} locations.`);

console.log('\nSeed complete. Project ID:', PROJECT_ID);
