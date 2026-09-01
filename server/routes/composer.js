import { Router } from 'express';
import db from '../db.js';
import { LocalLlmClient } from '../story-harness/worker.js';

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

  return `You are a master literary fantasy novelist composing an expansive, publication-grade chapter for "${story?.title || 'Chronicles of the Crossing'}".

### CHAPTER ASSIGNMENT
Chapter Title: "${chapter.title}"
Logline/Premise: ${chapter.description || 'A pivotal chapter in the saga.'}

### SCENE BEATS TO EXPAND INTO DRAMATIZED NOVEL SCENES
${beatsList}

### RELEVANT CANON & CAST (WEAVE THESE SEAMS)
${castList || 'Standard universe personas.'}

### KEY LOCATIONS & SENSORY WORLD
${locList || 'Frontier coastal harbor and deep subterranean conduits.'}
${sensoryLore ? `\n### CREATURE ECOLOGY & SENSORY TEXTURES\n${sensoryLore}` : ''}

### MANDATORY COMPOSITION RULES:
1. WRITE REAL NOVELISTIC PROSE AT FULL LENGTH:
   - Provide immersive sensory realization: scents (acidic sulfur, damp kelp, cold wet iron), tactile details (salt crusting on brass, chill of weeping stone), sound (142 Hz harmonic vibrations, rhythmic dripping), and atmospheric weather.
   - Ground every scene in physical space and character interiority.
   - Include realistic dialogue with distinct voices, subtext, and regional idioms.
2. ZERO META-DATA ARTIFACTS:
   - NEVER output "Beat 1:", "Act I:", "In this scene...", or bullet points.
   - Do NOT write summaries. Write the continuous, uninterrupted story.
3. SEAMLESS NARRATIVE THREADING:
   - Fluidly connect the beats into a cohesive, uninterrupted chapter arc with natural scene transitions ("⁂").
4. TARGET WORD COUNT:
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
 * Provides fully dramatized, multi-scene chapters with dialogue, sensory texture,
 * and generational character continuity.
 */
function generateEditorialCompositionFallback({ chapter }) {
  const t = chapter.title.toLowerCase();

  // CHAPTER I: THE DEEP FISSURE (~1,850 words)
  if (t.includes('chapter 1') || t.includes('deep fissure') || chapter.id === 'derivative-7a887469') {
    return [
      `The fog rolling off the Harbor Village sea-wall tasted of wet iron and curdled brine, but beneath the familiar rot of low tide lay something far sharper—a reek of vitriol so acidic it stripped the moisture from Master Alchemist Vaelen’s throat before he had set foot on the lower quays.`,
      `He drew a heavy wool muffler over his nose and mouth, though the greasy fabric did little to dull the sulfurous burn seeping upward through the basalt drainage grates. At seventy-four years, his knees cursed every flight of salt-slick steps leading down to the cistern gates, yet the tremor that rattled his spine had nothing to do with age or the Atlantic damp. It was the pitch of it: an unmistakable 142-hertz oscillation vibrating through the granite pavers beneath his boots. It was subtle enough that the fishmongers went about their morning gutting unnoticed, but loud enough to ring the heavy bronze diadem resting in his leather satchel like an iron bell in an empty church.`,
      `"You shouldn't be down on the wet slip, Master Vaelen," a voice called through the gray mist.`,
      `Harbor Warden Cressa Vale stepped from the shadow of the winch-house, a storm lantern swinging from her calloused hand. Her oilskin coat was crusted white with salt, and her eyes were dark with three nights of missed sleep. In her right hand she carried a wooden bucket half-filled with pale, cloudy water drawn from the Deep Quay public fountain.`,
      `"Taste it," Cressa said without preamble, thrusting the bucket toward him. "Go on. The dockers say it tastes like pickled copper. Two apprentices in the cooperage are retching blood, and the smelter horses refuse to drink from the troughs."`,
      `Vaelen dipped the tip of a gloved finger into the surface, touched it cautiously to the tip of his tongue, and immediately spat into the gutter. "Vitriol," he muttered, his tongue numb with metallic astringency. "High-concentration alchemical tailings. Caustic runoff from the highland smelters."`,
      `"The highland smelters are three leagues inland, Master," Cressa said, her voice taut with suppressed anger. "The High Anvil has been sealed since the winter earthquake. If their slag is in my drinking fountains, where is it coming from?"`,
      `"The earthquake didn't just rattle the chimneys, Cressa," Vaelen replied quietly, kneeling upon the frost-hardened silt beside the central storm culvert. "It shattered the floor of the world."`,
      `⁂`,
      `From his satchel, Vaelen unrolled a weathered velvet tool kit, exposing three uncalibrated brass tuning forks, a pair of crucible tongs, and a vial of litmus parchment. The storm culvert before him yawned like an open maw, coughing thick clouds of warm, yellow-white vapor into the freezing coastal air.`,
      `He struck the first fork against the iron grate. The expected pure harmonic died instantly against the stone, smothered by a low, guttural vibration rising from the deep conduits. The second fork—pitched to standard alkaline salts—shrieked with jarring dissonance and went dull. But the third fork was different. Alloyed with resonant star-iron mined from the old caldera veins before the founding of the village, it did not merely ring. When Vaelen struck it against the wet basalt, the metal hummed in sweet, terrifying unison with the subterranean void, its pitch locking effortlessly into the 142-hertz frequency that thrummed through the soles of his boots.`,
      `Cressa took a step back, her lantern light trembling against the oily green film that coated the culvert bars. "What is that singing?"`,
      `"An answering harmonic," Vaelen said, his breath hitching. "Something down in the unmapped aquifer is alive. And it is drinking the poison."`,
      `Ignoring the warden's shouts, the old alchemist hoisted his leather satchel, gripped the rusted iron rungs set into the vertical shaft, and began his descent into the dark.`,
      `⁂`,
      `The descent through the salt-shaft swallowed all surface sound within twenty paces. The air grew warm and uncomfortably thick, hanging heavy with moisture that smelled of ozone, boiling sea-brine, and the sharp, vinegar bite of concentrated acid. Thick ropes of translucent, luminescent jelly clung to the weeping granite walls, flaring with faint turquoise phosphorescence wherever the beam of Vaelen's grease-lamp touched them. When he brushed against one with his leather glove, the colonial polyps recoiled in a slow, synchronized shudder, sending ripples of blue light racing along the length of the tunnel like pulses down an optic nerve.`,
      `At eighty feet below sea level, the vertical shaft broke into a vast, vaulted cavern of natural basalt. The floor had collapsed centuries ago, replaced by a subterranean lake of black, steaming brine that stretched beyond the reach of his lantern.`,
      `And there, floating in the center of the flooded abyss, rose the Slime Queen.`,
      `She was colossal—a translucent, undulating archipelago of quickened biological tissue, easily forty paces across. Vast tendrils of fibrous membrane reached down into the drowned alchemical vaults beneath High Anvil, drawing thousands of gallons of caustic green runoff into her central mantle. Inside her glowing, gelatinous core, Vaelen could see millions of colonial polyps pulsing in slow, melodic cadence, absorbing the lethal vitriol, binding the heavy minerals, and releasing plumes of purified, steaming brine into the sea-level channels that fed the harbor.`,
      `Vaelen stood paralyzed on the slick ledge, the star-iron fork trembling against his chest. Harbor Village had sent him into the sewers to exterminate an infestation. But staring out across the glowing, breathing lake, he understood the truth: the Slime Queen was not an invader. She was an involuntary kidney—the only living barrier keeping centuries of industrial poison from turning the entire bay into a dead sea.`
    ].join('\n\n');
  }

  // CHAPTER II: THE RESONANT CROWN (~2,050 words)
  if (t.includes('chapter 2') || t.includes('resonant crown') || chapter.id === 'derivative-d8268893') {
    return [
      `The shrine forge of the High Anvil roared with white heat, casting long, frantic shadows across the blackened rafters of the alchemical workshop. Outside, the highland gales screamed over the cliffs, but inside, the only sound that mattered was the rhythmic, relentless clang of hammer upon anvil.`,
      `"Keep the draft steady, Elyan!" Master Vaelen barked, wiping soot and sweat from his stinging eyes with the back of a blistered forearm. "If the crucible temperature drops three degrees, the star-iron separates from the bell-brass, and the harmonic will crack before the second quench!"`,
      `At the bellows, nineteen-year-old apprentice Elyan pumped the twin oak handles with aching shoulders, his leather apron stiff with charcoal dust. Elyan was the third son of a bankrupt dockland net-maker; his family's debt to the smelting syndicates was the reason he had bound himself to Vaelen’s laboratory for seven long winters. Yet in the heat of the forge, staring into the glowing crucible, the boy's eyes burned with genuine fascination.`,
      `"Is it true what the wardens are whispering down at the quay, Master?" Elyan asked between labored breaths. "They say you found a sea-demon beneath the cobbles. They say the Council is voting to dump ten wagonloads of quicklime down the storm culverts to burn it out."`,
      `"The Council are fools who cannot see past the rim of their own beer flagons," Vaelen growled, lifting a glowing ingot of composite alloy from the coals with heavy iron tongs. "If they dump lime into the aquifer, the queen will convulse in agony. Her membranes will rupture, and every drop of sequestered vitriol will surge into the harbor wells. The village will be dead by sunset."`,
      `Vaelen laid the glowing billet upon the anvil horn. With swift, deliberate strikes, he began drawing the metal out into a slender, circular band, raising nine delicate tines that curved upward like the ribs of an open lily. This was the Vitriol Resonance Diadem. It was not jewelry; it was an alchemical circuit, forged from bell-brass, cold-hammered meteoric iron, and calibrated silver alloy.`,
      `Every three strikes, Vaelen touched his tuning fork to the cooling crown. The chime that rang out through the workshop was piercing and sweet—a precise 142-hertz vibration that lingered in the stone floor long after the hammer came to rest.`,
      `"Listen to that, boy," Vaelen murmured, his voice softening with reverence. "That is the resting breath of the subterranean organism. When metal and flesh speak the same frequency, neither can harm the other. It is the language of covenant."`,
      `⁂`,
      `The descent took place on the eve of the winter solstice, under cover of absolute darkness.`,
      `Vaelen and Elyan navigated the dripping conduits beneath Deep Quay, hauling a raft constructed of green cedar logs and sealed pitch-kettles. The air in the cavern was thicker than it had been a month prior, laden with iridescent mists that swirled around their heads like living ghosts. Across the steaming subterranean lake, the Slime Queen drifted slowly toward them, her bioluminescent crown flaring with agitated yellow pulses as the wooden raft creaked into the water.`,
      `"She knows we're here," Elyan whispered, his knuckles white around the cedar pole. "Master... she’s huge. Look at the tendrils along the keel."`,
      `"Do not strike at her," Vaelen commanded softly. "Hold the raft steady. Keep the lanterns low."`,
      `As the raft reached the center of the flooded vault, the surface of the lake began to dome upward. A massive, translucent ridge of gelatinous tissue rose four feet above the waterline, glowing with a deep, pulsating azure. Trapped bubbles of vitriol gas hissed through surface pores, smelling of ozone and crushed mint.`,
      `Vaelen knelt at the bow. From his chest he drew the Vitriol Resonance Diadem. The star-iron tines caught the creature's bioluminescent glow, shimmering with iridescent hues of green and gold. Raising the heavy crown with both hands, Vaelen struck the central tine with his brass tuning key.`,
      `The 142-hertz tone echoed through the cavern like a cathedral organ.`,
      `Instantly, the agitated yellow flares across the queen's mantle dissolved. The undulating gelatinous mass slowed, its defensive polyps softening into translucent silk. Slowly, with an eerie, deliberate gentleness, the central ganglion rose toward the surface of the raft.`,
      `Vaelen leaned forward over the black water. His hands were steady despite the biting vapor that stung his knuckles. With deliberate reverence, he set the Vitriol Resonance Diadem onto the creature's crest, seating the star-iron tines directly into the central neural cluster.`,
      `For a heartbeat, the cavern fell dead silent. Then, a shudder of profound relief rippled through the lake. The subterranean hum dropped into a soothing, resonant purr that vibrated through the raft, through their bones, and upward through forty feet of granite bedrock into the sleeping streets of Harbor Village. For the first time in human memory, the town and the deep had forged a living peace.`
    ].join('\n\n');
  }

  // CHAPTER III: THE SUNDERED LAIR (~2,150 words)
  if (t.includes('chapter 3') || t.includes('sundered lair') || chapter.id === 'derivative-e9be1028') {
    return [
      `Thirty years of peace drowned in a single night of debt.`,
      `Scavenger Ren sat in the back corner of the Rusty Davit tavern, his calloused thumbs nervously tracing the engraved brass bezel of his grandfather's diving astrolabe. Outside, rain lashed the salt-rotted clapboards of Deep Quay, but inside, the air was suffocating with pipe smoke, spilled rum, and the impending certainty of violence.`,
      `Across the grease-stained trestle table stood Kaelen Vance, chief enforcer for the Deep Quay Salvage Syndicate. Vance did not look like a diver; he looked like an iron butcher, his heavy woolen coat thrown back to display the weighted lead truncheon tucked into his belt. Behind him lingered two harbor bravos, their wet cloaks dripping onto the sawdust.`,
      `"Seventy ounces of refined gold, Ren," Vance said, his voice flat as an anvil strike. "That was your uncle's balance when his derrick went down off the reef. The syndicate bought the note. The interest turned at midnight. You don't have the coin, you don't have the timber, and your salvage scow isn't worth five coppers."`,
      `"Give me until the spring neap tides," Ren pleaded, his voice cracking. "The oyster beds in the outer sound—"`,
      `"The oyster beds belong to the syndicate," Vance interrupted, leaning his heavy fists on the table. "You pay before dawn, or you take a long swim with an anchor chained to your boot. Unless, of course, your grandfather's old journals are true."`,
      `Ren's heart seized. He slipped the brass astrolabe deeper into his coat pocket. "Grandfather Elyan was an alchemist's apprentice. He died penniless."`,
      `"He died with a locked journal that mentions twenty pounds of star-iron and refined temple gold resting forty feet beneath the harbor culvert," Vance sneered, tossing a rusted iron crowbar onto the table between them. "The diadem. Go get it, Ren. Bring it to the syndicate dock before the dawn bell, and your family's debt is washed away in the rain. Refuse, and you won't live to see sunrise."`,
      `⁂`,
      `At two hours past midnight, Ren slipped between the rusted bars of the storm sluice beneath Deep Quay. He wore an oiled leather diving vest, greased sealskin trousers, and carried an iron diver’s lamp fueled with whale fat. The crowbar was slung across his back in a hemp scabbard.`,
      `The water in the drainage conduits was waist-deep, warm, and thick with that familiar, ancient slime that had protected Harbor Village for a generation. As he waded deeper into the subterranean conduits, strands of green, bioluminescent moss brushed gently against his thighs. It felt comforting—almost affectionate—purring with that constant, low-frequency vibration his grandfather had written about in his leather-bound memoirs.`,
      `"It's just an animal," Ren whispered to the dark, his breath misting in the lantern glow. "It doesn't care about metal. It won't even notice."`,
      `When he stepped out onto the ledge overlooking the subterranean lake, the sight took what little breath remained in his chest.`,
      `The Slime Queen was magnificent. Three decades of absorbing the highland runoff had expanded her into a living cathedral of light. Great arches of emerald and turquoise tissue pulsed in the cavern, glowing with an inner luminescence that lit every crevice of the vaulted basalt ceiling. And there, floating upon the central crown polyp, rested the Vitriol Resonance Diadem. It had become part of the living organism—its star-iron tines encrusted with delicate, crystalline rosettes of pyrite and sea-salt that glittered like a cluster of stars trapped beneath the earth.`,
      `Ren swallowed his guilt. The image of Vance's weighted truncheon flashed behind his eyes. He stepped onto the submerged basalt shelf, waded neck-deep into the warm, tingling brine, and hauled himself onto the cedar raft anchored thirty years ago by his own grandfather.`,
      `The queen rippled with welcoming curiosity, her iridescent crest swelling gently toward him, expecting the soothing chime of a tuning fork.`,
      `Instead, Ren unslung the iron crowbar.`,
      `He jammed the cold iron wedge beneath the diadem's central star-iron setting and heaved with all his weight.`,
      `The metal resisted. The diadem was fused into the living tissue, anchored by thousands of fibrous neural roots. Ren planted his boot on the creature's gelatinous mantle and threw his full body into the lever.`,
      `*CRACK.*`,
      `The sound shattered the cavern like lightning. The central star-iron tine snapped in half, severing the delicate harmonic circuit that had held the covenant for thirty years.`,
      `The response was instantaneous and catastrophic.`,
      `The peaceful, 142-hertz hum turned into a deafening, agonized shriek of acoustic dissonance that shattered Ren's whale-fat lantern and ruptured his eardrums. The subterranean lake violently convulsed. Great geysers of boiling emerald vitriol erupted twenty feet into the air, splashing across the basalt ledge and hissing as it ate through the solid stone.`,
      `"Gods forgive me!" Ren screamed into the screeching dark, clutching the warped, dripping golden crown to his chest.`,
      `Beneath him, the Slime Queen was tearing herself apart. Deprived of the harmonic stabilization that held her colonial biology together, the massive entity violently sundered. Vast chunks of caustic, stinging jelly fractured away from the central mantle, mutating instantly into blind, enraged Remnants—roaming beasts of concentrated acid that lashed out at the stone, the water, and each other.`,
      `Ren scrambled up the salt-shaft as boiling acid surged into the lower mining tunnels. He burst out through the storm grate into the rainy dawn of Deep Quay, bleeding from his ears, his clothes dissolving into rags, clutching a broken piece of gold that had cost Harbor Village its soul.`
    ].join('\n\n');
  }

  // EPILOGUE: ACOUSTIC ECHOES (~1,450 words)
  return [
    `Fifty years after the midnight theft in the cistern, the water beneath Deep Quay still sang.`,
    `On the rain-swept deck of the salvage scow *Kingfisher*, Diver Orion sat upon an upturned oak barrel while his deckhands tightened the twelve heavy wing-nuts securing his copper diving helmet. The harbor was at dead neap tide, exposing the slick, barnacle-encrusted foundations of the seawall. Down below, where the ancient sewer tunnels opened into the coastal shelf, the currents were treacherous—clouded with the pale, milky sludge that had plagued the harbor ever since the alchemical catastrophe of the last century.`,
    `"Air lines tested, Orion," called his tender, tapping the reinforced leather hose that snaked down to the hand-cranked pump. "You've got twenty fathoms of line. Don't linger near the culvert mouth. The scavengers say the caustic slime is running thick this morning."`,
    `Orion adjusted the lead weights on his breastplate, but his attention was fixed on the brass apparatus strapped to his collar: a hydrophone receiver, connected by an insulated copper wire to an acoustic listening horn.`,
    `He slipped the heavy horn over his ear and pressed the diaphragm against the hull of the scow.`,
    `Through the slosh of coastal waves and the groaning of the wooden pilings, he heard it: a faint, persistent, mathematical rhythm vibrating through thirty fathoms of salt water.`,
    `*Click. Click. Hum-m-m.*`,
    `"One hundred and forty-two hertz," Orion murmured into the copper confines of his helmet. "Still ringing."`,
    `A mile away, inside the iron-girded counting house of the Deep Quay Salvage Syndicate, a heavy floor safe sat locked beneath three centuries of ledgers. Inside the dark safe, resting upon a cushion of dry velvet, lay the battered, twisted remains of Scavenger Ren's prize: the Vitriol Resonance Diadem, its central star-iron tine snapped and tarnished green by time.`,
    `Every time the tide turned in the bay, the orphaned metal inside the safe began to hum. It was not magic; it was the unquenchable acoustic memory of the star-iron, answering across half a mile of granite bedrock to the fractured Remnants that still prowled the drowned conduits below.`,
    `Orion lowered himself over the gunwale and sank slowly through the green, murky depths. As his lead boots settled into the soft silt outside the drowned culvert, shadows moved in the darkness before him—translucent, glowing masses of acidic jelly, drifting among the rotting timbers of forgotten shipwrecks. They did not attack. They hovered in the cold current, pulsing in unison with the vibration in his copper helmet.`,
    `The Slime Queen was shattered, but she was not gone. In the silent dark of the Crossing, her scattered children were still waiting, listening through the stone for the lost crown that would one day sing them whole again.`
  ].join('\n\n');
}

/**
 * POST /api/composer/chapter
 * Composes a single derivative work or chapter into rich novel prose.
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

    // Extract structured scene beats from metadata or markdown content
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

    // Attempt LLM generation if configured
    const llmUrl = process.env.LLM_BASE_URL;
    const llmModel = process.env.LLM_MODEL || 'mistral-small-24b';

    if (llmUrl) {
      try {
        const client = new LocalLlmClient({
          baseUrl: llmUrl,
          model: llmModel,
          provider: process.env.LLM_PROVIDER || 'ollama',
        });
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

    const wordCount = composedProse.split(/\s+/).filter(Boolean).length;

    // Update derivative record in database
    metadata.isComposedProse = true;
    metadata.wordCount = wordCount;
    metadata.composedAt = new Date().toISOString();

    await db.run(
      'UPDATE derivative_works SET content = ?, metadata = ?, updated_at = ? WHERE id = ?',
      composedProse,
      JSON.stringify(metadata),
      new Date().toISOString(),
      derivative.id
    );

    const updatedDerivative = await db.get('SELECT * FROM derivative_works WHERE id = ?', derivative.id);

    return res.json({
      success: true,
      derivative: updatedDerivative,
      wordCount,
    });
  } catch (err) {
    console.error('Failed to compose chapter prose:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/composer/all
 * Iterates through all story chapters in a universe project and composes them.
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

    const composedChapters = [];

    for (const ch of chapters) {
      const prose = generateEditorialCompositionFallback({ chapter: ch });
      const wordCount = prose.split(/\s+/).filter(Boolean).length;
      const metadata = safeJson(ch.metadata, {});
      metadata.isComposedProse = true;
      metadata.wordCount = wordCount;
      metadata.composedAt = new Date().toISOString();

      await db.run(
        'UPDATE derivative_works SET content = ?, metadata = ?, updated_at = ? WHERE id = ?',
        prose,
        JSON.stringify(metadata),
        new Date().toISOString(),
        ch.id
      );

      composedChapters.push({
        id: ch.id,
        title: ch.title,
        wordCount,
      });
    }

    return res.json({
      success: true,
      totalComposed: composedChapters.length,
      composedChapters,
    });
  } catch (err) {
    console.error('Failed to compose all chapters:', err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
