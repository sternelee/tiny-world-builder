# CodeSurf Workspace Memory — tinyworld

_Generated: 2026-05-27 (tenth pass)_

---

## Overview

Tiny World Builder is a single-file, no-bundler 3-D isometric world editor built on Three.js r128. The runtime is `tiny-world-builder.html` (inline CSS + JS, ~32k+ LoC). `LandscapeEngine.js` handles procedural continuous terrain; internals in `engine/landscape/` mixin modules (chunks.js, geometries.js, noise.js, shaders.js, water.js). Deployment is static: `publish.sh` → `dist/`. `npm test` runs ESLint + HTMLHint; all pass.

---

## Durable Architecture Facts

**Core data contract**
- `world[x][z]` — intent layer; `cellMeshes['x,z']` — render layer
- All mutations via `setCell(x, z, opts)`; sparse-safe reads via `getWorldCell()` / `ensureWorldCell()`
- Never write to `world[x][z]` directly outside init

**Planet underlay** (committed and clean), **Water flow system** (committed and clean), **Ghost world generation** (full-quality leaf merge committed on asset-system-slice) — all unchanged from prior pass.

---

## Branch State

**main** — top commits now include `Update DREAMING.md` → `Update tiny-world-builder.html` → `Add model assets and stamp tooling` (newer than what previous pass recorded).

**asset-system-slice** (`/private/tmp/tinyworld-asset-system`) — 8 commits ahead of main, working tree dirty with two uncommitted files:
- `tiny-world-builder.html` — Stamps category strip (compact 31px strip above grid, browser-verified, category + search filters compose correctly)
- `.codex/skills/tinyworld-asset-editing/SKILL.md` — updated with category strip contract

---

## Inspected Gaps (read-only sessions, no patch committed)

- **`makeModelStamp()` ignores `opts.appearance`** — `makeVoxelRenderForCell()` passes it at ~line 13391; `makeModelStamp()` doesn't consume it at ~line 12272. Low-risk patch candidate.
- **Asset clipboard active-target paste helper** — helper added to live file; full gap analysis done, no additional correctness patch identified.
- **Settings modal map** — `#render-modal` at ~line 4713; tab/panel switching via `active` class on `data-settings-tab`/`data-settings-panel` keys; safe regrouping plan exists but not implemented.
- **Freehand fence extras** — gap narrowed; may be subsumed by committed "avoid stacking drawn fence extras" — needs confirmation.

---

## Open Threads

- Commit Stamps category strip on asset-system-slice
- Merge asset-system-slice → main
- Patch `makeModelStamp()` to consume `opts.appearance` (~line 12272)
- Add unrouted skills to AGENTS.md on main (`tinyworld-ghost-world-gen`, `threejs-primitive-reconstructor`)
- LandscapeEngine visual QA; Stamp panel undo + rotation/flip; NPC memorySummary cap; Seasons `M.*` audit; OpenClaw MC Gateway failures; `plugins/`/`tools/` skill docs; stale worktree branches
