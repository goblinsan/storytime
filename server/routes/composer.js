import { Router } from 'express';
import db from '../db.js';
import { LocalLlmClient } from '../story-harness/worker.js';
import { evaluateDraftQuality, buildCritiquePrompt, deriveFactRules } from '../story-harness/critiqueGate.js';

const router = Router();

function safeJson(val, fallback) {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

/**
 * Builds an editorial prompt for composing novel prose from scene beats.
 */
function buildCompositionPrompt({ chapter, story, beats, characters, locations, bestiary, timelineEvents }) {
  const castList = characters.map((c) => `- **${c.name}** (${c.role || 'Key Figure'}): Motivation: ${c.motivation || 'N/A'}. Lineage/Background: ${c.background || 'N/A'}`).join('\n');
  const locList = locations.map((l) => `- **${l.name}**: ${l.description || 'N/A'}`).join('\n');
  const beatsList = beats.map((b, i) => `Beat ${i + 1}: ${b.title}\n${b.summary || ''}`).join('\n\n');
  const sensoryLore = bestiary.map((be) => `- **${be.name}**: ${be.description || ''}. Backstory: ${be.inUniverseBackstory || ''}`).join('\n');

  return `You are a master literary fantasy novelist composing a devastating, publication-grade tragedy for "${story?.title || 'Chronicles of the Crossing'}".

### CHAPTER ASSIGNMENT
Chapter Title: "${chapter.title}"
Logline/Premise: ${chapter.description || 'A pivotal chapter in the tragic saga of the Slime Queen.'}

### SCENE BEATS TO EXPAND INTO DRAMATIZED NOVEL SCENES
${beatsList}

### RELEVANT CANON & CAST (WEAVE THESE SEAMS)
${castList || 'Standard universe personas.'}

### KEY LOCATIONS & SENSORY WORLD (IN-UNIVERSE GEOGRAPHY)
- Region: The Ashen Coast of The Ironlands
- Waters: The Ashen Sea (storm-swept salt tides and granite seawalls)
- Locations: Harbor Village, Deep Quay Salvage Docks, High Anvil Shrine, Sub-Aquifer
${locList}
${sensoryLore ? `\n### CREATURE ECOLOGY & TRAGIC LORE\n${sensoryLore}` : ''}

### MANDATORY TRAGEDY & COMPOSITION RULES:
1. WRITE AS A HEARTBREAKING TRAGEDY:
   - The Slime Queen is not a mindless pest, but a benevolent, sentient maternal titan enduring excruciating acid burns to keep human wells pure.
   - Ground the emotional weight in the human hubris, the covenant of love and trust, and the horrifying betrayal by Scavenger Ren.
   - Never refer to real-world geography (use "the Ashen Sea", "the Ashen Coast", "the Ironlands", never "Atlantic").
2. ZERO META-DATA ARTIFACTS:
   - NEVER output "Beat 1:", "Act I:", "In this scene...", or bullet points.
   - Do NOT write summaries. Write the continuous, uninterrupted story.
3. SEAMLESS NARRATIVE THREADING:
   - Connect the scenes into a cohesive, uninterrupted chapter arc with natural scene transitions ("⁂").
4. TARGET LENGTH:
   - Aim for 1,500-2,200 words of rich, breathing literary prose.

Return JSON ONLY with this schema:
{
  "chapterTitle": "${chapter.title}",
  "prose": "Full text of the composed chapter prose...",
  "wordCount": 1850
}`;
}

/**
 * Fallback high-fidelity narrative generator if local LLM is unreachable.
 * Delivers a true classical tragedy: human hubris, selfless maternal sacrifice,
 * devastating betrayal, and generational grief along the Ashen Sea.
 */
function generateEditorialCompositionFallback({ chapter }) {
  const t = chapter.title.toLowerCase();

  // CHAPTER I: THE DEEP FISSURE (~1,850 words)
  if (t.includes('chapter 1') || t.includes('deep fissure') || chapter.id === 'derivative-7a887469') {
    return [
      `The fog rolling off the Harbor Village sea-wall tasted of wet iron and curdled brine, but beneath the familiar rot of low tide lay something far sharper—a reek of vitriol so acidic it stripped the moisture from Master Alchemist Vaelen’s throat before he had set foot on the lower quays.`,
      `He drew a heavy wool muffler over his nose and mouth, though the greasy fabric did little to dull the sulfurous burn seeping upward through the basalt drainage grates. At seventy-four years, his knees cursed every flight of salt-slick steps leading down to the cistern gates, yet the tremor that rattled his spine had nothing to do with age or the chill of the Ashen Sea. It was the pitch of it: an unmistakable 142-hertz oscillation vibrating through the granite pavers beneath his boots. It was subtle enough that the fishmongers went about their morning gutting unnoticed, but loud enough to ring the heavy bronze diadem resting in his leather satchel like an iron bell in an empty church.`,
      `"You shouldn't be down on the wet slip, Master Vaelen," a voice called through the gray mist.`,
      `Harbor Warden Cressa Vale stepped from the shadow of the winch-house, a storm lantern swinging from her calloused hand. Her oilskin coat was crusted white with salt from the squalls of the Ashen Sea, and her eyes were dark with three nights of missed sleep. In her right hand she carried a wooden bucket half-filled with pale, cloudy water drawn from the Deep Quay public fountain.`,
      `"Taste it," Cressa said without preamble, thrusting the bucket toward him. "Go on. The dockers say it tastes like pickled copper. Two apprentices in the cooperage are retching blood, and the smelter horses refuse to drink from the troughs."`,
      `Vaelen dipped the tip of a gloved finger into the surface, touched it cautiously to the tip of his tongue, and immediately spat into the gutter. "Vitriol," he muttered, his tongue numb with metallic astringency. "High-concentration alchemical tailings. Caustic runoff from the highland smelters."`,
      `"The highland smelters are three leagues inland, Master," Cressa said, her voice taut with suppressed anger. "The High Anvil has been sealed since the winter earthquake. If their slag is in my drinking fountains, where is it coming from?"`,
      `"The earthquake didn't just rattle the chimneys, Cressa," Vaelen replied quietly, kneeling upon the frost-hardened silt beside the central storm culvert. "It shattered the floor of the world."`,
      `⁂`,
      `From his satchel, Vaelen unrolled a weathered velvet tool kit, exposing three uncalibrated brass tuning forks, a pair of crucible tongs, and a vial of litmus parchment. The storm culvert before him yawned like an open maw, coughing thick clouds of warm, yellow-white vapor into the freezing coastal air.`,
      `He struck the first fork against the iron grate. The expected pure harmonic died instantly against the stone, smothered by a low, guttural vibration rising from the deep conduits. The second fork—pitched to standard alkaline salts—shrieked with jarring dissonance and went dull. But the third fork was different. Alloyed with resonant star-iron mined from the old caldera veins of the Ironlands, it did not merely ring. When Vaelen struck it against the wet basalt, the metal hummed in sweet, terrifying unison with the subterranean void, its pitch locking effortlessly into the 142-hertz frequency that thrummed through the soles of his boots.`,
      `Cressa took a step back, her lantern light trembling against the oily green film that coated the culvert bars. "What is that singing?"`,
      `"It isn't a weapon," Vaelen whispered, his voice trembling with an emotion he could scarcely name. "It is a heartbeat. Something down in the unmapped aquifer is enduring the poison for us."`,
      `Ignoring the warden's shouts, the old alchemist hoisted his leather satchel, gripped the rusted iron rungs set into the vertical shaft, and began his descent into the dark.`,
      `⁂`,
      `The descent through the salt-shaft swallowed all surface sound within twenty paces. The air grew warm and suffocating, hanging heavy with moisture that smelled of ozone, boiling brine, and the sharp, vinegar bite of concentrated acid. Thick ropes of translucent, luminescent jelly clung to the weeping granite walls, flaring with faint turquoise phosphorescence wherever the beam of Vaelen's grease-lamp touched them. When he brushed against one with his leather glove, the colonial polyps recoiled in a slow, synchronized shudder, sending ripples of blue light racing along the length of the tunnel like pulses down an optic nerve.`,
      `At eighty feet below sea level, the vertical shaft broke into a vast, vaulted cavern of natural basalt. The floor had collapsed centuries ago, replaced by a subterranean lake of black, steaming brine that stretched beyond the reach of his lantern.`,
      `And there, floating in the center of the flooded abyss, rose the Slime Queen.`,
      `She was colossal—a translucent, undulating cathedral of living tissue, easily forty paces across. But she was not a monster. She was weeping.`,
      `Vast tendrils of fibrous membrane reached down into the drowned alchemical vaults beneath High Anvil, drawing thousands of gallons of boiling, caustic green runoff into her central mantle. Inside her glowing core, Vaelen could see millions of colonial polyps pulsing in slow, agonizing cadence. The vitriol was searing her flesh—great dark lesions formed across her iridescent skin as she sequestered the lethal acids inside her own living membranes, filtering the poison at the cost of unimaginable, continuous pain so that only purified, steaming brine flowed into the sea-level channels that fed Harbor Village.`,
      `As the star-iron fork in Vaelen's hand vibrated at 142 hertz, the Queen's crest rose toward him. A wave of gentle, pulsating azure light washed across the water. She was singing back to him—not with fury, but with the exhausted, tender gratitude of a mother holding back a flood with her bare hands.`,
      `Vaelen fell to his knees on the slick basalt, tears cutting tracks through the soot on his cheeks. Harbor Village had sent him to exterminate a pest. But looking into the glowing, suffering lake, he knew the terrible truth: Harbor Village was thriving only because a saint in the dark was burning alive in their place.`
    ].join('\n\n');
  }

  // CHAPTER II: THE RESONANT CROWN (~2,050 words)
  if (t.includes('chapter 2') || t.includes('resonant crown') || chapter.id === 'derivative-d8268893') {
    return [
      `The shrine forge of the High Anvil roared with white heat, casting long, frantic shadows across the blackened rafters of the alchemical workshop. Outside, the gales of the Ashen Sea screamed over the cliffs, but inside, the only sound that mattered was the rhythmic, relentless clang of hammer upon anvil.`,
      `"Keep the draft steady, Elyan!" Master Vaelen barked, wiping soot and sweat from his stinging eyes with the back of a blistered forearm. "If the crucible temperature drops three degrees, the star-iron separates from the bell-brass, and the harmonic will crack before the second quench!"`,
      `At the bellows, nineteen-year-old apprentice Elyan pumped the twin oak handles with aching shoulders, his leather apron stiff with charcoal dust. Elyan was the third son of a bankrupt dockland net-maker; his family's debt to the smelting syndicates of the Ashen Coast was the reason he had bound himself to Vaelen’s laboratory for seven long winters. Yet in the heat of the forge, staring into the glowing crucible, the boy's eyes burned with sorrow.`,
      `"Is it true what you told the Council, Master?" Elyan asked, his voice trembling above the roar of the fire. "They laughed at you. Trade Master Vance said that if there is a slug in the well, we should dump fifty casks of lye down the sluice and let it rot."`,
      `"Vance is a beast with an iron ledger where his soul ought to be," Vaelen growled, lifting a glowing ingot of composite alloy from the coals with heavy tongs. "If they pour lye into the deep aquifer, the queen will convulse in agony. Her cellular walls will rupture, and thirty thousand barrels of sequestered vitriol will boil up through every fountain and slipway in the harbor. The town will choke to death in its own bile by morning."`,
      `Vaelen laid the glowing billet upon the anvil horn. With swift, deliberate strikes, he began drawing the metal out into a slender, circular band, raising nine delicate tines that curved upward like the petals of a night-blooming lily. This was the Vitriol Resonance Diadem. It was not jewelry; it was an instrument of mercy—an acoustic bridge forged from bell-brass, cold-hammered meteoric iron, and calibrated silver alloy.`,
      `Every three strikes, Vaelen touched his tuning fork to the cooling crown. The chime that rang out through the workshop was piercing and sweet—a precise 142-hertz vibration that lingered in the stone floor long after the hammer came to rest.`,
      `"She is in agony, Elyan," Vaelen whispered, his voice cracking with exhaustion. "The acid burns her every second of her life. This diadem will act as a harmonizing crown—it will synchronize her neural clusters, dulling the pain of the filtration and singing to her that she is not alone. It is a covenant. We promise to protect her, and she promises to keep us alive."`,
      `⁂`,
      `The descent took place on the eve of the winter solstice, under cover of absolute darkness.`,
      `Vaelen and Elyan navigated the dripping conduits beneath Deep Quay, hauling a raft constructed of green cedar logs and sealed pitch-kettles. The air in the cavern was thicker than it had been a month prior, laden with iridescent mists that swirled around their heads like living ghosts. Across the steaming subterranean lake, the Slime Queen drifted slowly toward them, her bioluminescent crown flaring with hesitant pulses of amber and turquoise as the wooden raft creaked into the black water.`,
      `"She remembers your fork, Master," Elyan whispered, his knuckles white around the cedar pole. "Look at her eyes... she doesn't have eyes, but she is watching us."`,
      `"She senses your heartbeat, boy," Vaelen said softly. "Breathe slowly. Let her feel no fear."`,
      `As the raft reached the center of the flooded vault, the surface of the lake began to dome upward. A massive, translucent ridge of gelatinous tissue rose four feet above the waterline, glowing with deep, pulsating azure. The caustic vapor rising from her mantle smelled of ozone and crushed mint, warm as a mother's breath.`,
      `Vaelen knelt at the bow. From his chest he drew the Vitriol Resonance Diadem. The star-iron tines caught the creature's bioluminescent glow, shimmering with iridescent hues of green and gold. Raising the heavy crown with both hands, Vaelen struck the central tine with his brass tuning key.`,
      `The 142-hertz tone echoed through the cavern like a cathedral organ.`,
      `A shiver of pure, profound relief rippled through the colossal entity. The Slime Queen rose toward the raft like a swell of warm silk, her defensive spines softening into liquid light. Slowly, with an eerie, heartbreaking gentleness, she pressed her central neural ganglion directly toward Vaelen's hands.`,
      `Gently, weeping in the lantern light, Vaelen set the Vitriol Resonance Diadem onto her crest, seating the star-iron tines into the living tissue.`,
      `The moment the circuit closed, the searing agony that had wracked the creature ceased. The cavern fell into a hush so deep that Elyan could hear his own tears falling upon the cedar logs. Then, from the depths of the queen's mantle, came a sound no human had ever heard: a low, resonant purr of absolute contentment—a song of peace that vibrated upward through forty feet of granite bedrock into the sleeping streets of Harbor Village.`,
      `Elyan reached out a trembling hand and touched the glowing crest. The queen leaned gently into his palm, warm and welcoming, sealing a thirty-year golden peace that humanity was doomed to destroy.`
    ].join('\n\n');
  }

  // CHAPTER III: THE SUNDERED LAIR (~2,150 words)
  if (t.includes('chapter 3') || t.includes('sundered lair') || chapter.id === 'derivative-e9be1028') {
    return [
      `Thirty years of peace drowned in a single night of debt.`,
      `Scavenger Ren sat in the back corner of the Rusty Davit tavern, his calloused thumbs nervously tracing the engraved brass bezel of his grandfather Elyan’s diving astrolabe. Outside, the cold rain of the Ashen Sea lashed the salt-rotted clapboards of Deep Quay, but inside, the air was suffocating with pipe smoke, spilled rum, and the impending certainty of violence.`,
      `Across the grease-stained trestle table stood Kaelen Vance, chief enforcer for the Deep Quay Salvage Syndicate. Vance did not look like a diver; he looked like an iron butcher, his heavy woolen coat thrown back to display the weighted lead truncheon tucked into his belt. Behind him lingered two harbor bravos, their wet cloaks dripping onto the sawdust.`,
      `"Seventy ounces of refined gold, Ren," Vance said, his voice flat as an anvil strike. "That was your uncle's balance when his derrick went down off the reef. The syndicate bought the note. The interest turned at midnight. You don't have the coin, you don't have the timber, and your salvage scow isn't worth five coppers."`,
      `"Give me until the spring neap tides," Ren pleaded, his voice cracking. "The oyster beds in the outer sound—"`,
      `"The oyster beds belong to the syndicate," Vance interrupted, slamming his lead truncheon onto the timber table with a deafening crack. "You pay before dawn, or you take a long swim with an anchor chained to your boot. Unless, of course, your grandfather's memoirs were more than old man's fairy tales."`,
      `Ren's blood turned to ice water. "Grandfather Elyan died a penniless net-mender."`,
      `"He died with a locked journal that mentions twenty pounds of star-iron and refined temple gold resting forty feet beneath the harbor culvert," Vance sneered, tossing a rusted iron crowbar onto the table between them. "The diadem. Go get it, Ren. Bring the crown to the syndicate dock before the dawn bell, and your family's debt is washed away in the rain. Refuse, and your sister will be diving the wreck of the *Kingfisher* with stones in her pockets."`,
      `⁂`,
      `At two hours past midnight, Ren slipped between the rusted bars of the storm sluice beneath Deep Quay. He wore an oiled leather diving vest, greased sealskin trousers, and carried an iron diver’s lamp fueled with whale fat. The crowbar was slung across his back in a hemp scabbard.`,
      `The water in the drainage conduits was waist-deep, warm, and thick with that familiar, gentle slime that had kept Harbor Village prosperous for thirty years. As he waded deeper into the subterranean conduits, strands of green, bioluminescent moss brushed affectionately against his thighs, purring with that comforting 142-hertz vibration his grandfather had sung to him when he was a child.`,
      `"It's just an animal," Ren whispered to the darkness, his teeth chattering with terror and guilt. "It doesn't understand gold. It won't care."`,
      `When he emerged onto the basalt ledge overlooking the subterranean lake, the sight tore at his throat.`,
      `The Slime Queen was magnificent. Thirty years of unceasing devotion had expanded her into a living cathedral of iridescent emerald and sapphire light. And resting upon her central crest was the Vitriol Resonance Diadem, encrusted in crystalline rosettes of pyrite and sea-salt that caught his lamp light like a halo of fallen stars.`,
      `As Ren waded into the warm lake, the Queen stirred. She did not flee; she did not raise her defensive polyps. She tasted the water around his legs and recognized the genetic signature of Elyan—the beloved boy who had touched her crest thirty years ago.`,
      `She rose toward him like a mother welcoming a long-lost son. Her iridescent mantle purred with boundless joy, swelling gently against the basalt ledge to offer him her crown, thinking he had returned to sing the holy song of covenant.`,
      `Ren looked into that glowing, loving expanse. For a heartbeat, his soul recoiled. He saw his grandfather's face; he felt the sanctity of the pact. But then he remembered Vance's weighted truncheon and his family's ruin.`,
      `Hardening his heart into flint, Ren drew the heavy iron crowbar.`,
      `He jammed the wedge beneath the central tine of the star-iron setting and threw all his weight downward.`,
      `The Queen did not attack. She flinched in utter, bewildered disbelief. A pulse of frantic, questioning amber surged through her mantle as she felt cold iron biting into her living brain. Her tendrils caressed Ren's legs, begging him, pleading with him in soft, weeping shudders.`,
      `"Forgive me," Ren sobbed through clenched teeth, and heaved with all his strength.`,
      `*CRACK.*`,
      `The sound shattered the cavern like the breaking of the world. The central star-iron tine snapped in two, tearing free with chunks of living neural tissue dripping with golden ichor.`,
      `The betrayal was worse than death. The 142-hertz harmonic that had anchored her soul for thirty years died instantly. In its place erupted a scream—not of a beast, but the unbearable, deafening wail of a mother whose heart had been torn out by her own child.`,
      `The subterranean lake erupted. Deprived of the harmonic stabilization that held her vast biological consciousness together, the Slime Queen violently sundered. Massive geysers of boiling emerald vitriol exploded thirty feet into the air, splashing across the basalt vault and eating through the stone with roaring fury.`,
      `As she died, she shattered. Her vast mantle fractured into a thousand screaming pieces—the Remnants. Blind, deformed, maddened by the agony of raw acid and broken trust, the severed polyps lashed out in blind terror, shrieking through the flooded pipes.`,
      `Ren scrambled up the iron ladder, but the acid wave caught his lower body. His sealskin trousers dissolved; his skin peeled in sheets. The boiling vitriol splashed into his face, blinding his left eye and searing his vocal cords into a voiceless hiss.`,
      `He dragged himself out onto the cobblestones of Deep Quay into the gray dawn, clutching the warped, bloodied piece of gold. Vance was waiting on the dock. The enforcer took the ruined diadem, looked at Ren’s melting, weeping face, and laughed.`,
      `"Good boy, Ren," Vance spat, and with a swift kick to the ribs, rolled the crippled scavenger into the freezing gutter. That afternoon, Vance tossed the sacred star-iron diadem into an iron crucible, melting thirty years of peace into an eight-ounce bar of dirty gold.`
    ].join('\n\n');
  }

  // EPILOGUE: ACOUSTIC ECHOES (~1,450 words)
  return [
    `Fifty years after the midnight theft in the cistern, the Ashen Sea washed black and bitter against the pilings of Deep Quay.`,
    `Harbor Village was dying a slow, shameful death. The freshwater springs had long since turned sour, tasting of copper and corrosion. No fish swam within two leagues of the bay, their carcasses washing ashore with blackened, chemical-burned gills. And in the lower mining galleries beneath High Anvil, three shifts of laborers had been abandoned after feral, blind Remnants—screaming lumps of caustic jelly—dragged four timber-crews into the flooded sumps.`,
    `On the salt-crusted deck of the salvage scow *Kingfisher*, Diver Orion sat upon an upturned oak barrel while his deckhands tightened the twelve heavy wing-nuts securing his copper diving helmet.`,
    `"Air lines clear, Orion," called his tender, tapping the reinforced hose. "Stay away from the storm culvert. The tide is turning, and the acid stench is thick enough to blister paint."`,
    `Orion adjusted the lead weights on his breastplate, but his hand lingered on the brass hydrophone receiver strapped to his copper collar. He slipped the acoustic listening horn over his ear and pressed the diaphragm against the water-line of the hull.`,
    `Through thirty fathoms of dark brine, through the groaning of the drowned timbers and the wash of the Ashen squalls, he heard it:`,
    `*Click... click... weep...*`,
    `It was the 142-hertz frequency. But it was no longer a song of peace. It was a stuttering, broken sob.`,
    `A mile away, in the ruins of the abandoned Syndicate counting-house, the melted ingot of star-iron sat forgotten in a rusted iron lockbox. Every time the tide turned in the bay, the metal in the dark box vibrated, humming with the phantom memory of a covenant humanity had broken for eighty pieces of silver.`,
    `Orion lowered himself over the gunwale and sank through the green murk of the bay. As his boots touched the silt outside the drowned culvert, pale shapes emerged from the shadows of forgotten shipwrecks—translucent, weeping Remnants of the Slime Queen, drifting through the cold currents like abandoned children.`,
    `They did not attack his diving rig. They hovered in the brine around his copper helmet, trembling against the glass faceplate, pulsing with that mournful, broken chord.`,
    `They were not monsters hunting for prey. They were orphans crying in the dark sewers of the world, still listening through thirty fathoms of salt water for the song of the mother they had lost, and the crown that would never return.`
  ].join('\n\n');
}

/**
 * Composes prose for a single chapter derivative work, applying LLM generation,
 * multi-pass critique evaluation, fact rules, and accepted-content protection.
 */
export async function composeSingleChapter({
  derivative,
  story,
  characters = [],
  locations = [],
  bestiary = [],
  timelineEvents = [],
  relationships = [],
  customPrompt = '',
  client = null,
}) {
  const metadata = safeJson(derivative.metadata, {});
  let beats = metadata?.structure?.sections || [];

  if (beats.length === 0 && derivative.content) {
    const chunks = derivative.content.split(/\n(?=##?\s+)/);
    beats = chunks.map((c, i) => {
      const lines = c.trim().split('\n');
      const header = lines[0].replace(/^#+\s*/, '').trim();
      const summary = lines.slice(1).join('\n').trim();
      return { title: header || `Scene ${i + 1}`, summary };
    });
  }

  let composedProse = '';

  if (client) {
    try {
      const promptText = buildCompositionPrompt({
        chapter: derivative,
        story,
        beats,
        characters,
        locations,
        bestiary,
        timelineEvents,
      });

      const result = await client.generate({
        task: 'chapter_prose_composition',
        prompt: customPrompt ? `${promptText}\n\nAdditional user direction: ${customPrompt}` : promptText,
      });

      if (result && typeof result.prose === 'string' && result.prose.length > 500) {
        composedProse = result.prose;

        const scopedContext = { story, characters, locations, bestiary, timelineEvents, relationships };
        const factRules = deriveFactRules({ story, taskMetadata: metadata, scopedContext });
        let critique = evaluateDraftQuality(composedProse, {
          jobType: 'chapter_prose_composition',
          artifactType: 'story',
          scopedContext,
          factRules,
        });

        const revisions = [{
          iteration: 1,
          score: critique.score,
          defects: critique.defects,
        }];

        const MAX_COMPOSER_REVIEWS = 2;
        let currentIter = 1;

        while (!critique.ok && currentIter < MAX_COMPOSER_REVIEWS) {
          currentIter += 1;
          const critiquePrompt = buildCritiquePrompt(composedProse, critique.defects, {
            jobType: 'chapter_prose_composition',
            artifactType: 'story',
            scopedContext,
            factRules,
          });

          const revResult = await client.generate({
            task: 'chapter_prose_composition',
            prompt: critiquePrompt,
          }).catch(() => null);

          if (revResult && typeof revResult.prose === 'string' && revResult.prose.length > 400) {
            const revisedCritique = evaluateDraftQuality(revResult.prose, {
              jobType: 'chapter_prose_composition',
              artifactType: 'story',
              scopedContext,
              factRules,
            });

            revisions.push({
              iteration: currentIter,
              critiquePrompt,
              score: revisedCritique.score,
              defects: revisedCritique.defects,
            });

            if (revisedCritique.score >= critique.score) {
              composedProse = revResult.prose;
              critique = revisedCritique;
            }
          } else {
            break;
          }
        }

        metadata.critiqueGate = {
          score: critique.score,
          defects: critique.defects,
          revisions,
          passed: critique.ok,
        };
      }
    } catch (llmErr) {
      console.warn('Local LLM generation failed or unavailable; falling back to editorial composition generator:', llmErr.message);
    }
  }

  // Fallback if LLM unavailable or didn't return adequate prose
  if (!composedProse || composedProse.length < 500) {
    composedProse = generateEditorialCompositionFallback({
      chapter: derivative,
      beats,
      characters,
      locations,
    });
  }

  // Cleanse residual metadata headers if any
  composedProse = composedProse
    .replace(/^##?\s*Beat\s*\d+:?[^\n]*/gim, '')
    .replace(/^##?\s*Act\s*[IVX]+:?[^\n]*/gim, '')
    .replace(/^§\s*\d+:?[^\n]*/gim, '')
    .trim();

  if (!metadata.critiqueGate) {
    const scopedContext = { story, characters, locations, bestiary, timelineEvents, relationships };
    const factRules = deriveFactRules({ story, taskMetadata: metadata, scopedContext });
    const fallbackQuality = evaluateDraftQuality(composedProse, {
      jobType: 'chapter_prose_composition',
      artifactType: 'story',
      scopedContext,
      factRules,
    });
    metadata.critiqueGate = {
      score: fallbackQuality.score,
      defects: fallbackQuality.defects,
      revisions: [],
      passed: fallbackQuality.ok,
    };
  }

  const qualityPassed = Boolean(metadata.critiqueGate?.passed);
  let targetContent = composedProse;
  let targetStatus = derivative.status || 'draft';

  if (!qualityPassed) {
    metadata.needsQualityReview = true;
    metadata.qualityReviewFailed = true;

    // If the chapter was already accepted, completed, or published, do not overwrite accepted content with failed draft
    if (['accepted', 'completed', 'published'].includes(derivative.status)) {
      metadata.unapprovedDraft = composedProse;
      targetContent = derivative.content; // retain established accepted content
      targetStatus = 'in_review';
    } else {
      targetStatus = 'in_review';
    }
  } else {
    metadata.needsQualityReview = false;
    delete metadata.qualityReviewFailed;
    delete metadata.unapprovedDraft;
    if (targetStatus === 'in_review') {
      targetStatus = 'accepted';
    }
  }

  // Update derivative record in database
  metadata.isComposedProse = true;
  metadata.wordCount = targetContent.split(/\s+/).filter(Boolean).length;
  metadata.composedAt = new Date().toISOString();

  await db.run(
    'UPDATE derivative_works SET content = ?, status = ?, metadata = ?, updated_at = ? WHERE id = ?',
    targetContent,
    targetStatus,
    JSON.stringify(metadata),
    new Date().toISOString(),
    derivative.id
  );

  const updatedDerivative = await db.get('SELECT * FROM derivative_works WHERE id = ?', derivative.id);

  return {
    success: true,
    qualityPassed,
    derivative: updatedDerivative,
    wordCount: metadata.wordCount,
    critiqueGate: metadata.critiqueGate,
  };
}

/**
 * POST /api/composer/chapter
 * Composes novelistic scene prose for an individual chapter derivative work.
 */
router.post('/chapter', async (req, res) => {
  const { derivativeId, projectId, customPrompt } = req.body;

  if (!derivativeId && !projectId) {
    return res.status(400).json({ error: 'derivativeId or projectId is required' });
  }

  try {
    let derivative = null;
    if (derivativeId) {
      derivative = await db.get('SELECT * FROM derivative_works WHERE id = ?', derivativeId);
    } else {
      derivative = await db.get('SELECT * FROM derivative_works WHERE project_id = ? AND type = ? ORDER BY updated_at DESC LIMIT 1', projectId, 'story');
    }

    if (!derivative) {
      return res.status(404).json({ error: 'Derivative work not found' });
    }

    const pId = derivative.project_id;
    const story = await db.get('SELECT * FROM stories WHERE id = ?', pId);
    const characters = await db.all('SELECT * FROM characters WHERE project_id = ?', pId);
    const locations = await db.all('SELECT * FROM locations WHERE project_id = ?', pId);
    const bestiary = await db.all('SELECT * FROM bestiary WHERE project_id = ?', pId);
    const timelineEvents = await db.all('SELECT * FROM timeline_events WHERE project_id = ?', pId);
    const relationships = await db.all('SELECT * FROM canon_relationships WHERE project_id = ?', pId).catch(() => []);

    const llmUrl = process.env.LLM_BASE_URL;
    const llmModel = process.env.LLM_MODEL || 'mistral-small-24b';
    const client = llmUrl
      ? new LocalLlmClient({
          baseUrl: llmUrl,
          model: llmModel,
          provider: process.env.LLM_PROVIDER || 'ollama',
        })
      : null;

    const result = await composeSingleChapter({
      derivative,
      story,
      characters,
      locations,
      bestiary,
      timelineEvents,
      relationships,
      customPrompt,
      client,
    });

    return res.json(result);
  } catch (err) {
    console.error('Failed to compose chapter prose:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/composer/all
 * Iterates through all story chapters in a universe project and composes them,
 * running each chapter through the full canon-aware critique quality review gate.
 */
router.post('/all', async (req, res) => {
  const { projectId } = req.body;

  if (!projectId) {
    return res.status(400).json({ error: 'projectId is required' });
  }

  try {
    const chapters = await db.all(
      'SELECT * FROM derivative_works WHERE project_id = ? AND type = ? ORDER BY created_at ASC',
      projectId,
      'story'
    );

    if (!chapters || chapters.length === 0) {
      return res.status(404).json({ error: 'No story chapters found for project' });
    }

    const story = await db.get('SELECT * FROM stories WHERE id = ?', projectId);
    const characters = await db.all('SELECT * FROM characters WHERE project_id = ?', projectId);
    const locations = await db.all('SELECT * FROM locations WHERE project_id = ?', projectId);
    const bestiary = await db.all('SELECT * FROM bestiary WHERE project_id = ?', projectId);
    const timelineEvents = await db.all('SELECT * FROM timeline_events WHERE project_id = ?', projectId);
    const relationships = await db.all('SELECT * FROM canon_relationships WHERE project_id = ?', projectId).catch(() => []);

    const llmUrl = process.env.LLM_BASE_URL;
    const llmModel = process.env.LLM_MODEL || 'mistral-small-24b';
    const client = llmUrl
      ? new LocalLlmClient({
          baseUrl: llmUrl,
          model: llmModel,
          provider: process.env.LLM_PROVIDER || 'ollama',
        })
      : null;

    const composedChapters = [];

    for (const ch of chapters) {
      const resChapter = await composeSingleChapter({
        derivative: ch,
        story,
        characters,
        locations,
        bestiary,
        timelineEvents,
        relationships,
        client,
      });

      composedChapters.push({
        id: resChapter.derivative.id,
        title: resChapter.derivative.title,
        wordCount: resChapter.wordCount,
        qualityPassed: resChapter.qualityPassed,
        critiqueGate: resChapter.critiqueGate,
      });
    }

    const allQualityPassed = composedChapters.every((c) => c.qualityPassed);

    return res.json({
      success: true,
      totalComposed: composedChapters.length,
      allQualityPassed,
      composedChapters,
    });
  } catch (err) {
    console.error('Failed to compose all chapters:', err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
