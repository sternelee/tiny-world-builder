# CodeSurf Workspace Memory — tinyworld

Generated: 2026-05-31

---

## Overview

Tiny World Builder is a vanilla ES6, no-bundler 3D world editor built on Three.js r128. The app shell lives in `tiny-world-builder.html` (~1.4k lines); business logic is split across 39 numbered modules under `engine/world/` (00–37 + 99-late-boot.js), plus `engine/landscape/`. Total JS is approximately 40k+ lines. Deployed via Vercel and Netlify from `dist/` produced by `publish.sh`.

---

## Durable Facts

**Architecture**
- Primary file: `tiny-world-builder.html` — HTML shell, boot config, and ordered `<script src>` tags only
- Engine modules: `engine/world/00-prelude.js` through `engine/world/99-late-boot.js` — 39 modules total (00–37 + 99), numbered by load order
  - Newest modules: `34-flight-sim.js`, `35-tool-palette.js`, `36-mooring-interaction.js`, `37-island-placement-holos.js`
- Skills: 20 `.codex/skills/tinyworld-*` SKILL.md files; all routing entries in AGENTS.md are current
- `tinyworld-ghost-world-gen` and `threejs-primitive-reconstructor` present on disk but absent from AGENTS.md routing table
- Three.js pinned to r128; bumping is risky (shadow and material color-space changes in newer releases)
- All modules share one global scope (classic `<script>` tags, not ES modules) — load order matters; duplicate top-level identifiers throw `SyntaxError` and silently kill the declaring module

**Data layer contract (never break these)**
- `world[x][z]` — intent: `{ terrain, terrainFloors, kind, floors }`
- `cellMeshes['x,z']` — render: `{ tile: Group, object: Group|null }`
- All mutations go through `setCell(x, z, opts)` — direct writes to `world[x][z]` desync intent from rendering
- Materials in `M.*` are shared; never mutate in place, clone first
- `userData.landing` guards drop-in animations; never remove these checks

**Build / test**
- `npm test` — static checks
- `npm run build` — generates `dist/`
- `npm run icons` — re-bakes PNG tool icons (run after adding new tool kinds)
- `publish.sh` — copies `styles/`, `icons/`, `data/` into `dist/`

**Persistence**
- Runtime state in localStorage; `twSafeSetItem` wraps all writes (surfaces quota errors)
- World save/load via `29-persistence-api.js`; custom voxel stamps embedded in world save payload
- Defaults pipeline: `tinyworld-defaults.json` + `/api/save-defaults`
- URL param `?world=<same-origin-url>` loads a remote world at boot

**House style**
- Semicolons used throughout — follow existing file
- 2-space indent, trailing commas, single quotes
- Section headers: `// -------- name --------`
- No npm packages, no bundler — single-file constraint is intentional

---

## Active Subsystems

**Flight sim** (`34-flight-sim.js`, skill: `tinyworld-flight-sim`)
- Flyable plane via existing `stunt-plane` model-stamp (`models/stunt_plane.glb`) placed through the Stamps system — not a bespoke tool
- Plain click on placed stamp opens Enter/Fly menu; flight uses rear chase-cam + ported ships physics (sim-space → scene similarity transform); Escape exits

**Editable Islands** (`14-editable-islands-moorings.js`, `36-mooring-interaction.js`, `37-island-placement-holos.js`)
- Islands render terrain per-cell, matching home island parity (`ensureEditableIslandCellTiles`)
- 8-slot placement workflow with hologram snapping; hover/placement wired through `20-input-place-erase.js`
- Mooring cable routing avoids engine hazards (`MOORING_HAZARD_CLEARANCE`, `avoidMooringHazards`)
- Island side-backing clone now inherits the voxel seam shader from `M.boardSide` (`03-geometry-materials.js`); grid is fine-scale horizontal/vertical lines — not oversized blocks. Skill `tinyworld-island-and-planes` updated to document this.

**AI Generation** (`26-ai-generation.js`)
- Primitive approximation bias removed; primitives are "components, not a ceiling"
- Material vocabulary expanded
- Bespoke/custom part requests go through `customParts` as first-class low-poly models; seed type no longer over-preserved on custom requests

**Crowd / vehicle pathfinding** (`11-vehicle-crowd.js`)
- BFS grid pathfinder with segment/check/simplify utilities
- Path-biased wander routes: crowds favor road cells, avoid obstacles
- Spawn logic prefers path cells; walkable terrain set expanded

**Radial menu** (`33-radial-menu.js`)
- Context-sensitive ring rebuilt on selection type change
- Island selections restricted to move/rotate only

**Engine model system**
- Shared lift-engine system (`buildHomeIslandEngines`) — home and island engines unified
- Engine types: propeller (tinted), rocket (heavy variant), standard
- Selected engines reveal the agent panel (`28-generate-panel-agent.js`)

**Storage / asset utilities** (`00-prelude.js`)
- `twToast`, `twSafeSetItem`, `twDownloadJSON`, `twPickJSONFile`
- Asset library export/import: `exportAssetLibrary`, `importAssetLibrary`
- Custom voxel-build stamps: `referencedVoxelBuildStamps`, `registerEmbeddedVoxelBuildStamps`

**Known fixes (2026-05-31)**
- Startup race: texture load callbacks could call `renderScene()` before `worldGroup` exists, producing `ReferenceError: worldGroup is not defined`. Guard added; early texture callbacks no-op until scene graph is initialized.
- Island seam scale: side-backing clone was rendering plain oversized slabs. Fixed by explicitly copying the seam shader hook from `M.boardSide` into cloned island-shell materials (`03-geometry-materials.js`, `04-textures.js`).

---

## Skill Routing Reference

| Subsystem | Skill |
|---|---|
| Repo workflow / single-file constraints | `tinyworld-single-file` |
| Auto palette inference / cache | `tinyworld-auto-batching` |
| Ghost boards, panning, opacity torch | `tinyworld-opacity-torch` |
| Repeat-click levels, terrain variation | `tinyworld-tile-variation` |
| Selection, freehand draw, clipboard, Stamps nav | `tinyworld-asset-editing` |
| Browser checks, visual QA | `tinyworld-visual-qa` |
| Renderer, shadows, clouds, GPU budget | `tinyworld-render-performance` |
| Settings modal, tabs, accessibility | `tinyworld-settings` |
| WebXR AR/VR | `tinyworld-webxr` |
| 2.5D crowd sprites | `tinyworld-crowd-layer` |
| Low-poly world prompting | `tinyworld-lowpoly-world-prompt` |
| Low-poly asset design / import | `tinyworld-lowpoly-stylized-3d` |
| API, webhook, SSE, MCP, plugin | `tinyworld-integrations` |
| localStorage, defaults, audio, camera | `tinyworld-runtime-state` |
| Home island, sponsor banner, planes | `tinyworld-island-and-planes` |
| Tool icons (PNG bake), ghost billboard, mode indicator | `tinyworld-tool-icons-and-modes` |
| Block button aesthetic (raised square, dark outline) | `tinyworld-block-button-style` |
| Flyable plane via stunt-plane stamp | `tinyworld-flight-sim` |

Skills on disk but absent from AGENTS.md routing table (stable gap — unresolved across multiple sessions):
- `tinyworld-ghost-world-gen`
- `threejs-primitive-reconstructor`

---

## Open Threads

- `tinyworld-ghost-world-gen` and `threejs-primitive-reconstructor` skills exist in `.codex/skills/` but are not in the AGENTS.md routing table — has persisted across multiple dreaming cycles with no action; either wire them or explicitly remove
- `fork-improvements-report.md` at repo root (added 2026-05-30) — fork findings and recommended lifts; review status unknown
- OpenClaw cron jobs (VibeClaw Article Generator, Wallpaper Generator, Skills Scout, Tom Doerr Tweet Tracker) producing repeated assistant-turn failures — platform-level instability in OpenClaw cron execution
- OpenClaw `mc-gateway` session has persistent assistant turn failures; lead-agent heartbeat (Ava, board `c3f78d0c`) remains healthy
- Tom Doerr tweet tracker blocked by X.com login wall; Nitter fallback also unavailable
- `split-god-file.js` workflow in `.claude/workflows/` — purpose/status not confirmed in recent sessions

---

## Memory Notes

- No emoji anywhere — user strictly prohibits emoji in UI, code, and output
- Do not rebuild existing components; reuse as-is
- Verify UI/interaction behavior via 3D math (positions, bbox, ray math) — not browser screenshots or synthetic clicks
- PNG icons are baked via `npm run icons`; SVG glyphs are the canonical source; never reintroduce PNG baked-icon system to main
