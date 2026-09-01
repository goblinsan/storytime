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
        name: 'Slime Queen Remnants',
        category: 'Ooze / Arcane Abberation',
        hearts: 6,
        tactics: ['Acid pulse wave', 'Divide on heavy impact', 'Dissolves organic armor'],
        status: 'active',
        description: 'Sentient colonial ooze nourished by alchemical vitriol and runic silt draining from the sunken High Anvil Shrine.',
        notes: 'Preserves fragmented memories of swallowed miners; responds violently to alkaline mining runoff.',
        inUniverseBackstory: 'Originating from the Sub-Aquifer of the First Conjunction, where pre-Crossing distillation vaults cracked open during the Great Tectonic Fracture. Not mere mindless slime, but an ancient symbiotic colonial intelligence that metabolizes toxic regional mineral runoff and sings in acoustic subterranean frequencies.',
        motivation: 'To reclaim sulfurous drainage corridors beneath Harbor Village, neutralize chemical smelter waste, and protect its incubating vitriol heart-core.',
        ecologicalNiche: 'Apex benthic decomposer in the sunken aqueducts; prevents toxic volcanic gas pockets from erupting beneath the harbor settlements, though its corrosive secretions erode stone canal vaults.',
        demographicAdaptations: {
          all_ages: {
            summary: 'A giant wobbling, jelly-like queen slime that glides through the ancient water tunnels looking for shiny brass buttons and honey biscuits.',
            simplifiedTactics: ['Big jelly bounce', 'Sticky bubble trap', 'Splits into silly giggling jelly-blobs'],
            hearts: 4,
            guidance: 'Can be calmed with sweet food or driven off by shining warm lanterns; non-lethal and colorful.',
          },
          tabletop_rpg: {
            challengeRating: 'CR 5 (1,800 XP)',
            combatRole: 'Amorphous Controller & Acidic Hazard',
            encounterPressure: 'Acidic spray degrades non-magical armor (-1 AC cumulative on DC 14 Dex save); standing water becomes difficult terrain.',
            lairAction: 'Summons an acidic surge from sewer grates on initiative count 20.',
            lootHook: 'Crystallized Vitriol Core (180 gp alchemical reagent) and a corroded brass signet ring from a forgotten royal courier.',
          },
          adult_fiction: {
            proseTexture: 'An undulating amber mass suspended with half-dissolved timber beams and ossified hands; its membrane ripples with sickly iridescent oils that smell of ozone and wet copper.',
            moralAmbiguity: 'Destroying the queen cures the canal corrosion but unleashes pent-up subterranean gases, poisoning the lower tenement quarters.',
            horrorOrMajesty: 'A tragic entity humming the forgotten songs of dead stonemasons caught in the Conjunction flood.',
          },
        },
      },
      {
        name: 'Pinewhistle Goblin Chief',
        category: 'Humanoid / Sylvan Tactician',
        hearts: 5,
        tactics: ['Directs bomb barrages', 'Smokebomb retreat', 'Deploys resin deadfall traps'],
        status: 'active',
        description: 'Cunning warband chieftain of the displaced mountain clans, wielding scavenged armor and volatile turpentine ordnance.',
        notes: 'Controls northern canopy ropeways; seeks leverage against merchant guild logging concessions.',
        inUniverseBackstory: 'Heir to the indigenous mountain clans displaced when the Harbor Syndicate paved the northern trade road over ancestral burial mounds. Trained in guerrilla warfare, the Chief synthesizes explosive resin from sacred ironwood sap to fight a defensive war of attrition against colonial garrisons.',
        motivation: 'Halt timber clearing along the high ridges, secure emergency food provisions before the harsh Frostbreak season, and ransom captured scouts for water-right concessions.',
        ecologicalNiche: 'Canopy apex strategist and clan guardian; coordinates seasonal foraging and maintains secret water-catchment terrace networks.',
        demographicAdaptations: {
          all_ages: {
            summary: 'A clever forest goblin wearing an oversized cooking-pot helmet and brass goggles who defends his tree fort with sticky pinecone sap bombs.',
            simplifiedTactics: ['Sticky sap launcher', 'Zip-line escape', 'Whistle for tree-scout backup'],
            hearts: 4,
            guidance: 'Enjoys good riddles and music; will trade safe passage if the heroes help fix his broken wagon or share sweet apples.',
          },
          tabletop_rpg: {
            challengeRating: 'CR 3 (700 XP)',
            combatRole: 'Tactical Trapper & Skirmish Commander',
            encounterPressure: 'Nimble Escape allows Bonus Action Disengage/Hide; commands 2 scouts to fire resin bombs causing Blinded / Restrained conditions.',
            lairAction: 'Cuts a counterweighted rope releasing a swinging log trap (3d6 bludgeoning, DC 13 Dex save).',
            lootHook: 'Chief detailed charcoal map of secret highland tunnels and 3 vials of volatile Refined Ironwood Resin.',
          },
          adult_fiction: {
            proseTexture: 'Skin the color of dry moss, cross-hatched with burn scars from volatile distillations; his voice is a dry rasping bark seasoned by campfire smoke and mountain wind.',
            moralAmbiguity: 'The party discovers the Chief was once a decorated scout for the Crown who was betrayed and left for dead when his homeland was auctioned.',
            systemicImpact: 'His capture exposes corrupt logging charters signed by prominent Harbor Syndicate councilors.',
          },
        },
      },
      {
        name: 'Pinewhistle Mini-Goblins',
        category: 'Humanoid / Sylvan Scout',
        hearts: 2,
        tactics: ['Volatile sap bombs', 'Concealed pit snares', 'Swarm coordination'],
        status: 'active',
        description: 'Swift sylvan skirmishers navigating canopy ropeways and trench tunnels with explosive resin pots.',
        notes: 'Skirmishers tasked with slowing down merchant caravans.',
        inUniverseBackstory: 'Young agile scouts of the Pinewhistle Clans raised in the high branches. Intimately familiar with every hollow trunk and root cavity, they use guerrilla harassment to repel heavily armored expeditions without risking direct melee.',
        motivation: 'Protect the clan hidden valley crèche, gather provisions, and drive off trespassers with psychological scare-tactics.',
        ecologicalNiche: 'Canopy navigators and forest sentinels; harvest explosive pitch from infested pines, preventing catastrophic wildfire spread.',
        demographicAdaptations: {
          all_ages: {
            summary: 'Playful tree-climbing goblins who love tossing acorn poppers and playing hide-and-seek among the tree crowns.',
            simplifiedTactics: ['Acorn popper', 'Silly face distraction', 'Scramble up a branch'],
            hearts: 2,
            guidance: 'Easily startled by loud friendly laughter or treats; they never fight to injure, only to play tricks.',
          },
          tabletop_rpg: {
            challengeRating: 'CR 1/2 (100 XP each)',
            combatRole: 'Swarming Ambusher',
            encounterPressure: 'Pack Tactics grants advantage on attack rolls when allies are within 5 ft; bonus action hide in foliage.',
            lootHook: 'Pouch of dried forest berries and a carved wooden whistle that mimics bird calls.',
          },
          adult_fiction: {
            proseTexture: 'Gaunt youths with soot-darkened eyes and fingers stained indelibly orange from boiling pitch; moving like feral shadows between the needle branches.',
            moralAmbiguity: 'The adventurers realize these dreaded monsters are malnourished teenagers defending their younger siblings.',
          },
        },
      },
      {
        name: 'Harbor Skimmer',
        category: 'Beast / Coastal Raptor',
        hearts: 3,
        tactics: ['Low skimming dive', 'Distracted by fresh fish', 'Piercing sonic squawk'],
        status: 'active',
        description: 'Giant coastal osprey with translucent silica-hardened talons native to the sea-cliffs of the Crossing Strait.',
        notes: 'Sacred to the Stormweaver mariners as barometric weather omens.',
        inUniverseBackstory: 'Bred along the jagged basalt bluffs where silica-saturated marine geothermal vents mineralize the talons of indigenous cliff-raptors. Revered by island navigators because their inner ear canal vibrates in harmony with impending supernatural storm fronts.',
        motivation: 'Safeguard cliffside clutch-nests, catch pelagic shoals churned up by the tide, and defend nesting thermals from airships and fireworks.',
        ecologicalNiche: 'Apex marine aerial predator; keeps venomous reef-eels from overpopulating the shallow tidal pools.',
        demographicAdaptations: {
          all_ages: {
            summary: 'A magnificent giant sea-eagle with sparkling crystal talons that glides over the docks and catches tossed fish from friendly sailors.',
            simplifiedTactics: ['Wing gust breeze', 'Playful hat snatch', 'Warning squawk'],
            hearts: 3,
            guidance: 'Can be befriended with fresh sardines; will guide lost boats through sea fog.',
          },
          tabletop_rpg: {
            challengeRating: 'CR 2 (450 XP)',
            combatRole: 'Aerial Skirmisher & Harrier',
            encounterPressure: 'Flyby trait prevents opportunity attacks; piercing screech causes Deafened condition on DC 12 Con save.',
            lootHook: 'Flawless silica talon (can be forged into a +1 dagger or finesse piercing dart).',
          },
          adult_fiction: {
            proseTexture: 'A razor-winged silhouette eight paces across, slicing through the salt spray with the hiss of scythed silk; its talons glistening like serrated quartz.',
            systemicImpact: 'When the skimmers abandon the cliffs en masse, it is the sole warning of an oceanic trench rift capable of wiping out the harbor with a tidal wall.',
          },
        },
      },
    ];

    for (const c of creatures) {
      await db.run(
        `INSERT INTO bestiary (
           id, project_id, name, category, hearts, tactics, status, description, notes,
           in_universe_backstory, motivation, ecological_niche, demographic_adaptations,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        randomUUID(),
        projectId,
        c.name,
        c.category,
        c.hearts,
        JSON.stringify(c.tactics),
        c.status,
        c.description,
        c.notes,
        c.inUniverseBackstory,
        c.motivation,
        c.ecologicalNiche,
        JSON.stringify(c.demographicAdaptations),
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

  // 5. Ensure Derivative Campaign exists
  const derivCount = await db.get(
    'SELECT count(*)::int as n FROM derivative_works WHERE project_id = ?',
    projectId,
  );

  if (derivCount.n === 0) {
    console.log('Seeding initial campaign derivative work...');
    const campaignContent = `# Search & Rescue: Pinewhistle Woods
## Campaign Overview & Playable Packet
A high-stakes frontier rescue expedition launched from Tallgate Keep into the mist-shrouded Pinewhistle Woods.

### Setting Premise
Goblins have seized key ridge lines north of the harbor, disrupting supply convoys and taking captives from the frontier roads.

### Key Operatives & Cast
- **Captain Elara Stormweaver**: Garrison commander coordinating rescue intelligence.
- **Trade Master Lyra Seafort**: Logistics officer managing rations and recovery rewards.
- **The Loyalist Scouts**: Frontline trackers guiding the party across the border.

### Staging Grounds & Locations
- **Harbor Village & Trade Hub**: Staging grounds and rumor gathering.
- **Pinewhistle Woods Perimeter**: Ambush choke points and traps.
- **The High Anvil Shrine**: Ancient ruined watchtower used as a fortified forward base.

### Primary Opposition & Threats
- **Pinewhistle Goblin Chief**: Wily tactician utilizing bomb traps and swarm tactics.
- **Pinewhistle Mini-Goblins**: Disruptive skirmishers.
- **Slime Queen Remnants**: Unpredictable underground hazards.

### Opening Scenario
The campaign opens at dusk at the Harbor Village trade gates as an unescorted cart arrives from the northern road, carrying an injured scout and news of captured scouts in the deep pines.`;

    const sourceCanon = [
      { entityType: 'character', entityId: 'char-elara', name: 'Captain Elara Stormweaver' },
      { entityType: 'character', entityId: 'char-lyra', name: 'Trade Master Lyra Seafort' },
      { entityType: 'location', entityId: 'loc-harbor', name: 'Harbor Village' },
      { entityType: 'location', entityId: 'loc-shrine', name: 'The High Anvil Shrine' },
      { entityType: 'faction', entityId: 'fac-loyalists', name: 'Harbor Loyalists' },
      { entityType: 'bestiary', entityId: 'beast-chief', name: 'Pinewhistle Goblin Chief' },
    ];

    await db.run(
      `INSERT INTO derivative_works (
         id, project_id, type, title, description, status, content, source_canon_references, metadata
       ) VALUES (?, ?, 'campaign', ?, ?, 'ready', ?, ?, ?)`,
      'deriv-crossing-campaign-01',
      projectId,
      'Search & Rescue: Pinewhistle Woods',
      'A high-stakes frontier rescue campaign into Pinewhistle Woods to break the goblin line and extract missing scouts back to Tallgate Keep.',
      campaignContent,
      JSON.stringify(sourceCanon),
      JSON.stringify({ sessionCount: 4, levelRange: 'Levels 1-3', tableReady: true }),
    );
  }

  // 6. Final dimension counts check
  const [chars, locs, facs, times, beasts, drafts, derivs] = await Promise.all([
    db.get('SELECT count(*)::int as n FROM characters WHERE project_id = ?', projectId),
    db.get('SELECT count(*)::int as n FROM locations WHERE project_id = ?', projectId),
    db.get('SELECT count(*)::int as n FROM factions WHERE project_id = ?', projectId),
    db.get('SELECT count(*)::int as n FROM timeline_events WHERE project_id = ?', projectId),
    db.get('SELECT count(*)::int as n FROM bestiary WHERE project_id = ?', projectId),
    db.get('SELECT count(*)::int as n FROM generated_drafts WHERE project_id = ?', projectId),
    db.get('SELECT count(*)::int as n FROM derivative_works WHERE project_id = ?', projectId),
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
  console.log(`Derivative Works: ${derivs.n}`);
  console.log('Seed execution completed successfully.');
}

runSeed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failure:', err);
    process.exit(1);
  });
