# StoryTime Typed Hierarchical Lore Generation Task Taxonomy

This document establishes the architecture, task families, and input/output contracts for StoryTime's typed hierarchical lore generation system.

It replaces the monolithic `draft_campaign_asset_bundle` pattern with a scoped, discrete task model where StoryTime acts as the authoritative lorebook and canon database, and local LLMs act as bounded refinement workers receiving small, self-contained fact packets.

---

## 1. Architectural Philosophy: Bounded Incremental Lore

### 1.1 The Context Problem in Local LLM Worldbuilding
Asking a local model (3B to 24B parameters) to produce a broad campaign bundle in a single pass forces it to:
1. Invent multiple orthogonal lore dimensions (cosmology, politics, geography, characters, events) simultaneously.
2. Maintain referential integrity across dozens of self-invented IDs.
3. Avoid duplicating existing canon without having the full context in memory.
4. Fit large JSON schemas within narrow context windows, causing output truncation (`Unterminated string in JSON`) or generic repetitive prose.

### 1.2 The StoryTime Hierarchical Solution
StoryTime is the permanent store of truth. Worldbuilding progresses through **iterative hierarchical refinement**:
- **Root-Down Expansion**: High-level macro structures are established first (eras, continents, cultural spheres). Subsequent tasks refine one specific child node (a decade within an era, a settlement within a biome, a family lineage of an NPC).
- **Leaf-Up Anchoring**: Granular encounter pressures, local rumors, or dungeon rooms do not reinvent cosmic laws; they reference existing parent canon IDs and add strictly localized details.
- **Bounded Fact Packets**: Instead of dumping the entire world into the prompt, the harness queries StoryTime for only the immediate parent, direct siblings, and explicit anchor facts required for that specific task (< 1,500 tokens of input context).
- **Single-Responsibility Outputs**: A task generates exactly one type of lore increment. A settlement task does not invent deities; a timeline refinement task does not invent new regional biomes.

```
                   [Cosmology / Space]
                            │
                    [Planetary Realm]
                            │
               ┌────────────┴────────────┐
         [Continent A]             [Continent B]
               │
        [Regional Biome]
        (The Ashen Coast)
               │
      ┌────────┴────────┐
[Settlement]       [Wild Frontier]
(Deep Quay)        (Sunken Shrines)
      │                   │
[House / District]  [Subterranean Lair]
      │                   │
[Family / NPCs]     [Creature Mob / Encounter]
```

---

## 2. Global Scoping and Bounded Context Contract

Every lore generation task on the project dashboard declares its taxonomy family via its labels and task metadata:

```json
{
  "jobType": "lore_<family>_refinement",
  "storytimeProjectId": "3763a3f2-7fcc-40f7-bd2d-973845d3d03f",
  "parentEntityId": "loc-ashen-coast",
  "parentEntityType": "location",
  "scopeLevel": "settlement",
  "brief": "Detail the port settlement of Deep Quay...",
  "focus": "settlements",
  "mustReference": ["loc-ashen-coast", "faction-salt-council"],
  "avoid": ["modern technology", "apocalyptic scale"]
}
```

### 2.1 Fact Packet Budget Rules
To ensure high-quality, non-truncated JSON responses on 3B–24B local models:
1. **Input Context Limit**: Total context packet supplied to the model must remain under **1,500 tokens** (~1,000 words).
2. **Context Composition**:
   - `storySummary`: 1-2 sentences of high-level setting tone.
   - `parentEntity`: Full record of the parent entity being refined.
   - `siblingEntities`: Up to 4 existing sibling IDs and names to prevent overlap.
   - `anchorEntities`: Explicit entities listed in `mustReference`.
   - `thematicConstraints`: Specific `avoid` guidelines and cultural tone tags.
3. **Output Size Limit**: Target output generation between **300 and 800 tokens** (one clean JSON object).

---

## 3. The 14 First-Class Task Families

Below are the 14 core task families covering every dimension of StoryTime lore generation.

---

### Family 1: Cosmology & Space (`lore_cosmology_refinement`)
- **Objective**: Establish celestial bodies, orbital mechanics, astral planes, seasonal cycles, and cosmological laws.
- **Parent/Child Scope**:
  `Universe -> Astral Sphere / Dimension -> Planetary System -> Primary Planet -> Moons / Celestial Rings`.
- **Required Input Fact Types**:
  - Cosmic setting premise (e.g. planar cosmology, heliocentric solar system, or mythological firmament).
  - Parent celestial body or plane ID.
- **Optional Context Fact Types**:
  - Associated deities or fundamental magical forces.
  - Ancient creation myth summaries.
- **Allowed Output Object Types**:
  - `celestialBodies`: IDs, astronomical names, orbital role, visible manifestations (e.g. phases, tides, eclipses), and mythic significance.
  - `cosmicPlanes`: Dimensional boundaries, transit requirements, environmental laws.
- **Forbidden Output Object Types**:
  - Ground-level settlements, individual characters, localized political factions, detailed historical dates.
- **Canon Reference Rules**:
  - Celestial body IDs use `celestial-<name>` (e.g. `celestial-twin-moons`).
  - Planar IDs use `plane-<name>` (e.g. `plane-ashen-abyss`).
- **Validation & Gate Rules**:
  - Must define at least one observable impact on the world below (e.g. tidal cycle, magical alignment).
  - No duplicate celestial names.

---

### Family 2: Geography & Wilderness (`lore_geography_refinement`)
- **Objective**: Define landmasses, mountain ranges, river networks, natural biomes, climate zones, and frontier wilderness.
- **Parent/Child Scope**:
  `Planet -> Continent -> Regional Biome -> Geographical Feature / Sub-region -> Specific Terrain Zone / Hazard Area`.
- **Required Input Fact Types**:
  - Parent geography entity ID (e.g. continent or regional biome).
  - Climate and elevation parameters.
- **Optional Context Fact Types**:
  - Bordering water bodies or mountain barriers.
  - Known economic resources (e.g. salt marshes, iron veins).
- **Allowed Output Object Types**:
  - `regions`: IDs, names, terrain classification (e.g. coastal tundra, volcanic trench, tidal marsh), natural barriers, weather phenomena.
  - `naturalHazards`: Environmental pressures, seasonal storms, natural transit bottlenecks.
- **Forbidden Output Object Types**:
  - Artificial buildings, military garrison structures, individual NPC stat blocks, tavern rumors.
- **Canon Reference Rules**:
  - Region IDs use `loc-region-<slug>` or `loc-geo-<slug>`.
  - Must declare parent geography ID in `parentLocationId`.
- **Validation & Gate Rules**:
  - Child region must adhere to parent climate classification (no tropical jungle inside an arctic tundra without explicit magical anomaly explanation).
  - Terrain descriptions must be unique; duplicate names rejected.

---

### Family 3: Settlements & Urban Enclaves (`lore_settlement_refinement`)
- **Objective**: Establish cities, harbor ports, frontier outposts, mining camps, and their internal districts.
- **Parent/Child Scope**:
  `Regional Biome -> Territory -> Settlement -> District / Quarter -> Specific Street / Landmark / Building`.
- **Required Input Fact Types**:
  - Parent location ID (region/biome where settlement sits).
  - Primary settlement function (e.g. trading port, military fortress, pilgrimage sanctuary, smuggler haven).
- **Optional Context Fact Types**:
  - Dominant controlling faction.
  - Major trade resource or dependency.
- **Allowed Output Object Types**:
  - `settlement`: Name, settlement scale (hamlet, village, town, city, metropolis), defense/walls, water/food source.
  - `districts`: Names, character of district, primary trades, architectural style.
  - `landmarks`: Key focal structures (watchtower, breakwater, market pavilion, grand forge).
- **Forbidden Output Object Types**:
  - Global geopolitical treaties, cosmic planar mechanics, monster species origins.
- **Canon Reference Rules**:
  - Settlement ID: `loc-settlement-<slug>`. District ID: `loc-district-<slug>`. Landmark ID: `loc-landmark-<slug>`.
- **Validation & Gate Rules**:
  - Must specify population scale and defensive posture.
  - All district names within the settlement must be distinct.

---

### Family 4: Factions & Politics (`lore_faction_refinement`)
- **Objective**: Define political guilds, noble houses, pirate councils, military orders, and their internal hierarchies.
- **Parent/Child Scope**:
  `Socio-political Sphere -> Major Faction / Government -> Sub-faction / Local Chapter / Cadre -> Inner Circle / Faction Cell`.
- **Required Input Fact Types**:
  - Parent faction ID or regional seat of power.
  - Stated public goal and underlying hidden pressure.
- **Optional Context Fact Types**:
  - Controlling leadership characters (if established in canon).
  - Allied and rival faction IDs.
- **Allowed Output Object Types**:
  - `faction`: Official title, heraldry/emblem, organizational hierarchy, public doctrine, secret agenda, initiation rites.
  - `resources`: Leverage points (naval tariffs, iron monopoly, mystical secrets).
  - `internalRivals`: Opposing factions or splinter cells.
- **Forbidden Output Object Types**:
  - Detailed geographical boundary coordinate maps, dungeon room layouts, discrete tactical stat blocks.
- **Canon Reference Rules**:
  - Faction ID: `faction-<slug>`. Sub-faction ID: `faction-<parent>-<slug>`.
- **Validation & Gate Rules**:
  - Must provide distinct public goal vs. hidden pressure.
  - Allied and rival IDs must refer to valid existing canon factions or declared peer factions.

---

### Family 5: History & Timelines (`lore_history_refinement`)
- **Objective**: Establish historical epochs, catastrophic turning points, treaty signings, and generational crises.
- **Parent/Child Scope**:
  `Cosmic Age (Millennium) -> Historical Era (Centuries) -> Epochal Crisis (Decade) -> Specific War / Campaign (Years) -> Critical Historical Event (Days/Months)`.
- **Required Input Fact Types**:
  - Anchor historical era or preceding event ID (`after`).
  - Participating factions, regions, or key historical figures.
- **Optional Context Fact Types**:
  - Fixed before/after canon sequence facts.
  - Lingering modern societal consequences.
- **Allowed Output Object Types**:
  - `timelineEvents`: Chronological milestone IDs, in-world calendar date / era designation, title, cause, resolution, historical fallout.
  - `historicalConsequences`: Enduring cultural scars, treaties signed, extinct houses.
- **Forbidden Output Object Types**:
  - Modern numeric calendar dates (e.g. 1998, 2024), present-day session encounter seeds, tactical battle maps.
- **Canon Reference Rules**:
  - Event ID: `event-<slug>`.
  - Must specify explicit `after` and optional `before` relationships to existing canon events.
- **Validation & Gate Rules**:
  - DAG contradiction check: generated before/after assertions must not create cycles or contradict canon timeline constraints.
  - Reject modern numeric Gregorian dates unless modern setting explicitly declared.

---

### Family 6: Religion, Faith & Belief (`lore_religion_refinement`)
- **Objective**: Detail deities, divine covenants, harbor superstitions, monastic orders, sacred taboos, and ritual rites.
- **Parent/Child Scope**:
  `Pantheon / Cosmic Principle -> Distinct Cult / Denomination -> Local Shrine / Monastic Chapter -> Specific Liturgy / Sacred Taboo`.
- **Required Input Fact Types**:
  - Associated divine archetype or celestial force.
  - Cultural origin or practicing faction ID.
- **Optional Context Fact Types**:
  - Opposing heretical sects or historical schisms.
  - Holy locations or relics.
- **Allowed Output Object Types**:
  - `faith`: Deity / Principle name, holy titles, core tenets, sacred symbols, funeral / wedding rites, sacred taboos.
  - `shrines`: Named sanctuary locations, relics guarded, attending priesthood titles.
- **Forbidden Output Object Types**:
  - Tactical divine magic spell lists, modern secular political ideologies, commercial transaction tables.
- **Canon Reference Rules**:
  - Faith ID: `faith-<slug>`. Shrine location ID: `loc-shrine-<slug>`.
- **Validation & Gate Rules**:
  - Must define at least one actionable taboo observed by believers.
  - Deities must have distinct portfolio and limitations.

---

### Family 7: Culture, Language & Customs (`lore_culture_refinement`)
- **Objective**: Establish languages, nautical idioms, naming conventions, culinary traditions, honorifics, and social etiquette.
- **Parent/Child Scope**:
  `Civilization / Ethno-cultural Sphere -> Regional Dialect -> Social Class Slang / Guild Cant -> Idiomatic Expressions & Naming Customs`.
- **Required Input Fact Types**:
  - Target cultural sphere or geographic origin.
  - Social strata (e.g. harbor commoners, aristocratic court, deep-sea navigators).
- **Optional Context Fact Types**:
  - Historical subjugations or migrant influences shaping the language.
- **Allowed Output Object Types**:
  - `namingConventions`: Family surname roots, given name phonemes, honorific prefixes, pejorative nicknames.
  - `idioms`: Phrases, origins, literal vs. implied meanings.
  - `customs`: Hospitality laws, debt rituals, greeting gestures.
- **Forbidden Output Object Types**:
  - Whole grammatical syntax dictionaries, character combat stats, economic price ledgers.
- **Canon Reference Rules**:
  - Culture ID: `culture-<slug>`. Dialect ID: `lang-<slug>`.
- **Validation & Gate Rules**:
  - Naming conventions must provide at least 3 male, 3 female, and 3 clan/surname examples.
  - Reject unpronounceable random fantasy apostrophe strings (e.g. `K'r'x'q`).

---

### Family 8: Characters & Family Lineages (`lore_character_refinement`)
- **Objective**: Define NPC backgrounds, generational lineage, kinship ties, personal secrets, and domestic relationships.
- **Parent/Child Scope**:
  `Ancestral House / Clan -> Grandparents / Generation 1 -> Parents / Generation 2 -> Protagonist / Siblings -> Heirs / Proteges`.
- **Required Input Fact Types**:
  - Primary character ID or founding house surname.
  - Social class, faction allegiance, and current location ID.
- **Optional Context Fact Types**:
  - Existing sibling or ancestral characters already in canon.
  - Significant historical event that shaped the family fortune.
- **Allowed Output Object Types**:
  - `characters`: Individual IDs, full names, generational tier, marital/blood relations, role, public persona, hidden grief/vulnerability.
  - `familyLegacy`: Heirloom relics, hereditary debts, ancestral oaths.
- **Forbidden Output Object Types**:
  - Global world-spanning treaties, creature ecology descriptions, complete city maps.
- **Canon Reference Rules**:
  - Character ID: `character-<slug>`.
  - Must link relationships using `{ target: "character-id", type: "parent|child|sibling|spouse|rival" }`.
- **Validation & Gate Rules**:
  - Names within the family tree must be distinct.
  - Generational chronological order must be consistent (children cannot be born before parents).

---

### Family 9: Creatures, Mobs & Ecology (`lore_creature_refinement`)
- **Objective**: Define native wildlife, monstrous predators, scavenger tribes, territorial behaviors, and hunting patterns.
- **Parent/Child Scope**:
  `Ecosystem / Biome -> Predator Class / Beast Genus -> Specific Species / Mob Tribe -> Pack Alpha / Broodmother -> Lair / Nesting Zone`.
- **Required Input Fact Types**:
  - Habitat location ID (biome, mountain pass, swamp, cave system).
  - Threat tier (e.g. nuisance vermin, territorial predator, apex frontier terror).
- **Optional Context Fact Types**:
  - Relationship to local settlements (e.g. preying on harbor fish traps, hunted for oil).
- **Allowed Output Object Types**:
  - `creature`: Species name, physical morphology, sensory adaptations, hunting tactics, weaknesses/vulnerabilities.
  - `mobBehavior`: Pack hierarchy, alarm signs, seasonal migration, territorial marking.
  - `harvestableYields`: Alchemical pelts, venoms, meat, or bone crafting components.
- **Forbidden Output Object Types**:
  - D&D 5e / Pathfinder copyright stat blocks, complex multi-page dungeons, sovereign political treaties.
- **Canon Reference Rules**:
  - Creature ID: `creature-<slug>`. Nest/Lair ID: `loc-lair-<slug>`.
- **Validation & Gate Rules**:
  - Must define ecological role (predator, scavenger, grazer, apex).
  - Must list at least one concrete behavioral tell or weakness.

---

### Family 10: Economy, Trade & Resources (`lore_economy_refinement`)
- **Objective**: Detail raw commodities, trade routes, currency systems, shipping monopolies, smuggling channels, and scarcity pressures.
- **Parent/Child Scope**:
  `Regional Trade Zone -> Primary Commodity / Monopoly -> Trade Route / Caravanserai -> Smuggling Network / Black Market`.
- **Required Input Fact Types**:
  - Producing region or settlement ID.
  - Consuming or dependent settlement ID.
- **Optional Context Fact Types**:
  - Controlling merchant faction or cartel.
  - Seasonal transit hazards.
- **Allowed Output Object Types**:
  - `commodity`: Resource name, extraction method, refined products, scarcity level.
  - `tradeRoute`: Route name, transit medium (coastal shipping, mountain pack trail), toll points, danger level.
  - `economicPressures`: Price inflations, black market markups, embargo impacts.
- **Forbidden Output Object Types**:
  - Full fantasy bank account simulations, individual character inventories, cosmology origin myths.
- **Canon Reference Rules**:
  - Route ID: `route-<slug>`. Commodity ID: `resource-<slug>`.
- **Validation & Gate Rules**:
  - Must declare which settlement produces and which imports the resource.
  - Economic friction or price pressure must be grounded in geographic or political barriers.

---

### Family 11: Technology, Magic & Arcane Laws (`lore_magic_technology_refinement`)
- **Objective**: Detail schools of magic, artificer traditions, navigational instruments, alchemical compounds, and magical limitations.
- **Parent/Child Scope**:
  `Arcane Principle / Paradigm -> Guild / Academy Tradition -> Specific Relic / Invention -> Component / Formula / Spell Manifestation`.
- **Required Input Fact Types**:
  - Fundamental nature of the power (e.g. blood sorcery, tidal alchemy, steam forge, clockwork artifice).
  - Practicing guild, order, or cultural tradition ID.
- **Optional Context Fact Types**:
  - Prohibited arcane practices (e.g. soul-binding, necrotic corrosion).
- **Allowed Output Object Types**:
  - `magicSystem` / `techSystem`: Discipline name, required catalyst, sensory manifestations (smell of ozone, cold smoke), strict limitations and backlash risks.
  - `inventions`: Named apparatuses, historical inventors, failure modes.
- **Forbidden Output Object Types**:
  - Omnipotent "anything goes" magic spells, modern electronics, world-ending superweapons.
- **Canon Reference Rules**:
  - Tradition ID: `tradition-<slug>`. Relic/Apparatus ID: `item-<slug>`.
- **Validation & Gate Rules**:
  - Every system must declare a **cost**, a **catalyst**, and a **failure mode**.
  - Must not violate established world physical boundaries.

---

### Family 12: Conflicts & Warfare (`lore_conflict_refinement`)
- **Objective**: Define border skirmishes, naval blockades, historic sieges, peasant uprisings, and cold proxy wars.
- **Parent/Child Scope**:
  `Geopolitical Tension -> Active War / Feud -> Specific Battle / Siege -> Critical Skirmish / Breach`.
- **Required Input Fact Types**:
  - Aggressor and defender faction IDs.
  - Contested territory or resource ID.
- **Optional Context Fact Types**:
  - Historical grievances from timeline events.
  - Neutral intermediary factions.
- **Allowed Output Object Types**:
  - `conflict`: Conflict title, casus belli, operational theaters, military tactics deployed, atrocities/turning points, current status (stalemate, siege, ceasefire).
  - `warFronts`: Contested trenches, blockade coordinates, scorched earth zones.
- **Forbidden Output Object Types**:
  - Instant total planetary annihilation, individual player combat actions.
- **Canon Reference Rules**:
  - Conflict ID: `conflict-<slug>`. Battle/Front ID: `event-battle-<slug>`.
- **Validation & Gate Rules**:
  - Participating belligerents must be valid existing canon factions.
  - Contested location must exist in canon.

---

### Family 13: Interaction Hooks & Rumors (`lore_interaction_hook_refinement`)
- **Objective**: Create tavern whispers, contradictory rumors, missing courier notices, dockside challenges, and immediate NPC conversation starters.
- **Parent/Child Scope**:
  `Settlement / Frontier Zone -> Social Gathering Hub -> Rumor Cluster -> Actionable Clue / Hook`.
- **Required Input Fact Types**:
  - Anchor settlement or tavern location ID.
  - At least 2 active canon characters or factions involved in the gossip.
- **Optional Context Fact Types**:
  - Recent timeline event or economic shortage.
- **Allowed Output Object Types**:
  - `rumors`: Rumor text, source speaker role (e.g. drunken harbor pilot, suspicious fishmonger), truth rating (`true`, `half-truth`, `deliberate falsehood`), inciting incident.
  - `hooks`: Concrete exploratory invitations (e.g. "Recover the locked ledger from the scuttled barge before midnight tide").
- **Forbidden Output Object Types**:
  - Railroading mandatory quest cutscenes, revelation of the entire world's deepest cosmic mysteries.
- **Canon Reference Rules**:
  - Hook ID: `hook-<slug>`. Rumor ID: `rumor-<slug>`.
- **Validation & Gate Rules**:
  - At least 1 rumor in the batch must be a `half-truth` or `deliberate falsehood`.
  - Must provide immediate spatial actionability within the target settlement.

---

### Family 14: Campaign & Session Material (`lore_session_prep_refinement`)
- **Objective**: Synthesize lore into D&D/TTRPG ready session modules: room-by-room cavern layouts, NPC dialogue prompts, and environmental hazard triggers.
- **Parent/Child Scope**:
  `Settlement / Wilderness Zone -> Specific Dungeon / Ruin / Venue -> Room / Chamber -> Encounter Element / Trap / Investigation Clue`.
- **Required Input Fact Types**:
  - Target dungeon or venue location ID.
  - Hostile creature or faction presence ID.
  - Narrative objective for the session.
- **Optional Context Fact Types**:
  - Known player character patron or rival hook.
- **Allowed Output Object Types**:
  - `sessionLocation`: Chamber breakdowns, sensory descriptions (lighting, smell, footing), tactical cover, environmental hazards.
  - `encounterPressures`: Patrol routes, reinforcement timers, negotiation leverage points.
  - `discoverableClues`: Documents, marked maps, dying whispers linking back to wider lore.
- **Forbidden Output Object Types**:
  - Global canon rewrites, world-scale geopolitics, retconning established history.
- **Canon Reference Rules**:
  - Room ID: `loc-chamber-<slug>`. Hazard ID: `hazard-<slug>`.
- **Validation & Gate Rules**:
  - Must fit within parent structure boundaries.
  - Clues must link back to valid canon factions or historical events.

---

## 4. Five Concrete Refinement Examples

The following examples show how the taxonomy refines lore from macro millennium scope down to minute encounter pressures.

---

### Example 1: Macro Millennium Timeline (`lore_history_refinement`)
- **Task Goal**: Establish 3,000 years of deep history for the realm of *Oakhaven & The Ashen Coast*.
- **Input Fact Packet**:
  ```json
  {
    "jobType": "lore_history_refinement",
    "storytimeProjectId": "3763a3f2-7fcc-40f7-bd2d-973845d3d03f",
    "scopeLevel": "age_scale",
    "brief": "Establish four major historical eras across the last three millennia before the founding of the Salt Council.",
    "mustReference": [],
    "avoid": ["modern years", "single-hero chosen-one narrative"]
  }
  ```
- **Allowed Output**:
  ```json
  {
    "jobType": "lore_history_refinement",
    "schemaVersion": 1,
    "timelineEvents": [
      {
        "id": "event-age-of-tides",
        "date": "First Millennium (approx. 3000 to 2100 Before Shrines)",
        "title": "The Drowned Zenith",
        "summary": "High coastal civilizations flourished using deep tidal hydrology before seismic subsidence collapsed the harbor atriums.",
        "after": [],
        "before": ["event-era-of-shattered-shores"]
      },
      {
        "id": "event-era-of-shattered-shores",
        "date": "Second Millennium (approx. 2100 to 1100 Before Shrines)",
        "title": "The Era of Shattered Shores",
        "summary": "Isolated clans waged skirmishes for high ground and freshwater wells, establishing the first blood-oaths on stone markers.",
        "after": ["event-age-of-tides"],
        "before": ["event-unification-of-iron"]
      },
      {
        "id": "event-unification-of-iron",
        "date": "Third Millennium (approx. 1100 to 150 Before Shrines)",
        "title": "The Iron Accord",
        "summary": "The monastic metallurgists of the Iron Faith forged deep anchor chains, stabilizing harbor silt and establishing sovereign port covenants.",
        "after": ["event-era-of-shattered-shores"],
        "before": ["event-founding-of-salt-council"]
      },
      {
        "id": "event-founding-of-salt-council",
        "date": "Year 1 of the Maritime Compact (150 Before Present)",
        "title": "The Harbor Partition",
        "summary": "Merchants broke the monastic monopoly on sea trade, drafting the Salt Council bylaws at Deep Quay.",
        "after": ["event-unification-of-iron"],
        "before": []
      }
    ]
  }
  ```

---

### Example 2: 50-Year Expansion of One Significant Event (`lore_history_refinement`)
- **Task Goal**: Expand the 50-year period of `event-unification-of-iron` into discrete, causal crisis milestones.
- **Input Fact Packet**:
  ```json
  {
    "jobType": "lore_history_refinement",
    "storytimeProjectId": "3763a3f2-7fcc-40f7-bd2d-973845d3d03f",
    "parentEntityId": "event-unification-of-iron",
    "parentEntityType": "timeline_event",
    "scopeLevel": "crisis_decade_scale",
    "brief": "Break the 50-year period preceding the Iron Accord into five causal turning points detailing the monastic rise to power.",
    "mustReference": ["faction-iron-faith", "loc-ashen-coast"],
    "avoid": ["modern dates", "dragon attacks"]
  }
  ```
- **Allowed Output**:
  ```json
  {
    "jobType": "lore_history_refinement",
    "schemaVersion": 1,
    "timelineEvents": [
      {
        "id": "event-iron-year-10",
        "date": "Year 10 of the Iron Siege",
        "title": "The Sinking of the Grain Galleys",
        "summary": "Storm surges sank the seasonal supply fleet; the Iron Faith opened underground grain vaults in exchange for mining rights.",
        "after": [],
        "before": ["event-iron-year-22"]
      },
      {
        "id": "event-iron-year-22",
        "date": "Year 22 of the Iron Siege",
        "title": "The First Chain Foundry",
        "summary": "Monks erected the Great Kiln at Deep Quay, casting links capable of tethering heavy stone breakwaters against riptides.",
        "after": ["event-iron-year-10"],
        "before": ["event-iron-year-35"]
      },
      {
        "id": "event-iron-year-35",
        "date": "Year 35 of the Iron Siege",
        "title": "The Salt Merchant Revolt",
        "summary": "Independent harbor captains refused the mandatory tithe of smelted ores, barricading the lower slipways.",
        "after": ["event-iron-year-22"],
        "before": ["event-iron-year-48"]
      },
      {
        "id": "event-iron-year-48",
        "date": "Year 48 of the Iron Siege",
        "title": "The Burning of the Slipways",
        "summary": "Iron Faith zealots quenched white-hot chains in the rebel docks, setting twenty trade hulks ablaze in a single night.",
        "after": ["event-iron-year-35"],
        "before": ["event-iron-year-50"]
      },
      {
        "id": "event-iron-year-50",
        "date": "Year 50 of the Iron Siege",
        "title": "The Signing of the Chain Concordat",
        "summary": "Captains accepted monastic harbor dues in exchange for permanent breakwater protection and salvage rights.",
        "after": ["event-iron-year-48"],
        "before": []
      }
    ]
  }
  ```

---

### Example 3: Faction Belief & Dogma Enrichment (`lore_religion_refinement`)
- **Task Goal**: Enrich canon faction *The Iron Faith* (`faction-faction-003`) with core tenets, holy relics, sacred taboos, and ritual greetings.
- **Input Fact Packet**:
  ```json
  {
    "jobType": "lore_religion_refinement",
    "storytimeProjectId": "3763a3f2-7fcc-40f7-bd2d-973845d3d03f",
    "parentEntityId": "faction-faction-003",
    "parentEntityType": "faction",
    "scopeLevel": "tenet_and_liturgy",
    "brief": "Detail the liturgical tenets, sacred taboos, and shrine practices of The Iron Faith.",
    "mustReference": ["faction-faction-003", "loc-old-guard"],
    "avoid": ["modern christian parallels", "undefeatable paladins"]
  }
  ```
- **Allowed Output**:
  ```json
  {
    "jobType": "lore_religion_refinement",
    "schemaVersion": 1,
    "faith": {
      "id": "faith-iron-covenant",
      "name": "The Unyielding Anchor",
      "factionId": "faction-faction-003",
      "publicTenets": [
        "What is forged in salt endures all tempests.",
        "A debt unbroken is a chain that holds the soul from the deep abyss.",
        "The sea takes only what the hand fails to clasp in iron."
      ],
      "sacredTaboos": [
        "Never strike an iron anvil during a storm's peak tide.",
        "Never cast unworked ore into deep ocean water without prayer.",
        "Never break an oath sealed by pressing a heated metal coin to the palm."
      ],
      "ritualGreeting": "May your anchors bite deep into living stone.",
      "shrineLocations": [
        {
          "id": "loc-shrine-chain-vault",
          "name": "The High Anvil of Old Guard",
          "summary": "A wave-lashed basalt crypt housing the first mooring chain ever cast on the coast."
        }
      ]
    }
  }
  ```

---

### Example 4: Cavern Encounter Pressure (`lore_creature_refinement`)
- **Task Goal**: Generate local subterranean predator pressures and cavern environmental threats directly under *Deep Quay*.
- **Input Fact Packet**:
  ```json
  {
    "jobType": "lore_creature_refinement",
    "storytimeProjectId": "3763a3f2-7fcc-40f7-bd2d-973845d3d03f",
    "parentEntityId": "loc-deep-quay",
    "parentEntityType": "location",
    "scopeLevel": "subterranean_encounter",
    "brief": "Define low-level cavern scavengers and environmental pressure inhabiting the tide-submerged caverns beneath Deep Quay.",
    "mustReference": ["loc-deep-quay"],
    "avoid": ["dragons", "mind flayers", "modern technology"]
  }
  ```
- **Allowed Output**:
  ```json
  {
    "jobType": "lore_creature_refinement",
    "schemaVersion": 1,
    "creature": {
      "id": "creature-barnacle-skulker",
      "name": "Barnacle Skulker",
      "habitatLocationId": "loc-deep-quay",
      "morphology": "Chitinous four-legged crustacean-humanoid scavengers with shell-encrusted plating that mimics wet stone.",
      "tactics": "They lurk in sea-cave crevices during low tide, dropping onto lone fishermen or salvage divers to sever breath hoses with serrated claws.",
      "weakness": "Direct lantern light blinds their unhooded stalk eyes, forcing a temporary retreat into tidal fissures.",
      "harvestableYield": "Crushed carapace yields watertight caulking pitch used by smugglers."
    },
    "environmentalHazard": {
      "id": "hazard-surge-siphon",
      "name": "The Drowning Siphon",
      "locationId": "loc-deep-quay",
      "summary": "Sudden tidal surges force seawater into low-ceilinged tunnels with enough hydrostatic pressure to trap swimmers against iron grate culverts."
    }
  }
  ```

---

### Example 5: Character Family Lineage (`lore_character_refinement`)
- **Task Goal**: Define three generations of family lineage for harbor warden *Cressa Vale* (`character-cressa-vale`).
- **Input Fact Packet**:
  ```json
  {
    "jobType": "lore_character_refinement",
    "storytimeProjectId": "3763a3f2-7fcc-40f7-bd2d-973845d3d03f",
    "parentEntityId": "character-cressa-vale",
    "parentEntityType": "character",
    "scopeLevel": "lineage_tree",
    "brief": "Draft the maternal and paternal lineage of Cressa Vale, showing how ancestral debt to the Salt Council dictates her current duties.",
    "mustReference": ["character-cressa-vale", "faction-salt-council", "loc-deep-quay"],
    "avoid": ["royal secret heritage", "modern slang"]
  }
  ```
- **Allowed Output**:
  ```json
  {
    "jobType": "lore_character_refinement",
    "schemaVersion": 1,
    "characters": [
      {
        "id": "character-aldus-vale",
        "name": "Aldus Vale (Grandfather)",
        "role": "Deep-Sea Salvager (Deceased)",
        "summary": "Dredged contraband relics from sunken galleys during the Great Storm; defaulted on an emergency loan from the Salt Council.",
        "relationships": [
          { "target": "character-maren-vale", "type": "parent" }
        ]
      },
      {
        "id": "character-maren-vale",
        "name": "Maren Vale (Mother)",
        "role": "Tidekeeper Scribe",
        "summary": "Inherited the grandfather's ledger debt and bound herself to the Salt Council's administrative chancery to keep her family off the prison barges.",
        "relationships": [
          { "target": "character-aldus-vale", "type": "child" },
          { "target": "character-cressa-vale", "type": "parent" }
        ]
      },
      {
        "id": "character-titus-vale",
        "name": "Titus Vale (Brother)",
        "role": "Runaway Smuggler",
        "summary": "Fled Deep Quay on a smuggler cutter to escape council enforcers, leaving Cressa alone to work off the family indenture.",
        "relationships": [
          { "target": "character-maren-vale", "type": "child" },
          { "target": "character-cressa-vale", "type": "sibling" }
        ]
      }
    ],
    "familyLegacy": {
      "heirloomName": "The Sea-Mark Seal",
      "summary": "A tarnished bronze signet stamped with the harbor warden's crest, passed down from Aldus with the warning that the council never burns a debt slip."
    }
  }
  ```

---

## 5. Promotion to Canon and Seeding Follow-Up Tasks

### 5.1 The Promotion Lifecycle
1. **Draft Intake**: Generated JSON payload stored in `generated_drafts` with status `generated`.
2. **Review & Approval**: The human operator inspects the draft in StoryTime's Draft Review UI and approves it (`status = 'accepted'`).
3. **Canon Promotion**:
   - The promotion engine (`POST /api/generated-drafts/:id/promote`) transactions the entities into canonical database tables (`characters`, `locations`, `factions`, `timeline_events`).
   - Every promoted row records its origin:
     - `source_draft_id`: The ID of the accepted draft.
     - `source_task_id`: The project-dashboard task that authorized the generation.
     - `parent_entity_id`: The hierarchical parent anchor.
   - `promoted_at` timestamp is set on `generated_drafts`.

### 5.2 Deterministic Child Task Seeding
Once an increment becomes canon, it can automatically seed next-tier child refinement tasks on the dashboard:

```
[Accepted Task 780: Regional Geopolitics]
                 │
                 ▼ (Promotes to Canon)
  New Canon Location: `loc-iron-garrison`
                 │
                 ▼ (Seeding Rules Triggered)
┌─────────────────────────────────────────────────────────────┐
│ Auto-created Dashboard Backlog Candidates:                  │
│                                                             │
│ 1. [lore_settlement_refinement]                             │
│    "Detail the barracks, armory, and mess hall of           │
│     loc-iron-garrison"                                      │
│                                                             │
│ 2. [lore_character_refinement]                              │
│    "Draft the garrison commander and junior lieutenants of  │
│     loc-iron-garrison"                                      │
│                                                             │
│ 3. [lore_interaction_hook_refinement]                       │
│    "Draft 3 rumors regarding stolen ammunition inside       │
│     loc-iron-garrison"                                      │
└─────────────────────────────────────────────────────────────┘
```

This deterministic pipeline ensures worldbuilding expands predictably into the areas operators and players care about without overwhelming the local LLM with unmanageable context packs.
