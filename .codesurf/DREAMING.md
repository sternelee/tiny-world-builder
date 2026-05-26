# CodeSurf Workspace Memory — tinyworld

_Generated: 2026-05-26 (fourth pass)_

## What was consolidated

**Durable architecture** (carried forward and refined):
- Core data contract (`world[x][z]`, `cellMeshes`, `setCell`)
- Planet underlay system added in commit 373c4d7 — second `LandscapeEngine` instance, atmosphere sheets, fog uniforms, `world.schema.json` updated
- Ghost preview throttling from commit 4424edc — `maybeEnsureGhostBoardsAroundTarget`, `ghostDetailReevaluationActive`, opacity caching, waterfall speed

**New features from today's CodeSurf sessions** (not yet committed, need browser QA):
- Custom Palette Generator, isometric debug grid overlay, weather intensity slider, spectator cam mode, terrain roughness control, ambient sounds, auto-save, history panel + undo/redo, time-of-day with sun movement, seasons system, World Stats panel, minimap

**Skills gap** (unchanged from prior passes):
- `tinyworld-ghost-world-gen` and `threejs-primitive-reconstructor` directories exist but are missing from `AGENTS.md` routing

**Infrastructure** (unchanged):
- Lead Ava + Orbit System healthy; MC-Gateway persistently failing; VibeClaw crons stalled; browser automation unavailable
