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
        await tx.run(
          `INSERT INTO timeline_events (
             id, project_id, date, title, description,
             source_draft_id, source_task_id
           ) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET
             project_id = EXCLUDED.project_id,
             date = EXCLUDED.date,
             title = EXCLUDED.title,
             description = EXCLUDED.description,
             source_draft_id = EXCLUDED.source_draft_id,
             source_task_id = EXCLUDED.source_task_id`,
          evt.id,
          projectId,
          evt.date || '',
          evt.title || 'Untitled Event',
          evt.summary || '',
          draft.id,
          taskId,
        );
        counts.timelineEvents++;
      }
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
