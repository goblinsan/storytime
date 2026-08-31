# StoryTime - Framework for Storytelling

A comprehensive React (Vite) application for creating and sharing stories with advanced storytelling tools.

## Features

### Story Creation Tools
- **Writing Guides**: Get assistance with plot structure, pacing, dialogue, and narrative techniques
- **Character Development**: Build rich, complex characters with backgrounds, traits, and relationships
- **World Building**: Create detailed maps, locations, and timelines for your story's universe
- **Culture Creation**: Design myths, languages, religions, and political systems for your world
- **Illustration Assistant**: Get help visualizing your characters, settings, and key scenes
- **Planning Guides**: Manage your project with Gantt charts, tasks, timelines, and budgets

### Story Sharing
- **Story Hosting**: Publish and share your stories with readers around the world
- **Browse Stories**: Discover amazing stories from the community
- **Collaboration**: Share your creative work and get feedback from other storytellers

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

## StoryTime Harness Worker

The StoryTime harness worker consumes generation tasks from project-dashboard and
stores draft campaign assets for human review. It never writes generated content
directly into canon tables and does not edit repository files.

```bash
npm run story-harness
```

Configuration:

- `DASHBOARD_BASE_URL`: project-dashboard API base URL.
- `DASHBOARD_API_TOKEN` or `DASHBOARD_CONTROL_WORKFLOW_TOKEN`: optional dashboard
  workflow token.
- `STORYTIME_DATABASE_URL` or `DATABASE_URL`: StoryTime Postgres connection.
- `LLM_BASE_URL`: local LLM API base URL.
- `LLM_MODEL`: local model name.
- `LLM_PROVIDER`: `ollama` by default, or `openai-compatible`.
- `STORYTIME_DASHBOARD_PROJECT_ID`: dashboard project id, default `22`.
- `STORYTIME_HARNESS_AGENT`: dashboard claim agent, default
  `storytime-harness`.
- `STORYTIME_HARNESS_LEASE_SECONDS`: claim lease, default `7200`.
- `STORYTIME_HARNESS_ENABLED`: enabled flag, default `1`. When `0`, skips intake cleanly.
- `STORYTIME_HARNESS_PAUSED`: pause flag, default `0`. When `1`, temporarily pauses intake without clearing environment.
- `STORYTIME_HARNESS_DRY_RUN`: when truthy, lists eligible tasks and does not
  claim, call an LLM, or touch the database.
- `STORYTIME_HARNESS_LOOP`: when truthy, continuously polls outside dry-run mode.
- `STORYTIME_HARNESS_POLL_INTERVAL_MS`: loop delay, default `60000`.

The first MVP job type is `draft_campaign_asset_bundle`. Eligible dashboard
tasks must be `open`, unclaimed or expired, delegated as `unsupported` or
`human_required`, and labeled with both `storytime-generation` and
`storytime-job:draft_campaign_asset_bundle`. Tasks labeled `local-code` are left
for the coding conductor.

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
