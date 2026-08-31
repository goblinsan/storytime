import db from '../db.js';

export class PromotionError extends Error {
  constructor(message, status = 400, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

export async function promoteDraftToCanon(draftId, { db: database = db, force = false } = {}) {
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

  if (draft.artifact_type !== 'campaign_bundle') {
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

    // 2. Promote locations
    if (Array.isArray(payload.locations)) {
      for (const loc of payload.locations) {
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

    // 6. Record promoted_at on generated_drafts
    const promotedAt = new Date().toISOString();
    await tx.run(
      `UPDATE generated_drafts
       SET promoted_at = ?, updated_at = now()
       WHERE id = ?`,
      promotedAt,
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
