# StoryTime Dashboard Harness Contract

This is the MVP contract for a StoryTime worker that consumes content-generation
work from project-dashboard. It is not the task-flow coding conductor: it does
not edit repositories, create branches, run tests, merge code, or mark coding
tasks complete. Its only job is to claim StoryTime content tasks, gather canon
context from StoryTime, ask a local LLM for bounded draft content, run
deterministic checks, store the result as generated/unreviewed draft material,
and write a dashboard comment that points back to the draft.

## Job Type

The initial MVP job type is `draft_campaign_asset_bundle`.

One run may propose:

- one world brief
- three NPCs
- two factions
- three locations
- five timeline events

Generated output is draft material. It must not become canon until a person or a
future review workflow accepts it.

### Hierarchical Scoped Lore Task Taxonomy

For the broader hierarchical generation architecture replacing the monolithic
campaign bundle model, see [`docs/lore-task-taxonomy.md`](./lore-task-taxonomy.md).
That specification defines the 14 first-class task families (cosmology, geography,
settlements, factions, timelines, religion, culture, characters, creatures, economy,
magic/technology, conflicts, rumors, session prep), bounded context packet budgets,
and parent/child promotion pipelines.

## Dashboard Selection

The first worker query is:

```http
GET /projects/22/tasks?status=open
```

The worker then filters client-side until the dashboard exposes a dedicated
label query:

- `delegation_status` is `unsupported` or `human_required`
- `labels` contains `storytime-generation`
- `labels` contains `storytime-job:draft_campaign_asset_bundle`
- `labels` does not contain `local-code`
- `claimed_by` is empty or expired

The worker claims a task before any model call:

```http
POST /projects/22/tasks/{taskId}/claim
{ "agent": "storytime-harness", "status": "in_progress", "lease_seconds": 7200 }
```

StoryTime generation tasks intentionally do not use `delegation_status:
local_ready`; that value belongs to the code conductor.

## Required Task Metadata

The task description or metadata must provide:

- `storytimeProjectId`: the StoryTime `stories.id` row to use as canon context
- `jobType`: `draft_campaign_asset_bundle`
- `brief`: the operator's creative prompt
- optional `focus`: one of `world`, `characters`, `factions`, `locations`,
  `timeline`, or `balanced`
- optional `mustReference`: known entity ids that should be used
- optional `avoid`: themes, names, tones, or facts to avoid

The worker rejects the task before calling a model if `storytimeProjectId` or
`jobType` is missing.

## StoryTime Context Query

The first exact StoryTime context read is:

```sql
SELECT id, title, description, content, type
FROM stories
WHERE id = ?;
```

The worker then reads compact canon rows scoped to the same project:

```sql
SELECT id, name, description, background, character_type, role, current_location_id
FROM characters
WHERE project_id = ?
ORDER BY created_at ASC;

SELECT id, name, description, region_type, political_notes
FROM locations
WHERE project_id = ?
ORDER BY name ASC;

SELECT id, name, description, goals
FROM factions
WHERE project_id = ?
ORDER BY name ASC;

SELECT id, date, title, description
FROM timeline_events
WHERE project_id = ?
ORDER BY date ASC, title ASC;
```

The context object passed to the model and gate uses only ids, names, summaries,
and fixed before/after facts derived from the ordered timeline.

## Prompt Inputs

The model prompt receives JSON with:

- `jobType`
- `storytimeProject`
- `brief`
- `focus`
- `existingCharacters`
- `existingLocations`
- `existingFactions`
- `fixedTimelineFacts`
- `mustReference`
- `avoid`
- `outputSchemaVersion`

The prompt must instruct the model to return JSON only and to put all proposed
new entity ids in the bundle itself. Referencing an undeclared id is invalid.

## Output Schema

The model must return:

```json
{
  "jobType": "draft_campaign_asset_bundle",
  "schemaVersion": 1,
  "worldBrief": {
    "name": "string",
    "summary": "string",
    "themes": ["string"],
    "openQuestions": ["string"]
  },
  "characters": [{
    "id": "string",
    "name": "string",
    "role": "string",
    "summary": "string",
    "motivation": "string",
    "locationId": "string",
    "factionIds": ["string"]
  }],
  "factions": [{
    "id": "string",
    "name": "string",
    "summary": "string",
    "goals": ["string"],
    "alliedFactionIds": ["string"],
    "rivalFactionIds": ["string"]
  }],
  "locations": [{
    "id": "string",
    "name": "string",
    "summary": "string",
    "regionType": "string",
    "factionIds": ["string"]
  }],
  "timelineEvents": [{
    "id": "string",
    "date": "string",
    "title": "string",
    "summary": "string",
    "after": ["string"],
    "before": ["string"],
    "characterIds": ["string"],
    "locationIds": ["string"],
    "factionIds": ["string"]
  }]
}
```

## Draft Provenance

Stored drafts must include:

- StoryTime project id
- artifact type, beginning with `campaign_bundle`
- generated JSON payload
- status: `generated`, `accepted`, or `rejected`
- dashboard project id
- dashboard task id
- dashboard attempt or run id when available
- model provider and model name
- prompt fingerprint
- deterministic gate result
- timestamps

## Deterministic Rejection Cases

The consistency gate rejects the model output before storage when:

- the top-level job type is not `draft_campaign_asset_bundle`
- any payload object contains fields outside the schema above
- a character, location, or faction reference points to an id that is neither in
  the current StoryTime context nor declared as a proposed new entity in this
  same bundle
- a timeline event orders itself before/after an unknown event id
- a timeline event contradicts a fixed before/after fact from canon

The gate is deterministic JavaScript. It is not an AI judge and does not make
model calls.

## Dashboard Transitions

On success:

1. Insert a generated draft row with status `generated`.
2. Comment on the dashboard task with the generated draft id, artifact type, and
   gate status.
3. Release the task to `acceptance_review`.

On deterministic rejection:

1. Insert a generated draft row with status `rejected` if the payload is
   parseable enough to preserve.
2. Comment with structured violation codes.
3. Release the task to `blocked`.

On infrastructure or model failure:

1. Do not create canon rows.
2. Comment with the failing phase and retry guidance.
3. Release the task to `blocked`.
