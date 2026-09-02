import { randomUUID } from 'crypto';
import { isSupportedJobType } from './taskTypes.js';

let defaultDb = null;
async function resolveDb(database) {
  if (database) return database;
  if (!defaultDb) {
    defaultDb = (await import('../db.js')).default;
  }
  return defaultDb;
}

export class PromotionError extends Error {
  constructor(message, status = 400, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

export async function promoteDraftToCanon(draftId, { db: dbArg, force = false } = {}) {
  const database = await resolveDb(dbArg);
  const draft = await database.get('SELECT * FROM generated_drafts WHERE id = ?', draftId);
  if (!draft) {
    throw new PromotionError('Generated draft not found', 404);
  }

  if (draft.status !== 'accepted') {
    throw new PromotionError(
      `Only accepted drafts can be promoted to canon (current status: ${draft.status})`,
      400,
    );
  }

  if (draft.promoted_at && !force) {
    throw new PromotionError('Draft has already been promoted to canon', 409, {
      promotedAt: draft.promoted_at,
    });
  }

  if (!isSupportedJobType(draft.artifact_type)) {
    throw new PromotionError(
      `Unsupported artifact type for promotion: ${draft.artifact_type}`,
      400,
    );
  }

  const payload =
    typeof draft.payload === 'string'
      ? JSON.parse(draft.payload)
      : (draft.payload ?? {});
  const projectId = draft.project_id;
  const taskId = draft.dashboard_task_id || '';

  return database.transaction(async (tx) => {
    const counts = {
      worldBriefUpdated: false,
      characters: 0,
      factions: 0,
      locations: 0,
      timelineEvents: 0,
    };

    // 1. Promote worldBrief
    if (payload.worldBrief) {
      const story = await tx.get(
        'SELECT id, title, description FROM stories WHERE id = ?',
        projectId,
      );
      if (story) {
        const briefSummary = payload.worldBrief.summary || '';
        const briefName = payload.worldBrief.name || '';
        let newDescription = story.description || '';
        if (!newDescription) {
          newDescription = briefSummary;
        } else if (briefSummary && !newDescription.includes(briefSummary)) {
          newDescription = `${newDescription}\n\n${briefSummary}`;
        }

        let newTitle = story.title || '';
        if (
          (!newTitle || newTitle === 'Untitled' || newTitle === 'New Story') &&
          briefName
        ) {
          newTitle = briefName;
        }

        await tx.run(
          `UPDATE stories
           SET title = ?, description = ?, updated_at = to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
           WHERE id = ?`,
          newTitle,
          newDescription,
          projectId,
        );
        counts.worldBriefUpdated = true;
      }
    }

    // 2. Promote locations (including shrineLocations and chokePoints)
    const allLocations = [
      ...(Array.isArray(payload.locations) ? payload.locations : []),
      ...(Array.isArray(payload.shrineLocations) ? payload.shrineLocations : []),
      ...(Array.isArray(payload.chokePoints) ? payload.chokePoints : []),
    ];
    if (allLocations.length > 0) {
      for (const loc of allLocations) {
        if (!loc || !loc.id) continue;
        const politicalNotes =
          Array.isArray(loc.factionIds) && loc.factionIds.length
            ? `Factions: ${loc.factionIds.join(', ')}`
            : '';
        await tx.run(
          `INSERT INTO locations (
             id, project_id, name, description, region_type, political_notes,
             source_draft_id, source_task_id
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET
             project_id = EXCLUDED.project_id,
             name = EXCLUDED.name,
             description = EXCLUDED.description,
             region_type = EXCLUDED.region_type,
             political_notes = EXCLUDED.political_notes,
             source_draft_id = EXCLUDED.source_draft_id,
             source_task_id = EXCLUDED.source_task_id`,
          loc.id,
          projectId,
          loc.name || 'Unnamed Location',
          loc.summary || '',
          loc.regionType || '',
          politicalNotes,
          draft.id,
          taskId,
        );
        counts.locations++;
      }
    }

    // 2b. Promote star_system_refinement
    if (payload.starSystem && payload.starSystem.id) {
      const sys = payload.starSystem;
      await tx.run(
        `INSERT INTO locations (
           id, project_id, name, description, region_type,
           star_class, hazard_tier, source_draft_id, source_task_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           project_id = EXCLUDED.project_id,
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           region_type = EXCLUDED.region_type,
           star_class = EXCLUDED.star_class,
           hazard_tier = EXCLUDED.hazard_tier,
           source_draft_id = EXCLUDED.source_draft_id,
           source_task_id = EXCLUDED.source_task_id`,
        sys.id,
        projectId,
        sys.name || 'Unnamed Star System',
        sys.summary || `Star class: ${sys.starClass || 'Unknown'}, Hazard Tier: ${sys.hazardTier || 'Standard'}`,
        'star_system',
        sys.starClass || null,
        sys.hazardTier || null,
        draft.id,
        taskId,
      );
      counts.locations++;

      // Planetary bodies
      if (Array.isArray(sys.planetaryBodies)) {
        for (const planet of sys.planetaryBodies) {
          if (!planet || !planet.id) continue;
          await tx.run(
            `INSERT INTO locations (
               id, project_id, parent_id, name, description, region_type, celestial_type,
               source_draft_id, source_task_id
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (id) DO UPDATE SET
               project_id = EXCLUDED.project_id,
               parent_id = EXCLUDED.parent_id,
               name = EXCLUDED.name,
               description = EXCLUDED.description,
               region_type = EXCLUDED.region_type,
               celestial_type = EXCLUDED.celestial_type,
               source_draft_id = EXCLUDED.source_draft_id,
               source_task_id = EXCLUDED.source_task_id`,
            planet.id,
            projectId,
            sys.id,
            planet.name || 'Unnamed World',
            planet.summary || planet.description || '',
            planet.type || 'planet',
            planet.type || 'planet',
            draft.id,
            taskId,
          );
          counts.locations++;
        }
      }

      // Orbital stations
      if (Array.isArray(sys.orbitalStations)) {
        for (const station of sys.orbitalStations) {
          if (!station || !station.id) continue;
          await tx.run(
            `INSERT INTO locations (
               id, project_id, parent_id, name, description, region_type, celestial_type,
               source_draft_id, source_task_id
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (id) DO UPDATE SET
               project_id = EXCLUDED.project_id,
               parent_id = EXCLUDED.parent_id,
               name = EXCLUDED.name,
               description = EXCLUDED.description,
               region_type = EXCLUDED.region_type,
               celestial_type = EXCLUDED.celestial_type,
               source_draft_id = EXCLUDED.source_draft_id,
               source_task_id = EXCLUDED.source_task_id`,
            station.id,
            projectId,
            sys.id,
            station.name || 'Unnamed Station',
            station.summary || station.description || '',
            station.type || 'station',
            station.type || 'station',
            draft.id,
            taskId,
          );
          counts.locations++;
        }
      }
    }

    // 2c. Promote location_hierarchy_refinement
    if (Array.isArray(payload.subLocations) && payload.parentLocationId) {
      for (const sub of payload.subLocations) {
        if (!sub || !sub.id) continue;
        await tx.run(
          `INSERT INTO locations (
             id, project_id, parent_id, name, description, region_type,
             source_draft_id, source_task_id
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET
             project_id = EXCLUDED.project_id,
             parent_id = EXCLUDED.parent_id,
             name = EXCLUDED.name,
             description = EXCLUDED.description,
             region_type = EXCLUDED.region_type,
             source_draft_id = EXCLUDED.source_draft_id,
             source_task_id = EXCLUDED.source_task_id`,
          sub.id,
          projectId,
          payload.parentLocationId,
          sub.name || 'Unnamed Location',
          sub.summary || sub.description || '',
          sub.regionType || 'poi',
          draft.id,
          taskId,
        );
        counts.locations++;
      }
    }

    // 3. Promote factions
    if (Array.isArray(payload.factions)) {
      for (const fac of payload.factions) {
        if (!fac || !fac.id) continue;
        const goals = Array.isArray(fac.goals)
          ? fac.goals
          : fac.goal
            ? [fac.goal]
            : [];
        const desc =
          fac.summary || (fac.pressure ? `Pressure: ${fac.pressure}` : '');
        await tx.run(
          `INSERT INTO factions (
             id, project_id, name, description, goals,
             source_draft_id, source_task_id
           ) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET
             project_id = EXCLUDED.project_id,
             name = EXCLUDED.name,
             description = EXCLUDED.description,
             goals = EXCLUDED.goals,
             source_draft_id = EXCLUDED.source_draft_id,
             source_task_id = EXCLUDED.source_task_id`,
          fac.id,
          projectId,
          fac.name || 'Unnamed Faction',
          desc,
          JSON.stringify(goals),
          draft.id,
          taskId,
        );
        counts.factions++;
      }
    }

    // 3b. Promote faction politics refinement (doctrine, economic leverage, corporate structure, assets, rivalries)
    if (payload.politics || payload.assets || payload.rivalries || payload.jobType === 'faction_politics_refinement') {
      const targetFactionId = payload.factionId || payload.targetFactionId;
      if (targetFactionId) {
        const politics = payload.politics || {};
        const assets = Array.isArray(payload.assets) ? payload.assets : [];

        await tx.run(
          `UPDATE factions SET
             doctrine = COALESCE(?, doctrine),
             economic_leverage = COALESCE(?, economic_leverage),
             corporate_structure = COALESCE(?, corporate_structure),
             assets = CASE WHEN ? != '[]' THEN ? ELSE assets END,
             source_draft_id = ?,
             source_task_id = ?
           WHERE id = ? AND project_id = ?`,
          politics.doctrine || null,
          politics.economicLeverage || null,
          politics.corporateStructure || null,
          JSON.stringify(assets),
          JSON.stringify(assets),
          draft.id,
          taskId,
          targetFactionId,
          projectId,
        );
        counts.factions = (counts.factions || 0) + 1;

        // Also insert rivalries into canon_relationships
        if (Array.isArray(payload.rivalries)) {
          for (const riv of payload.rivalries) {
            if (!riv || !riv.factionId) continue;
            const relId = `rel-${draft.id.slice(0, 8)}-${riv.factionId.slice(-8)}`;
            await tx.run(
              `INSERT INTO canon_relationships (
                 id, project_id, source_entity_id, source_entity_type,
                 target_entity_id, target_entity_type, relationship_type,
                 notes, confidence, source_draft_id, source_task_id
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT (id) DO UPDATE SET
                 relationship_type = EXCLUDED.relationship_type,
                 notes = EXCLUDED.notes`,
              relId,
              projectId,
              targetFactionId,
              'faction',
              riv.factionId,
              'faction',
              riv.status || 'rival_of',
              riv.reason || '',
              1.0,
              draft.id,
              taskId,
            );
          }
        }
      }
    }

    // 4. Promote characters
    if (Array.isArray(payload.characters)) {
      for (const char of payload.characters) {
        if (!char || !char.id) continue;
        const relationships = Array.isArray(char.factionIds)
          ? char.factionIds.map((fId) => ({
              target: fId,
              type: 'faction_member',
            }))
          : [];
        await tx.run(
          `INSERT INTO characters (
             id, project_id, name, description, background, role, character_type,
             motivation, current_location_id, location, relationships,
             source_draft_id, source_task_id
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET
             project_id = EXCLUDED.project_id,
             name = EXCLUDED.name,
             description = EXCLUDED.description,
             background = EXCLUDED.background,
             role = EXCLUDED.role,
             character_type = EXCLUDED.character_type,
             motivation = EXCLUDED.motivation,
             current_location_id = EXCLUDED.current_location_id,
             location = EXCLUDED.location,
             relationships = EXCLUDED.relationships,
             source_draft_id = EXCLUDED.source_draft_id,
             source_task_id = EXCLUDED.source_task_id`,
          char.id,
          projectId,
          char.name || 'Unnamed Character',
          char.summary || '',
          char.summary || '',
          char.role || '',
          'campaign',
          char.motivation || '',
          char.locationId || null,
          char.locationId || '',
          JSON.stringify(relationships),
          draft.id,
          taskId,
        );
        counts.characters++;
      }
    }

    // 5. Promote timelineEvents
    if (Array.isArray(payload.timelineEvents)) {
      for (const evt of payload.timelineEvents) {
        if (!evt || !evt.id) continue;
        const chars = Array.isArray(evt.characterIds)
          ? evt.characterIds
          : Array.isArray(evt.characters)
            ? evt.characters
            : [];
        const facs = Array.isArray(evt.factionIds)
          ? evt.factionIds
          : Array.isArray(evt.factions)
            ? evt.factions
            : [];
        const beforeIds = Array.isArray(evt.before)
          ? evt.before
          : Array.isArray(evt.beforeEventIds)
            ? evt.beforeEventIds
            : [];
        const afterIds = Array.isArray(evt.after)
          ? evt.after
          : Array.isArray(evt.afterEventIds)
            ? evt.afterEventIds
            : [];

        await tx.run(
          `INSERT INTO timeline_events (
             id, project_id, date, title, description,
             characters, factions, before_event_ids, after_event_ids,
             source_draft_id, source_task_id
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET
             project_id = EXCLUDED.project_id,
             date = EXCLUDED.date,
             title = EXCLUDED.title,
             description = EXCLUDED.description,
             characters = EXCLUDED.characters,
             factions = EXCLUDED.factions,
             before_event_ids = EXCLUDED.before_event_ids,
             after_event_ids = EXCLUDED.after_event_ids,
             source_draft_id = EXCLUDED.source_draft_id,
             source_task_id = EXCLUDED.source_task_id`,
          evt.id,
          projectId,
          evt.date || '',
          evt.title || 'Untitled Event',
          evt.summary || evt.description || '',
          JSON.stringify(chars),
          JSON.stringify(facs),
          JSON.stringify(beforeIds),
          JSON.stringify(afterIds),
          draft.id,
          taskId,
        );
        counts.timelineEvents++;
      }
    }

    // 5b. Promote technology lore
    if (payload.tech) {
      const tech = payload.tech;
      if (tech && tech.name) {
        const techId = tech.id || `tech-${draft.id.slice(0, 8)}`;
        await tx.run(
          `INSERT INTO technologies (
             id, project_id, name, principles, limitations, proliferation,
             classification, patents_or_taboos, source_draft_id, source_task_id
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET
             project_id = EXCLUDED.project_id,
             name = EXCLUDED.name,
             principles = EXCLUDED.principles,
             limitations = EXCLUDED.limitations,
             proliferation = EXCLUDED.proliferation,
             classification = EXCLUDED.classification,
             patents_or_taboos = EXCLUDED.patents_or_taboos,
             source_draft_id = EXCLUDED.source_draft_id,
             source_task_id = EXCLUDED.source_task_id,
             updated_at = to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`,
          techId,
          projectId,
          tech.name,
          tech.principles || '',
          tech.limitations || '',
          tech.proliferation || '',
          tech.classification || '',
          tech.patentsOrTaboos || '',
          draft.id,
          taskId,
        );
        counts.technologies = (counts.technologies || 0) + 1;
      }
    }

    // 5c. Promote religion & sacred doctrines
    if (payload.religionName || payload.religion) {
      const relName = payload.religionName || payload.religion?.name || 'Untitled Religion';
      const relId = payload.religion?.id || `rel-${draft.id.slice(0, 8)}`;
      const deities = Array.isArray(payload.deities)
        ? payload.deities.map((d) => (typeof d === 'string' ? d : d.name || 'Deity'))
        : [];
      const beliefs = [
        ...(Array.isArray(payload.coreTenets) ? payload.coreTenets : []),
        ...(Array.isArray(payload.sacredRites) ? payload.sacredRites.map((r) => `Rite: ${r}`) : []),
        ...(Array.isArray(payload.taboos) ? payload.taboos.map((t) => `Taboo: ${t}`) : []),
      ];
      await tx.run(
        `INSERT INTO religions (id, project_id, name, beliefs, deities)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           beliefs = EXCLUDED.beliefs,
           deities = EXCLUDED.deities`,
        relId,
        projectId,
        relName,
        JSON.stringify(beliefs),
        JSON.stringify(deities),
      );
      counts.religions = (counts.religions || 0) + 1;
    }

    // 5d. Promote languages & naming conventions
    if (payload.languageName || payload.language) {
      const langName = payload.languageName || payload.language?.name || 'Untitled Language';
      const langId = payload.language?.id || `lang-${draft.id.slice(0, 8)}`;
      const vocabulary =
        typeof payload.namingConventions === 'object'
          ? payload.namingConventions
          : (payload.vocabulary || {});
      const grammar = payload.culturalGroup
        ? `Cultural Group: ${payload.culturalGroup}`
        : (payload.grammar || '');
      await tx.run(
        `INSERT INTO languages (id, project_id, name, vocabulary, grammar)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           vocabulary = EXCLUDED.vocabulary,
           grammar = EXCLUDED.grammar`,
        langId,
        projectId,
        langName,
        JSON.stringify(vocabulary),
        grammar,
      );
      counts.languages = (counts.languages || 0) + 1;
    }

    // 5e. Promote mystery signals
    if (payload.signal || payload.jobType === 'mystery_signal_refinement') {
      const sig = payload.signal || payload;
      const sigId = sig.id || `signal-${draft.id.slice(0, 8)}`;
      const anomalousProps = Array.isArray(sig.anomalousProperties)
        ? sig.anomalousProperties
        : [];
      const now = new Date().toISOString();

      await tx.run(
        `INSERT INTO mystery_signals (
           id, project_id, designation, frequency, origin_vector,
           anomalous_properties, transmission_transcript,
           source_draft_id, source_task_id, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           project_id = EXCLUDED.project_id,
           designation = EXCLUDED.designation,
           frequency = EXCLUDED.frequency,
           origin_vector = EXCLUDED.origin_vector,
           anomalous_properties = EXCLUDED.anomalous_properties,
           transmission_transcript = EXCLUDED.transmission_transcript,
           source_draft_id = EXCLUDED.source_draft_id,
           source_task_id = EXCLUDED.source_task_id,
           updated_at = EXCLUDED.updated_at`,
        sigId,
        projectId,
        sig.designation || 'Unknown Signal',
        sig.frequency || 'Unknown Frequency',
        sig.originVector || null,
        JSON.stringify(anomalousProps),
        sig.transmissionTranscript || null,
        draft.id,
        taskId,
        now,
        now,
      );
      counts.signals = (counts.signals || 0) + 1;
    }

    // 5f. Promote bestiary entry
    if (payload.category && (payload.tactics || payload.jobType === 'bestiary_entry_refinement')) {
      const bId = payload.id || `creature-${draft.id.slice(0, 8)}`;
      await tx.run(
        `INSERT INTO bestiary (
           id, project_id, name, category, hearts, tactics, description, notes,
           source_draft_id, source_task_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           project_id = EXCLUDED.project_id,
           name = EXCLUDED.name,
           category = EXCLUDED.category,
           hearts = EXCLUDED.hearts,
           tactics = EXCLUDED.tactics,
           description = EXCLUDED.description,
           notes = EXCLUDED.notes,
           source_draft_id = EXCLUDED.source_draft_id,
           source_task_id = EXCLUDED.source_task_id,
           updated_at = to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`,
        bId,
        projectId,
        payload.name || 'Unnamed Threat',
        payload.category || 'Creature',
        payload.hearts || 3,
        JSON.stringify(Array.isArray(payload.tactics) ? payload.tactics : []),
        payload.description || '',
        payload.notes || (Array.isArray(payload.habitats) ? `Habitats: ${payload.habitats.join(', ')}` : ''),
        draft.id,
        taskId,
      );
      counts.bestiary = (counts.bestiary || 0) + 1;
    }

    // 6. Promote chapter prose composition
    if (payload.prose || payload.jobType === 'chapter_prose_composition') {
      const dNow = new Date().toISOString();
      let targetId = payload.targetChapterId;
      if (!targetId && (payload.chapterTitle || payload.title)) {
        const titleToMatch = payload.chapterTitle || payload.title;
        const existing = await tx.get(
          'SELECT id, metadata FROM derivative_works WHERE project_id = ? AND LOWER(title) = LOWER(?)',
          projectId,
          titleToMatch
        );
        if (existing) targetId = existing.id;
      }

      if (targetId) {
        const existing = await tx.get('SELECT id, metadata FROM derivative_works WHERE id = ?', targetId);
        const meta = typeof existing?.metadata === 'string' ? JSON.parse(existing.metadata || '{}') : (existing?.metadata || {});
        meta.isComposedProse = true;
        meta.wordCount = payload.prose ? payload.prose.split(/\s+/).filter(Boolean).length : 0;
        meta.sourceDraftId = draft.id;
        meta.taskId = taskId;

        await tx.run(
          `UPDATE derivative_works
           SET content = ?,
               metadata = ?,
               updated_at = ?
           WHERE id = ?`,
          payload.prose,
          JSON.stringify(meta),
          dNow,
          targetId
        );
        counts.derivatives = (counts.derivatives || 0) + 1;
      } else {
        const derivativeId = `derivative-${draft.id.slice(0, 8)}`;
        await tx.run(
          `INSERT INTO derivative_works (
             id, project_id, type, title, description, content,
             source_canon_references, metadata, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET
             title = EXCLUDED.title,
             content = EXCLUDED.content,
             metadata = EXCLUDED.metadata,
             updated_at = EXCLUDED.updated_at`,
          derivativeId,
          projectId,
          'story',
          payload.chapterTitle || payload.title || 'Composed Chapter Prose',
          payload.premise || payload.logline || 'Novel chapter composed from canonical scene beats.',
          payload.prose,
          JSON.stringify(payload.sourceCanonReferences || []),
          JSON.stringify({ isComposedProse: true, sourceDraftId: draft.id, taskId }),
          dNow,
          dNow
        );
        counts.derivatives = (counts.derivatives || 0) + 1;
      }
    } else if (payload.structure?.sections || (payload.title && (payload.derivativeType || payload.jobType === 'derivative_outline_generation'))) {
      const derivativeId = `derivative-${draft.id.slice(0, 8)}`;
      const sections = Array.isArray(payload.structure?.sections) ? payload.structure.sections : [];
      const content = sections.map((s) => `## ${s.title}\n\n${s.summary}`).join('\n\n');
      const dNow = new Date().toISOString();

      await tx.run(
        `INSERT INTO derivative_works (
           id, project_id, type, title, description, content,
           source_canon_references, metadata, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title,
           description = EXCLUDED.description,
           content = EXCLUDED.content,
           source_canon_references = EXCLUDED.source_canon_references,
           updated_at = EXCLUDED.updated_at`,
        derivativeId,
        projectId,
        payload.derivativeType || 'story',
        payload.title || 'Untitled Narrative Work',
        payload.premise || payload.logline || '',
        content,
        JSON.stringify(payload.sourceCanonReferences || []),
        JSON.stringify({ sourceDraftId: draft.id, taskId, structure: payload.structure }),
        dNow,
        dNow,
      );
      counts.derivatives = (counts.derivatives || 0) + 1;

      // Populate story_arcs so Character Arcs, Pacing, and Plot Structure studio tools populate
      if (sections.length > 0) {
        const arcDetails = sections.map((s) => `${s.title}: ${s.summary}`);
        const arcId = `arc-${draft.id.slice(0, 8)}`;
        const maxArc = await tx.get('SELECT MAX(arc_number) as m FROM story_arcs WHERE project_id = ?', projectId);
        const nextArcNum = (maxArc?.m || 0) + 1;

        await tx.run(
          `INSERT INTO story_arcs (
             id, project_id, arc_number, title, description, details, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET
             title = EXCLUDED.title,
             description = EXCLUDED.description,
             details = EXCLUDED.details,
             updated_at = EXCLUDED.updated_at`,
          arcId,
          projectId,
          nextArcNum,
          payload.title || 'Narrative Arc & Plot Structure',
          payload.premise || payload.logline || '',
          JSON.stringify(arcDetails),
          dNow,
          dNow,
        );
        counts.arcs = (counts.arcs || 0) + 1;
      }
    }

    // 7. Record promoted_at on generated_drafts
    const promotedAt = new Date().toISOString();
    await tx.run(
      `UPDATE generated_drafts
       SET promoted_at = ?, updated_at = now()
       WHERE id = ?`,
      promotedAt,
      draft.id,
    );

    // 8. Queue an exploration outbox event
    const eventId = `event-${randomUUID()}`;
    await tx.run(
      `INSERT INTO exploration_events (
         id, project_id, draft_id, status, created_at
       ) VALUES (?, ?, ?, 'pending', now())
       ON CONFLICT (draft_id) DO NOTHING`,
      eventId,
      projectId,
      draft.id,
    );

    return {
      success: true,
      draftId: draft.id,
      projectId,
      dashboardTaskId: taskId,
      promotedAt,
      counts,
    };
  });
}
