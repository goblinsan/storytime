/**
 * StoryTime Canon-Aware Critique & Quality Review Gate
 *
 * Evaluates generated draft payloads against deterministic quality rules,
 * mode-specific formatting constraints (prose vs. screenplay), and the
 * scoped universe encyclopedia graph (entity references, relationships, geography).
 */

export const DEFECT_CODES = {
  METADATA_SCAFFOLDING: 'DEFECT_METADATA_SCAFFOLDING',
  SCRIPT_FORMATTING: 'DEFECT_SCRIPT_FORMATTING',
  PROSE_IN_SCREENPLAY: 'DEFECT_PROSE_IN_SCREENPLAY',
  EARTH_GEOGRAPHY: 'DEFECT_EARTH_GEOGRAPHY',
  UNKNOWN_CANON_REFERENCE: 'DEFECT_UNKNOWN_CANON_REFERENCE',
  RELATIONSHIP_CONTRADICTION: 'DEFECT_RELATIONSHIP_CONTRADICTION',
  FLAT_SUMMARY: 'DEFECT_FLAT_SUMMARY',
  TONAL_MISMATCH: 'DEFECT_TONAL_MISMATCH',
};

const BANNED_EARTH_GEOGRAPHY = [
  'atlantic',
  'pacific',
  'arctic',
  'indian ocean',
  'mediterranean',
  'caribbean',
  'sahara',
  'london',
  'paris',
  'new york',
  'america',
  'europe',
  'asia',
  'africa',
  'antarctica',
];

/**
 * Escapes regex metacharacters in user or model provided strings.
 */
export function escapeRegExp(string) {
  return String(string ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Checks if a given text contains real-world Earth geography terms.
 */
function findEarthGeographyLeaks(text) {
  const leaks = [];
  const lower = text.toLowerCase();
  for (const term of BANNED_EARTH_GEOGRAPHY) {
    const escaped = escapeRegExp(term);
    const regex = new RegExp(`(^|[^a-zA-Z0-9])${escaped}([^a-zA-Z0-9]|$)`, 'i');
    if (regex.test(lower)) {
      leaks.push(term);
    }
  }
  return leaks;
}

/**
 * Extracts plain text from varying draft payload structures.
 */
function extractDraftText(payload) {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;
  if (typeof payload.prose === 'string') return payload.prose;
  if (typeof payload.content === 'string') return payload.content;
  if (typeof payload.script === 'string') return payload.script;
  if (Array.isArray(payload.sections)) {
    return payload.sections.map((s) => `${s.title || ''}\n${s.content || s.summary || ''}`).join('\n\n');
  }
  return JSON.stringify(payload);
}

/**
 * Derives fact and avoid rules from universe story and task metadata.
 */
export function deriveFactRules({ story = {}, taskMetadata = {}, scopedContext = {} } = {}) {
  const storyText = `${story?.title || ''} ${story?.description || ''} ${story?.content || ''}`.toLowerCase();
  const metaText = `${taskMetadata?.brief || ''} ${taskMetadata?.setting || ''}`.toLowerCase();

  const isModernSetting =
    /\b(modern|contemporary|earth|urban fantasy|cyberpunk|real-world|21st century)\b/i.test(storyText) ||
    /\b(modern|contemporary|earth|urban fantasy|cyberpunk|real-world|21st century)\b/i.test(metaText);

  const avoidTerms = new Set();
  const addAvoid = (val) => {
    if (Array.isArray(val)) {
      for (const item of val) addAvoid(item);
    } else if (typeof val === 'string' && val.trim()) {
      for (const part of val.split(',')) {
        if (part.trim()) avoidTerms.add(part.trim().toLowerCase());
      }
    }
  };

  addAvoid(taskMetadata?.avoid);
  addAvoid(scopedContext?.avoid);
  addAvoid(scopedContext?.taskMetadata?.avoid);
  addAvoid(scopedContext?.task?.avoid);

  return {
    allowEarthGeography: isModernSetting,
    avoidTerms: Array.from(avoidTerms),
    tone: taskMetadata?.tone || (/\btragedy\b/i.test(storyText) ? 'tragedy' : 'standard'),
  };
}

/**
 * Evaluates a draft payload against quality rules and the scoped canon encyclopedia.
 *
 * @param {object|string} payload - The generated draft payload
 * @param {object} options
 * @param {string} options.jobType - e.g. 'chapter_prose_composition', 'derivative_outline_generation'
 * @param {string} options.artifactType - e.g. 'story', 'screenplay', 'campaign_bundle'
 * @param {object} [options.scopedContext] - Scoped encyclopedia context pack
 * @param {object} [options.factRules] - Universe fact rules (e.g. allowEarthGeography, avoidTerms, tone)
 * @returns {{ ok: boolean, score: number, defects: Array<{ code: string, message: string, fixGuidance: string }> }}
 */
export function evaluateDraftQuality(payload, { jobType = '', artifactType = '', scopedContext = {}, factRules = null } = {}) {
  const defects = [];
  const text = extractDraftText(payload);
  const normalizedJob = String(jobType || '').toLowerCase();
  const normalizedArtifact = String(artifactType || '').toLowerCase();

  const effectiveFactRules = factRules || deriveFactRules({
    story: scopedContext?.story,
    taskMetadata: scopedContext?.taskMetadata || scopedContext?.task,
    scopedContext,
  });

  const isProseMode = normalizedJob === 'chapter_prose_composition' || normalizedArtifact === 'story' || normalizedArtifact === 'novel';
  const isScreenplayMode = normalizedArtifact === 'screenplay' || normalizedJob === 'screenplay_generation';

  // 1. Fact-Driven Geography & Avoidance Rules
  if (!effectiveFactRules?.allowEarthGeography) {
    const earthLeaks = findEarthGeographyLeaks(text);
    if (earthLeaks.length > 0) {
      defects.push({
        code: DEFECT_CODES.EARTH_GEOGRAPHY,
        message: `Found out-of-universe Earth geography terms: ${earthLeaks.join(', ')}`,
        fixGuidance: `Replace real-world Earth names with canonical in-universe geography (e.g. use "The Ashen Sea" / "The Ashen Coast" instead of "${earthLeaks[0]}").`,
      });
    }
  }

  if (Array.isArray(effectiveFactRules?.avoidTerms) && effectiveFactRules.avoidTerms.length > 0) {
    for (const avoid of effectiveFactRules.avoidTerms) {
      const escaped = escapeRegExp(avoid);
      const regex = new RegExp(`(^|[^a-zA-Z0-9])${escaped}([^a-zA-Z0-9]|$)`, 'i');
      if (regex.test(text)) {
        defects.push({
          code: DEFECT_CODES.EARTH_GEOGRAPHY,
          message: `Found prohibited term "${avoid}" explicitly flagged in task avoid rules.`,
          fixGuidance: `Remove or replace the prohibited term "${avoid}".`,
        });
        break;
      }
    }
  }

  // 2. Mode-Specific Formatting Checks
  if (isProseMode) {
    // 2a. Reject Script Formatting in Novel/Chapter Prose
    const scriptPattern = /^\s*(\*\*[A-Z][A-Za-z\s]{1,30}(\*\*:|:\*\*)|[A-Z\s]{2,20}:)\s*(\([a-z\s]+\)\s*)?.+/m;
    if (scriptPattern.test(text)) {
      defects.push({
        code: DEFECT_CODES.SCRIPT_FORMATTING,
        message: 'Detected screenplay/script dialogue formatting (**Character:** or CHARACTER:) in prose narrative.',
        fixGuidance: 'Format dialogue using standard novel conventions with dialogue tags (e.g. \'"Taste this," Cressa said, thrusting the bucket...\') instead of script speaker prefixes.',
      });
    }

    // 2b. Reject Developmental Metadata Scaffolding in Prose
    const scaffoldingPatterns = [
      { regex: /^##?\s*(Beat|Scene|Act|Part|§)\s*\d+/im, label: 'outline/beat headers ("## Beat 1:", "Act I:")' },
      { regex: /^-\s+\*\*[A-Za-z\s]+:\*\*/m, label: 'bulleted scene notes' },
    ];
    for (const sc of scaffoldingPatterns) {
      if (sc.regex.test(text)) {
        defects.push({
          code: DEFECT_CODES.METADATA_SCAFFOLDING,
          message: `Detected developmental metadata scaffolding: ${sc.label}.`,
          fixGuidance: 'Remove all beat headers, act titles, and bulleted notes. Provide continuous, uninterrupted novelistic paragraphs with standard scene breaks ("⁂") if transitioning.',
        });
        break;
      }
    }

    // 2c. Flat Summary Check (Lack of Dramatization)
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const hasDialogue = /["“][^"”]{2,}["”]/.test(text);
    if (wordCount > 150 && wordCount < 500 && !hasDialogue) {
      defects.push({
        code: DEFECT_CODES.FLAT_SUMMARY,
        message: 'Draft appears to be a high-level summary rather than dramatized scene prose (no spoken dialogue quotes found).',
        fixGuidance: 'Dramatize the scene moment-to-moment with spoken dialogue, character conflict, and sensory world details rather than summary exposition.',
      });
    }

    // 2d. Tonal Mismatch (Clinical Jargon in Tragedy)
    const requiresTragedy = effectiveFactRules?.tone === 'tragedy' || /tragedy/i.test(text) || /tragedy/i.test(JSON.stringify(payload));
    const clinicalPatterns = [
      /\bbiological kidney\b/i,
      /\bcellular processes\b/i,
      /\bwastewater treatment\b/i,
      /\bmunicipal filtration\b/i,
    ];
    if (requiresTragedy) {
      for (const cp of clinicalPatterns) {
        if (cp.test(text)) {
          defects.push({
            code: DEFECT_CODES.TONAL_MISMATCH,
            message: `Clinical/technical register detected in a tragic narrative (${cp.source}).`,
            fixGuidance: 'Shift from a clinical engineering description to emotional tragic pathos—emphasize the organism\'s conscious maternal sacrifice, silent agony, and emotional weight.',
          });
          break;
        }
      }
    }
  } else if (isScreenplayMode) {
    const hasScriptCues = /^\s*([A-Z\s]{2,25})\s*$/m.test(text) || /^\s*\*\*[A-Z\s]{2,25}\*\*:/m.test(text);
    if (!hasScriptCues) {
      defects.push({
        code: DEFECT_CODES.PROSE_IN_SCREENPLAY,
        message: 'Screenplay draft is missing standard script cues and character dialogue blocks.',
        fixGuidance: 'Format the screenplay with standard sluglines (INT./EXT.), character dialogue blocks, and parentheticals.',
      });
    }
  }

  // 3. Canon Graph Awareness Checks
  if (scopedContext) {
    const knownEntities = new Map();
    for (const c of scopedContext.characters || []) if (c?.id) knownEntities.set(c.id, { id: c.id, name: c.name || c.id, type: 'character' });
    for (const l of scopedContext.locations || []) if (l?.id) knownEntities.set(l.id, { id: l.id, name: l.name || l.id, type: 'location' });
    for (const f of scopedContext.factions || []) if (f?.id) knownEntities.set(f.id, { id: f.id, name: f.name || f.id, type: 'faction' });
    for (const b of scopedContext.bestiary || []) if (b?.id) knownEntities.set(b.id, { id: b.id, name: b.name || b.id, type: 'bestiary' });
    for (const e of scopedContext.timelineEvents || []) if (e?.id) knownEntities.set(e.id, { id: e.id, name: e.title || e.id, type: 'timeline_event' });

    // 3a. Strict ID-Based Canon Reference Validation (includes timelineEvents)
    if (Array.isArray(payload?.sourceCanonReferences)) {
      for (const ref of payload.sourceCanonReferences) {
        if (!ref?.entityId || !knownEntities.has(ref.entityId)) {
          defects.push({
            code: DEFECT_CODES.UNKNOWN_CANON_REFERENCE,
            message: `Referenced unknown canon entity ID "${ref?.entityId || 'missing'}" (${ref?.name || 'unnamed'}) not found in scoped universe context.`,
            fixGuidance: `Anchor the narrative in recognized universe entity IDs from the scoped context (${Array.from(knownEntities.keys()).slice(0, 4).join(', ')}).`,
          });
          break;
        }
      }
    }

    // 3b. Bidirectional Canon Relationship Consistency across all entity types
    const relationships = Array.isArray(scopedContext.relationships) ? scopedContext.relationships : [];
    if (relationships.length > 0) {
      for (const rel of relationships) {
        const type = String(rel.relationship_type || rel.type || '').toLowerCase();
        const srcId = rel.source_entity_id || rel.sourceEntityId;
        const tgtId = rel.target_entity_id || rel.targetEntityId;

        const srcEntity = knownEntities.get(srcId);
        const tgtEntity = knownEntities.get(tgtId);

        if (srcEntity?.name && tgtEntity?.name) {
          const src = srcEntity.name;
          const tgt = tgtEntity.name;
          const textHasBoth = text.includes(src) && text.includes(tgt);

          if (textHasBoth) {
            const isHostile = ['enemy', 'hostile', 'rival', 'nemesis', 'at_war', 'feud'].includes(type);
            const isFriendly = ['ally', 'allied', 'friend', 'vassal', 'pledged', 'sibling', 'parent'].includes(type);
            const sEsc = escapeRegExp(src);
            const tEsc = escapeRegExp(tgt);

            if (isHostile) {
              const friendlyPhrases = '(allied with|ally to|wed to|married to|loyal servant of|peace treaty with|trusted friend of|sworn brother to|sworn sister to)';
              const regex1 = new RegExp(`(${sEsc}[^.\\n]{1,50}${friendlyPhrases}[^.\\n]{1,50}${tEsc})`, 'i');
              const regex2 = new RegExp(`(${tEsc}[^.\\n]{1,50}${friendlyPhrases}[^.\\n]{1,50}${sEsc})`, 'i');
              if (regex1.test(text) || regex2.test(text)) {
                defects.push({
                  code: DEFECT_CODES.RELATIONSHIP_CONTRADICTION,
                  message: `Canon contradiction: "${src}" and "${tgt}" are recorded as hostile/rivals (${type}), but text claims close alliance, friendship, or servitude.`,
                  fixGuidance: `Preserve the established canon relationship (${src} and ${tgt} are ${type}). Reflect their tension or enmity accurately.`,
                });
                break;
              }
            } else if (isFriendly) {
              const hostilePhrases = '(blood feud with|sworn enemy of|mortal foe of|vowed to destroy|hated enemy of|bitter enemy of)';
              const regex1 = new RegExp(`(${sEsc}[^.\\n]{1,50}${hostilePhrases}[^.\\n]{1,50}${tEsc})`, 'i');
              const regex2 = new RegExp(`(${tEsc}[^.\\n]{1,50}${hostilePhrases}[^.\\n]{1,50}${sEsc})`, 'i');
              if (regex1.test(text) || regex2.test(text)) {
                defects.push({
                  code: DEFECT_CODES.RELATIONSHIP_CONTRADICTION,
                  message: `Canon contradiction: "${src}" and "${tgt}" are recorded as allies/friendly (${type}), but text claims active blood feud or mortal enmity.`,
                  fixGuidance: `Preserve the established canon relationship (${src} and ${tgt} are ${type}).`,
                });
                break;
              }
            }
          }
        }
      }
    }
  }

  // Scoring: Each defect docks points
  const score = Math.max(0, 100 - defects.length * 20);
  const ok = defects.length === 0 && score >= 90;

  return {
    ok,
    score,
    defects,
  };
}

/**
 * Builds a structured, targeted critique prompt to feed back to the LLM for a revision turn.
 */
export function buildCritiquePrompt(payload, defects, { jobType = '', artifactType = '', scopedContext = {} } = {}) {
  const text = extractDraftText(payload);
  const defectList = defects.map((d, i) => `${i + 1}. **[${d.code}]**: ${d.message}\n   -> Action: ${d.fixGuidance}`).join('\n\n');

  return `You are revising your previous draft for "${scopedContext?.story?.title || 'Chronicles of the Crossing'}".

### PREVIOUS DRAFT
${text}

### QUALITY REVIEW GATE CRITIQUE (DEFECTS TO RESOLVE)
Your draft failed the editorial quality and canon review with the following defects:
${defectList}

### MANDATORY REVISION INSTRUCTIONS:
1. Address EVERY defect listed above directly.
2. If script formatting (**Character:**) was flagged, rewrite using standard novel dialogue tags.
3. If metadata scaffolding was flagged, strip all headers ("## Beat") and bullets.
4. If out-of-universe geography or avoid terms were flagged, strictly use canonical universe geography.
5. Maintain rich, uninterrupted narrative prose and character voice.

Output ONLY the revised, clean draft payload.`;
}
