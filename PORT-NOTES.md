# OWB → TinyWorld port notes (`feat/owb-port`)

Tracks what landed from `open-world-builder` and what was deliberately
deferred. Each landed item is a separate commit on this branch.

## Shipped

| # | Item                                | Status   | Where                       |
| - | ----------------------------------- | -------- | --------------------------- |
| 1 | Palette / design tokens             | shipped  | new components reuse the    |
|   |                                     |          | existing `--bg`/`--panel`/  |
|   |                                     |          | `--ink`/`--muted`/`--line`/ |
|   |                                     |          | `--accent` vars             |
| 8 | First-person + top-down view popup  | shipped  | `#view-modes` button → 3-   |
|   |                                     |          | option popup bound to       |
|   |                                     |          | `setCameraMode`             |
| 9 | Time / season / weather drawer      | shipped  | `#time-weather` button →    |
|   |                                     |          | `#time-popup`. CSS-only via |
|   |                                     |          | `body.tod-*`/`weather-*`    |
|   |                                     |          | + `#tod-tint` overlay       |
| 10| Developer / showcase mode           | shipped  | `#dev-mode` button reuses   |
|   |                                     |          | the existing stats overlay  |
|   |                                     |          | (backtick toggle)           |
| 11| Command palette (⌘K)                | shipped  | `#palette-overlay` indexes  |
|   |                                     |          | TOOLS + top-bar + settings  |
|   |                                     |          | tabs + raise/lower          |
| 12| World-name popup menu               | shipped  | brand title → `#world-menu` |
|   |                                     |          | with multi-slot local store |
|   |                                     |          | (`tinyworld:worlds.v1`)     |
| 13| AI generate panel (seed + biomes +  | shipped  | `#gen-modal` extended with  |
|   | elevation + gpt-image-1 plan)       |          | seed input, biome composition|
|   |                                     |          | sliders (auto-sum 100%),    |
|   |                                     |          | elevation sliders, "sketch  |
|   |                                     |          | plan first" calling         |
|   |                                     |          | gpt-image-1                 |
| 7 | Raise / lower controls              | shipped  | `R` / `F` shortcuts +       |
|   |                                     |          | palette entries; clamped    |
|   |                                     |          | 1..8 on `terrainFloors`     |

## Deferred (intentional)

| # | Item                                | Reason                       |
| - | ----------------------------------- | ---------------------------- |
| 4 | Port map / terrain generation       | OWB's `generate.js` +        |
|   |                                     | `terrain.js` operate on a    |
|   |                                     | 192+ instanced grid with     |
|   |                                     | biome maps; wholesale port   |
|   |                                     | would replace tinyworld's    |
|   |                                     | 8×8 render pipeline.  The AI |
|   |                                     | generate panel (item 13) now |
|   |                                     | exposes the same conceptual  |
|   |                                     | surface (biome %, elevation  |
|   |                                     | %, seed) within tinyworld's  |
|   |                                     | existing pipeline.           |
| 5 | Performance optimisations / vsync   | TinyWorld already has its    |
|   |                                     | own 60fps render-settings    |
|   |                                     | (resolution scale, shadow    |
|   |                                     | quality, smoothing, visible  |
|   |                                     | distance) and frame loop.    |
|   |                                     | OWB's instanced renderer +   |
|   |                                     | dirty-region passes are      |
|   |                                     | tightly coupled to its       |
|   |                                     | engine and not portable.     |
| 6 | New objects (plants / animals)      | Tinyworld already supports   |
|   |                                     | tree / tuft / rock / bridge /|
|   |                                     | crop / corn / wheat /        |
|   |                                     | pumpkin / carrot / sunflower.|
|   |                                     | New kinds (animals, more     |
|   |                                     | plant species) require new   |
|   |                                     | renderer geometry, which is  |
|   |                                     | a larger change than this    |
|   |                                     | port should touch.  The      |
|   |                                     | richer kind list from OWB    |
|   |                                     | can be layered on later by   |
|   |                                     | adding to TOOLS + writing    |
|   |                                     | the corresponding factory.   |

## Architecture honoured

The branch never touches the existing render pipeline, animation system
(voxel clouds, chimney smoke, crop duster, banner streamer, ghost
boards), audio panel, auth flow, account modal, or render-settings
panel. All additions are overlays / popups / shortcuts that route
through existing public functions (`setCameraMode`, `applyState`,
`setCell`, `toggleStatsOverlay`, etc.). No CSS rules override the live
`#cloud-layer` keyframes — the time-of-day tint uses a separate
`#tod-tint` element.
