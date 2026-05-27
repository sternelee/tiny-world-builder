---
name: tinyworld-island-and-planes
description: Use when changing the home island layout, edge dressing, undersides, draped banners (autoincentive sponsor flag), plane/crop-duster flight paths, banner streamers, or which side of the island is "front".
---

# Tiny World Island & Planes

## Coordinate system + camera-facing side

- The home island is centred at world origin. Top of grass = `y = 0`. Underside
  of dirt slab + inverted stepped underside extends down from there.
- `GRID` (default 8, max 16, ranges from `HOME_GRID_MIN` to `HOME_GRID_MAX`) ×
  `TILE` (=1) sets the edge length. Half-width = `(GRID * TILE) / 2`.
- `DIRT_H = 0.55` — visible dirt block height.
- Default camera: `DEFAULT_AZIMUTH = π * 0.32`, `DEFAULT_POLAR = π * 0.30`
  → camera sits in the +X +Z quadrant looking back at origin. The **+Z face is
  the "front" of the island** (most camera-facing side).

## `buildHomeBorder()` flow

Defined ~line 16340. Rebuilds the island's undersides and edge dressing every
time the home grid changes:

```
clear homeBorderGroup children
vbox(... underside slab ...)
voxelInvertedSteppedRoof(... cascading underside ...)
addIslandRocketEngines(homeBorderGroup)
addIslandEdgeDressing(homeBorderGroup)    // tufts, rocks, dirt accents
buildIslandFrontBanner(homeBorderGroup)   // ← autoincentive drape
prepareHomeBorderForRender(homeBorderGroup)
buildDistantWorlds()
buildUnderIslandClouds() (if defined)
```

Anything you add that should live on the island should be appended inside
`buildHomeBorder()` so it rebuilds correctly when the user changes
`#render-home-grid` (the home board size selector).

## Autoincentive sponsor banner

The PNG/JPG ships inline as `AUTOINCENTIVE_BANNER_DATA_URL` (~41 KB base64
JPEG) so there's no extra HTTP. Same data URL feeds:

1. The island front-facing drape (`buildIslandFrontBanner`) — a flapping
   cloth mesh on the +Z side, top edge anchored just below the grass
   (`ISLAND_BANNER_TOP_Y = -0.32`), offset outward from the rock face by
   `ISLAND_BANNER_OFFSET = 0.35` so it doesn't intersect edge dressing.
2. The sponsor logo in the Workspace settings panel
   (`<img id="sponsor-logo-autoincentive">`, populated by the
   `applyAutoincentiveSponsorLogo` IIFE). The image is clickable, opening
   `https://x.com/Autoincentiv3` in a new tab.

The flap shader is custom (`tickIslandBanners` ticked from
`updateCropDuster`'s loop): top edge fixed, motion grows toward the bottom
(`t = -by / H`), side-to-side sway + forward/back ripple, slight gravity droop.

If the user changes art, swap the data URL and the `2.5:1` aspect — width
fits ~`GRID * 0.7`.

## Plane / crop-duster system

Defined in the **crop duster route / state** section (~line 26200).

- 3-plane pool (`planes[]`), shown in formations or solo.
- Two run kinds chosen randomly each cycle:
  - `startDustingRun()` — uses `planDustingCurve()` to sweep over crop cells.
  - `startBannerRun()` — uses `planBannerCurve()` to fly **behind** the
    island so the towed text banner reads against the sky.
- `planBannerCurve()` places the path at `target.z - (GRID * 0.5) - (GRID * 2)`
  — i.e. ~2 island lengths behind the back edge. Altitude is
  `Math.max(renderCloudHeight + 0.2, FLIGHT_CRUISE_ALT - 1.6)` — a touch
  lower than the dusting cruise altitude.
- Engine sound is jet/rocket — use `foley-rocket-engines-1..4`, NOT
  `foley-propellers-*` or `large-prop-engine-*` (the model is a jet).

The towed banner cloth uses `updatePlaneBannerFlap` (per-vertex sine wave
travelling along the X axis). Banner messages come from `BANNER_MESSAGES`.

## When changing layout

- "Front" side of island = +Z. North/South/East/West correspond to ±X / ±Z;
  do not assume Y-up screen coordinates.
- Any new edge dressing must be added inside `addIslandEdgeDressing()` (per
  the existing per-edge loop with `cellRand` noise) so it stays consistent
  across all four sides.
- Anything anchored to the island that animates must be ticked from the
  central animation loop (call sites near `updateCropDuster(dt)` in
  `renderer.setAnimationLoop(animate)`).

## Validation

After island/plane changes:
- `node tools/check.js`
- Visually check at default 8×8 grid and after toggling to 16×16 — sizes
  rebuild the island.
- Confirm planes fly behind the island, banner stays readable against the
  sky, and engine sound (if positional audio active) pans correctly L↔R as
  the plane crosses the camera.
