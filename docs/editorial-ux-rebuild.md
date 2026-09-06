# StoryTime Editorial UX Rebuild: Product & Implementation Contract

**Milestone**: #132 (`editorial-ux-rebuild`)  
**Status**: Binding Specification  
**Target Root**: `src/editorial/`  

---

## 1. Executive Summary & Non-Negotiable Architecture

This document establishes the binding product, architectural, and implementation contract for the clean frontend rebuild of StoryTime.

### 1.1 The Non-Negotiable Product Model
1. **A StoryTime Project IS a Universe**: A project represents a world, its canon lore, timeline, geography, bestiary, factions, and internal continuity. A project is **never** a campaign, novel, screenplay, or story.
2. **Derivative Works Are Outputs Within a Universe**: Stories, novels, campaigns, screenplays, storyboards, graphic novels, lore anthologies, and video-game concepts are derivative formats (`WorkType`) grounded in a parent universe.
3. **Campaigns Do Not Dominate the Architecture**: Campaign planning and tabletop RPG framing are treated as one specialized presentation of derivative works, not the organizing structure of the application.
4. **Clean Root Under `src/editorial`**: All new product UI lives exclusively under `src/editorial/`.
5. **Zero Legacy Wrapping**: The new frontend must **not** import, wrap, adapt, or restyle legacy components or styling:
   - `src/components/layout/Layout.tsx`
   - `src/pages/Home.tsx`
   - `src/pages/CreateStory.tsx`
   - Legacy cluster-tab navigation (`clusterTabs`)
   - `src/components/story/StoryReader.tsx`
   - `src/components/derivatives/DerivativeWorksManager.tsx`
   - Legacy page stylesheets (`src/App.css`, `src/index.css`, legacy CSS modules)
6. **Durable Backend Reuse via Clean Contracts**: Durable backend storage, database tables, and autonomous generation worker endpoints are accessed strictly through explicit API client methods (`src/editorial/api.ts`) typed by `src/editorial/types.ts`.
7. **Mandatory Legacy Retirement**: The removal and deletion of the legacy frontend shell and obsolete presentation assets is an explicit requirement for milestone completion (Task 1014).

---

## 2. Information Architecture & Navigation

### 2.1 Top-Level Navigation Shell
The workspace shell (`.editorial-shell`) provides a restrained editorial environment:
- **Collapsible Sidebar (`.editorial-sidebar`)**:
  - **Desktop Expanded (248px)**: Displays universe brand, active universe context selector, global navigation links, specialized lens shortcuts, and count badges.
  - **Desktop Collapsed (68px)**: Compresses to an icon rail preserving primary navigation affordances.
  - **Tablet/Mobile (<=900px)**: Shifts to an off-canvas slide-out drawer (`transform: translateX(-100%)`) with an accessible backdrop (`.editorial-sidebar-backdrop`), triggered by a menu button in the top bar.
- **Restrained Top Bar (`.editorial-topbar`)**:
  - Fixed 48px height (`--editorial-topbar-height`).
  - Contains navigation breadcrumbs, mobile drawer toggle, global universe quick-switcher, and contextual status/action triggers.
- **Main Content Area (`.editorial-shell__content`)**:
  - Bound by max-width 1280px (`--editorial-container-max-width`) with full-width unframed bands.
  - Unframed linear scanning lists instead of nested, decorative card grids.

### 2.2 Canonical Route Tree
All application routes map into a clean, predictable hierarchy:

| Route Path | View / Surface | Purpose |
| :--- | :--- | :--- |
| `/` | `CrossUniverseDashboard` | Global portfolio briefing, active concerns, recent activity, system status |
| `/universes/new` | `UniverseOnboarding` | Guided universe creation (premise, genre, setting, themes, guardrails) |
| `/universes/:id` | `UniverseDashboard` | Universe briefing, direction statement, backlog, concerns, quick lenses |
| `/universes/:id/direction` | `UniverseDirectionView` | Direction statement, themes, tone, prohibited elements, autonomy settings |
| `/universes/:id/encyclopedia` | `EncyclopediaIndex` | Searchable, filterable catalog of all canon entities in the universe |
| `/universes/:id/characters` | `CharactersFamilyLens` | Principal cast triage, character traits, motivation, family tree graph |
| `/universes/:id/geography` | `GeographyMapLens` | Hierarchical territory tree, territory canvas, terrain grid, travel paths |
| `/universes/:id/timeline` | `TimelineContinuityLens` | Chronological era lanes, causal event dependencies, continuity paradox flags |
| `/universes/:id/societies` | `SocietiesFactionsLens` | Faction dossiers, geopolitical pressures, diplomatic web, religions & doctrine |
| `/universes/:id/bestiary` | `BestiaryEcologyLens` | Ecological niches, threat levels, habitat mapping, shared creature adoptions |
| `/universes/:id/works` | `WorksLibrary` | Neutral library of stories, novels, campaigns, screenplays, graphic novels |
| `/universes/:id/read/:workId` | `DedicatedReader` | Full-viewport mobile-first reader with annotations and repair preview |
| `/universes/:id/media` | `MediaStudio` | Asset reference library, visual description tasks, generated imagery |
| `/universes/:id/settings` | `UniverseSettings` | Theme customization, protection audit logs, guardrail rules, autonomy locks |
| `/compendium` | `SharedCompendium` | Cross-universe archetypes for characters and creatures; variant tracking |

### 2.3 Legacy URL Redirects
For backwards compatibility with existing bookmarks and links, legacy URLs are mapped permanently via `src/editorial/routes.tsx`:
- `/stories` $\to$ `/`
- `/stories/:id` $\to$ `/universes/:id`
- `/create` $\to$ `/universes/new`
- `/reader/:id` $\to$ `/universes/:id/read/:id`
- Legacy tab queries (e.g. `?tab=characters`) map directly to the corresponding lens (e.g. `/universes/:id/characters`).

---

## 3. Core Working Surfaces

### 3.1 Cross-Universe Working Dashboard
- **Calm Global Briefing**:
  - High-level status: Total Universes, Total Works, Total Canon Entities, Open Concerns, Ready Repairs.
  - Active background generations and GPU worker status.
- **Linear Scanning Rows**:
  - **Active Concerns (`.editorial-concern-row`)**: Tabular rows categorized by severity (`critical`, `warning`, `advisory`) and kind (`continuity`, `character_inconsistency`, `lore_contradiction`, `timeline_paradox`, `unresolved_flag`).
  - **Recent Activity (`.editorial-activity-row`)**: Chronological audit stream identifying actor (`author`, `agent`, `system`, `harness`), action category, timestamp, and entity link.
  - **Pending Repairs (`.editorial-action-row`)**: Actionable queue of generated passage repair proposals awaiting review.

### 3.2 Zero-Universe Onboarding
When no universes exist:
- Avoid multi-step gamified wizards or campaign questionnaires.
- Present a calm editorial prompt establishing the initial universe:
  1. Universe Name & Title.
  2. Narrative Classification (`UniverseGenre`, e.g. Speculative Fiction, High Fantasy, Cyberpunk).
  3. Setting Category (`UniverseSettingCategory`, e.g. Secondary World, Alternate History, Far Future).
  4. Foundational Premise & Core Themes (free text and tag inputs).
  5. Initial Autonomy Posture (`manual`, `assisted`, or `autonomous_explore`).

### 3.3 Universe Dashboard & Visual Atmosphere
- **Universe Header (`.editorial-universe-header`)**:
  - Title, genre tags, concise direction statement.
  - Quick summary of canon volume across all dimensions.
- **Direction Statement & Guidelines**:
  - Explicit narrative direction, target audience, tone guidelines, and strict guardrails / prohibited elements.
- **Curated Theme Customization**:
  - Five curated palette presets defined in `src/editorial/themes.ts`:
    - `neutral-codex`: Calm, bookish, warm neutral paper and charcoal.
    - `editorial-fantasy`: Warm parchment, deep umber, subtle terracotta.
    - `science-fiction`: Deep slate, cool silver, restrained cyan-indigo ink.
    - `speculative-mystery`: Soft ash, midnight slate, muted brass.
    - `historical-chronicle`: Warm linen, sepia ink, antique burgundy accents.
  - Controlled CSS variable overrides (`--theme-canvas`, `--theme-surface`, `--theme-text-heading`, etc.).
  - Cover image support with safe contrast overlay.
  - **Strict Constraint**: Themes may alter color variables and font stacks, but must never alter navigation geometry, layout margins, or spacing tokens.

---

## 4. Autonomous Generation & Canon Governance

### 4.1 High-Autonomy Harness Execution
- StoryTime operates as an autonomous generation and exploration engine:
  - Local AI agents and harness workers poll the project backlog to explore gaps, author lore, draft chapters, and sequence events.
  - Workers operate against deterministic gates: schema validation, critique gates, and consistency gates.

### 4.2 Protected Canon Protection Rule
- **The Protected Entity Invariant**:
  - Any entity in the encyclopedia (character, location, event, creature, faction, or technology) marked as protected (`isProtected: true`) is locked against automated destructive mutation.
  - Autonomous workers are prohibited from overwriting, deleting, or silently mutating protected records.
  - If a worker or critique gate identifies an inconsistency or proposes an enhancement involving a protected record:
    1. It cannot write directly to the canon entity.
    2. It creates an `EditorialConcern` or an explicit `RepairProposal`.
    3. The repair proposal requires human review and explicit authorization (`requiresExplicitApproval: true`) before application.

### 4.3 Gap-Driven Backlog Scheduling
- Backlog items (`EditorialBacklogItem`) model work queues across six discrete stages:
  - `backlog` $\to$ `in_discovery` $\to$ `drafting` $\to$ `critique` $\to$ `ready_for_review` $\to$ `completed`.
- Workers prioritize items by `priorityScore` and respect universe direction guardrails.

---

## 5. Purpose-Built Specialized Lenses

StoryTime replaces flat entity listings with purpose-built editorial lenses:

### 5.1 Characters & Family Lens (`.editorial-family-workspace`)
- Principal Cast Triage: Filtering by narrative importance (`principal`, `supporting`, `minor`).
- Character Dossier: Motivation, background, traits, tendencies, active timeframe years.
- Family Tree & Lineage Graph (`.editorial-family-tree`):
  - Interactive generational structure rendering ancestral trees and descendant branches.
  - Clan and house groupings.
  - Timeframe year-range slider and era filters to isolate relevant generations.
  - **Deliberate horizontal scrolling preserved** for deep genealogical trees with touch pan support.

### 5.2 Geography & Territory Lens (`.editorial-geography-layout`)
- Split workspace: Hierarchical location tree (World $\to$ Region $\to$ Area $\to$ Scene) alongside an interactive territory canvas.
- Terrain grid representation and region metadata (political control, hazard tiers).
- Connection Paths Table (`GeographyPath`): Route name, path type (road, river, pass, tunnel), travel time in days, and danger classification.

### 5.3 Timeline & Continuity Lens (`.editorial-timeline-view`)
- Chronological continuity lane marked by historical eras (`TimelineEra`).
- Explicit causal dependencies: Tracking prerequisite and consequent events.
- Automated Paradox Detection: Red badges flagging continuity paradoxes, timeframe overlaps, or anachronisms.

### 5.4 Societies, Factions, & Faith Lens (`.editorial-societies-layout`)
- Faction Dossiers: Strategic goals, geopolitical leverage, internal corporate/guild structures.
- Diplomatic Alignment Matrix: Bidirectional relations (`allied`, `friendly`, `neutral`, `hostile`, `at_war`).
- Faith & Doctrine Registry: Pantheons/deities, sacred doctrines, holy sites, sacred taboos, and clergy hierarchy.

### 5.5 Bestiary & Ecological Niches Lens (`.editorial-bestiary-layout`)
- Ecological Niches: Habitats, apex predators, prey flora/fauna, environmental hazards.
- Creature Profiles: Threat level (`docile` to `legendary`), combat roles, behavioral tendencies, habitat associations.
- Shared Compendium Adoption: Badging for creatures adopted from shared canon, with variant divergence tracking.

### 5.6 Neutral Works Library (`.editorial-works-library`)
- Catalog of all derivative works created within the universe.
- Structured by format: Stories, Novels, Screenplays, Campaigns, Graphic Novels, Storyboards, Game Concepts.
- Tracks compilation status (`draft`, `in_review`, `revised`, `approved`, `published`), word count, and chapter progress.

### 5.7 Visual Reference & Media Studio (`.editorial-media-studio`)
- Asset catalog for uploaded illustrations, concept art, and generated imagery.
- Sequential Art / Graphic Novel storyboard frames.
- Autonomous Visual Description: Triggering `visual_description_from_image` tasks that dispatch to backend agents to generate accessible alt-text and canon-grounded visual summaries.

### 5.8 Shared Identity Compendium (`.editorial-compendium-layout`)
- Universal archetypes for characters and creatures reusable across multiple universes.
- Tracks canonical base traits alongside universe-specific local variants (`SharedIdentityVariant`).
- Displays divergence summaries comparing local modifications against shared source canon.

---

## 6. Mobile-First Dedicated Reader & Repair Workflow

### 6.1 Clean Reading Experience
- **Reading Typography**:
  - Strict **62–76 character line measure** (`--editorial-measure-min` to `--editorial-measure-max`) centered on screen.
  - Editorial serif font hierarchy with discrete scaling (15px–20px body).
  - Strict zero letter-spacing tracking.
- **Viewport & Chrome**:
  - Full viewport reading (`min-height: 100dvh`).
  - Minimal sticky header (48px) displaying work title, reading progress bar, chapter drawer trigger, and typography controls.
  - Safe-area insets (`env(safe-area-inset-*)`) handled across all edges.
- **Reading Themes**:
  - Three scoped reading modes:
    1. **Light**: Crisp white surface with warm charcoal ink.
    2. **Parchment**: Warm cream/ivory canvas (`#f7f3e9`), deep slate-charcoal text (`#2b2723`), soft linen borders (`#e3dccb`).
    3. **Dark**: Deep zinc canvas (`#18181b`), soft neutral prose (`#e4e4e7`), glare-free muted headings (`#fafafa`).

### 6.2 Stable Passage Locators & Agent-Review Handoff
- **Passage Locators (`PassageLocator`)**:
  - Deterministic anchoring using `workId`, `sectionId`, `startOffset`, `endOffset`, `selectedText`, and cryptographic `textSha256`.
  - Includes `contextBefore` and `contextAfter` padding to survive minor whitespace adjustments.
- **Machine-Readable Section Context Manifest (`SectionContextManifest`)**:
  - Endpoint `GET /api/reader-review/:workId/sections/:sectionId/context` returns the prose section along with all scoped characters, locations, factions, timeline events, and active guardrails.
  - Ready for consumption by external AI editorial agents.

### 6.3 Non-Obscuring Selection & Annotation Toolbar
- **Desktop**: Floats unobtrusively above selected text with an upward offset.
- **Mobile (<=640px)**:
  - Docks fixed to the bottom edge above the safe-area (`bottom: calc(var(--editorial-space-3) + env(safe-area-inset-bottom))`).
  - **Scroll Clearance Guarantee**: Viewport reserves `calc(8rem + env(safe-area-inset-bottom))` and prose reserves `5rem` bottom padding so prose can always be scrolled clear above the toolbar.
  - Provides quick action triggers: *Add Note*, *Flag Concern*, *Ask Agent*, *Copy Link*.
- **Visually Separable Markers**:
  - Inline marks use subtle colored hairline underlines (`.editorial-reader-mark--note`, `--concern`, `--agent`).
  - Annotations render in the margin or review drawer without cluttering the reading text.

### 6.4 Preview-Before-Approve "Fix Now" Workflow
- **Workflow Steps**:
  1. Author or agent flags a passage concern or continuity defect.
  2. Agent or harness worker proposes a targeted replacement passage (`RepairProposal`).
  3. Reader presents an accessible, color-independent diff comparison (`.editorial-repair-diff`):
     - Removals: Strikethrough prefixed with `[-]` and red tint.
     - Additions: Highlighted prefixed with `[+]` and green tint.
  4. Author reviews the diff directly in the reading context.
  5. One-click **Approve** (commits the repair, updates chapter prose and hash, logs audit provenance) or **Reject** (dismisses proposal with feedback).

---

## 7. Responsive & Accessibility Specifications

### 7.1 Responsive Constraints
- **Desktop (>900px)**:
  - 248px sidebar collapsible to 68px.
  - Multi-column scanning tables and split-pane workspaces.
- **Tablet (<=900px)**:
  - Sidebar transitions to off-canvas slide-out drawer with backdrop.
  - Two-column layouts compress to single column.
- **Mobile (<=640px)**:
  - Single-column linear layout across all dashboards, media studios, and work queues.
  - Multi-item grids (such as `.editorial-media-grid`) collapse to `grid-template-columns: 1fr`.
  - Scanning rows stack vertically without horizontal overflow.
  - Deliberate horizontal scroll preserved **only** for complex structural visualizations (Family Tree).
  - Minimum **44px $\times$ 44px touch targets** across all interactive elements (buttons, links, drawer items, form controls).

### 7.2 Accessibility (WCAG AA)
- **High-Contrast Typography**: All text meets or exceeds WCAG AA 4.5:1 contrast ratio against respective surfaces in light, parchment, and dark themes.
- **Accessible Focus System**:
  - Robust keyboard focus fallback on `:focus`.
  - Non-keyboard focus suppression via `:focus:not(:focus-visible)`.
  - High-visibility keyboard focus ring via `:focus-visible` with 2px solid outline and 2px offset.
- **Reduced Motion**:
  - Full `@media (prefers-reduced-motion: reduce)` support:
  - Collapses all transitions and animations to `0.01ms`.
  - Disables smooth scrolling.

---

## 8. Cutover & Legacy Retirement Criteria

Completion of Milestone #132 requires full cutover and total removal of legacy UI.

### 8.1 Verification Gate Prior to Cutover
Before retiring legacy code, the following must pass:
1. `npm run typecheck` passes with zero errors (`tsc -b`).
2. Vitest test suite (`npm test`) passes with 100% success across all unit and route tests.
3. Production build (`npm run build`) builds cleanly with no unresolved imports or missing assets.
4. Editorial routes render without runtime exceptions under Vite preview.

### 8.2 Mandatory Deletion Checklist (Task 1014)
Upon successful cutover, the following legacy assets must be completely deleted:
- `src/components/layout/Layout.tsx`
- `src/pages/Home.tsx`
- `src/pages/CreateStory.tsx`
- `src/components/story/StoryReader.tsx`
- `src/components/derivatives/DerivativeWorksManager.tsx`
- Obsolete cluster-tab components
- Legacy styles in `src/App.css` and `src/index.css` (retained only to the extent needed by non-editorial entry points until final purge)

No legacy adapter layers or compatibility wrappers may remain.
