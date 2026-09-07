# Contesora — Universe Encyclopedia & Setting Canon Store

Contesora is a universe encyclopedia and durable canon store for worldbuilding, lorebooks, and downstream creative derivatives.

## Product Model: Universe Projects & Derivative Works

A **Project** in Contesora represents a universe or setting encyclopedia — the durable workspace and source of truth for:
- **Geography & World Map**: multi-level world nodes, regions, areas, terrain, and travel paths
- **Cast & Characters**: characters, personas, backgrounds, roles, motivations, and cross-project identities
- **Factions & Geopolitics**: power blocs, alliances, border treaties, and political tensions
- **History & Timelines**: epochal milestones, turning points, and causal event chains
- **Universe Bestiary**: creatures, ecological threats, encounter pressures, and shared variants
- **Culture, Language & Religion**: myths, deities, rituals, taboos, and naming conventions
- **Canon Graph**: typed relationships linking characters, factions, places, and events

Downstream creative outputs — **campaigns**, **prose stories**, **screenplays**, **game concepts**, and **storyboards** — are **derivative works** generated from or attached to that universe. Derivatives cite hardened canon facts rather than owning a detached world model.

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run linter
npm run lint
```

## Contesora Harness Worker

The Contesora harness worker consumes generation tasks from project-dashboard and
stores draft campaign assets for human review. It never writes generated content
directly into canon tables and does not edit repository files.

```bash
npm run story-harness
```

Configuration:

- `DASHBOARD_BASE_URL`: project-dashboard API base URL.
- `DASHBOARD_API_TOKEN` or `DASHBOARD_CONTROL_WORKFLOW_TOKEN`: optional dashboard
  workflow token.
- `CONTESORA_CANON_AGENT`: `off` to stop the server answering canon requests
  itself. On by default; each request spends one Claude Code session, and the
  answer is a draft nobody has accepted.
- `CONTESORA_CANON_AGENT_COMMAND`: what to run instead of `claude -p`. Given the
  prompt on stdin, must print a JSON object.
- `CONTESORA_CANON_REQUEST_WEBHOOK`: where to POST when a request is filed, for
  sending it somewhere else as well.

See [docs/asking-for-canon.md](docs/asking-for-canon.md) for the whole loop.

- `CONTESORA_DATABASE_URL` or `DATABASE_URL`: Contesora Postgres connection.
  `STORYTIME_DATABASE_URL` is still read, so a host can be migrated after the
  deploy rather than during it. Every `CONTESORA_*` setting answers to its old
  `STORYTIME_*` name the same way; the server names any it still sees at boot.
- `LLM_BASE_URL`: local LLM API base URL.
- `LLM_MODEL`: local model name.
- `LLM_PROVIDER`: `ollama` by default, or `openai-compatible`.
- `STORYTIME_DASHBOARD_PROJECT_ID`: dashboard project id, default `22`.
- `STORYTIME_HARNESS_AGENT`: dashboard claim agent, default
  `storytime-harness`.
- `STORYTIME_HARNESS_LEASE_SECONDS`: claim lease, default `7200`.
- `STORYTIME_HARNESS_ENABLED`: enabled flag, default `1`. When `0`, skips intake cleanly.
- `STORYTIME_HARNESS_PAUSED`: pause flag, default `0`. When `1`, temporarily pauses intake without clearing environment.
- `GPU_LEASE_BASE_URL` or `GPU_LEASE_URL`: optional GPU Lease service base URL (e.g. `http://<core-node>:5404`).
- `GPU_LEASE_PROFILE_ID`: GPU Lease profile id (e.g. `llm-papai-mistral-small-31-24b-q4km`).
- `GPU_LEASE_OWNER`: lease owner identifier, default `storytime-harness`.
- `GPU_LEASE_PRIORITY`: lease request priority, default `500`.
- `GPU_LEASE_TTL_SECONDS`: lease duration in seconds, default `1800`.
- `GPU_LEASE_UNLOAD_ON_RELEASE`: when truthy, requests backend model unload upon release.
- `GPU_LEASE_ENABLED`: enabled flag for lease acquisition, default `1`.
- `STORYTIME_HARNESS_DRY_RUN`: when truthy, lists eligible tasks and does not
  claim, call an LLM, or touch the database.
- `STORYTIME_HARNESS_LOOP`: when truthy, continuously polls outside dry-run mode.
- `STORYTIME_HARNESS_POLL_INTERVAL_MS`: loop delay, default `60000`.

The initial MVP job type is `draft_campaign_asset_bundle`. Eligible dashboard
tasks must be `open`, unclaimed or expired, delegated as `unsupported` or
`human_required`, and labeled with both `storytime-generation` and
`storytime-job:draft_campaign_asset_bundle`. Tasks labeled `local-code` are left
for the coding conductor.

For the typed hierarchical lore generation model (14 task families, scoped context packets, parent/child refinement rules), see [`docs/lore-task-taxonomy.md`](docs/lore-task-taxonomy.md).

### Service Deployment & Control Plane Operations

The harness is operator-managed and decoupled from the web serving path. It can be run either:
1. As a scheduled timer job via systemd (`storytime-harness.timer` / `storytime-harness.service`), executing oneshot runs during idle cycles.
2. As a continuous background loop worker via Docker or systemd with `STORYTIME_HARNESS_LOOP=1`.

Operators can pause or disable the harness without redeploying by updating `STORYTIME_HARNESS_PAUSED=1` or `STORYTIME_HARNESS_ENABLED=0` in `/srv/apps/storytime/shared/storytime-harness.env`.

Diagnostics are emitted as secret-safe structured JSON containing timestamp, duration, mode, taskId, draftId, and gateResult. All connection URIs, tokens, and authorization headers are scrubbed.

## Development

The application is built with:
- React 19
- TypeScript
- Vite
- React Router DOM

## Project Structure

```
src/
├── components/     # Reusable UI components
├── pages/         # Page components
├── types/         # TypeScript type definitions
└── utils/         # Utility functions
```

## License

MIT
