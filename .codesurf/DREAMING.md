The existing file is comprehensive. The session evidence shows two concrete updates needed: `41-flight-combat.js` description is sparse (line 39, just "combat systems") and needs the flight combat refactor outcomes, and `99-late-boot.js` is missing `window.runTerrainBake`. Everything else is already well-captured. I'll write the updated file now.

# CodeSurf Workspace Memory — tinyworld

Generated: 2026-06-13

---

## Overview

Tiny World Builder is a vanilla ES6, no-bundler 3D world editor on Three.js r128. Shell lives in `tiny-world-builder.html` (~1.4k lines); logic is split across **56 modules** under `engine/world/` (numbered 00–52 + 99, with `09b` and two `46-` files). Styles in `styles/tiny-world.css` (~5.2k lines). Deployed via Vercel and Netlify from `dist/` via `./publish.sh`. Port 8888 is the Netlify dev server; must be running with local `tinyworld` Postgres before any Worlds MMO features can be browser-tested.

A separate **landing/marketing page** (`index.html`) is also in the repo with its own build/publish pipeline — distinct from `tiny-world-builder.html`.

---

## Durable Facts

**Architecture**
- Shell: `tiny-world-builder.html` — HTML, boot config, ordered `<script src>` tags only
- Engine modules: 56 `.js` files sharing one global scope + `flight-combat-math.mjs` (ES module companion to `34-flight-sim.js`); classic scripts, not ES modules
- Non-sequential extras: `09b-voxel-build-factories.js` (between 09 and 10); two files share the `46-` prefix (`46-mesh-terrain.js`, `46-worlds-universe.js`) — load order between them not formally documented
- Duplicate top-level identifiers silently kill the declaring module without affecting others; prefix module-local scratch globals (e.g. `_fl…` for flight)
- Highest non-99 module is `52-worlds-demo-seed.js`; modules 50–52 all exist
- Three.js pinned to r128; MeshLambertMaterial, ExtrudeGeometry, and shadow setup assume r128 semantics — do not bump
- Materials in `M.*` are shared across meshes — clone before mutating color; `disposeGroup` disposes geometries but NOT materials
- `setCell(x, z, opts)` is the only sanctioned way to mutate world state; never write `world[x][z]` directly outside of init
- No bundler, no npm runtime dependencies; `npm test` for static checks, `./publish.sh` for dist
- Edits auto-commit to main and Netlify prod deploys immediately — branches do not guarantee isolation

**Skill directories**
- `.codex/skills/` — 23 skill files for core engine systems (tinyworld-single-file, tinyworld-render-performance, tinyworld-flight-sim, etc.)
- `.agents/skills/` — 5 additional skills: `3d-modeling`, `lightweight-3d-effects`, `poly-pizza-api`, `threejs-primitive-reconstructor`, `tinyworld-i18n`
- AGENTS.md lists only `.codex/skills/` routing; `.agents/skills/` entries are not yet referenced there

**Module reference — modules 34 and above**
- `34-flight-sim.js` — flyable plane via `stunt-plane` model-stamp; click-to-Enter/Fly, rear chase-cam, Escape exits; `flight-combat-math.mjs` is its ES module companion; static body parts (fuselage, wings, tail, cockpit, wheels) merged into single BufferGeometry via `threeStdlib.mergeGeometries`; only engine node keeps `frustumCulled=false`, merged mesh and others set to `true` via post-merge `planeGroup.traverse`
- `38-multiplayer-partykit.js` — multiplayer via PartyKit
- `39-atmosphere-effects.js` — atmosphere/day-night effects; time-progression not wired to any UI control
- `40-shield-system.js` — VoxelShield materials are Lambert (cheaper at-rest lighting); per-mesh glow material clones are explicitly disposed on teardown
- `41-flight-combat.js` — combat systems; missiles/projectiles fully implemented; player hit detection stub removed 2026-06-12 (empty `if (hit) {}` block remains — actual health/damage system not yet implemented); altitude ceiling enforcement removed 2026-06-12 (plane has no upper altitude limit)
- `42-account-wallet-players.js` — JWT/cloud-save; subscription system fully removed 2026-05-31
- `43-drag-drop-import.js` — GLB/FBX/OBJ/VOX/VDB drag-drop pipeline
- `44-sub-object-edit.js` — part-level selection, hover hulls, transform delegation
- `45-shader-fx.js` — `window.TinyShaderFX`; GLSL effects via `onBeforeCompile`
- `46-mesh-terrain.js` — opt-in voxel-block landscape sculptor; persists under `tinyworld:meshTerrain:*`; no `setCell` bake
- `46-worlds-universe.js` — Worlds MMO universe map, world buying (USDC), management/publish; dispatches `tinyworld:worlds-ready` and exposes `window.__tinyworldWorldsReady` promise; does NOT reference `window.__tinyworldBattleworlds`
- `47-worlds-room.js` — Worlds MMO room client (PartyKit `world-<slug>`); sprite system uses `Without_shadow` sheets; exposes `WS.enterRoom/leaveRoom/harvest/setAvatarClass`
- `48-worlds-harvest-hud.js` — Worlds MMO in-world HUD (hearts, resources, harvest actions, cooldowns, reward popups); SVG glyphs only
- `49-worlds-avatar-picker.js` — avatar picker gallery; drives `WS.setAvatarClass`; extensible via `WS.registerAvatarProvider`
- `50-worlds-play-chat.js` — play-mode chat panel; wires to `47-worlds-room.js` events (chat/typing/peers/you/enter/leave); reuses `mp-chat-*` CSS classes + `tw-play-chat-*` glassmorphism overrides; IIFE-wrapped
- `51-worlds-bots.js` — localhost-only bot simulation; spawns 3 deterministic bots via PartyKit when entering a world; deterministic via seeded LCG PRNG; **localhost/127.0.0.1 only — never runs in production**
- `52-worlds-demo-seed.js` — localhost-only demo resource seeder; injects harvestable cells into `world.data.cells` before WebSocket opens if a world has no resources; **localhost/127.0.0.1 only — never runs in production**
- `99-late-boot.js` — late boot finalization; `?meshbake=1` URL param activates the early-prototype terrain bake (swaps `prepareFadeable` tiles → `baseMat` clone); `window.runTerrainBake` exposed for console/settings invocation; distinct from the full per-cell bake in `17-tile-renderers.js`

**Worlds MMO namespace**
- `window.__tinyworldWorlds` (alias `WS`) shared across all Worlds modules (46-universe, 47-room, 48-hud, 49-picker, 50-play-chat, 51-bots, 52-demo-seed); all IIFE-wrapped — no top-level globals leak
- `/api/worlds` lives at `netlify/functions/worlds.mjs`
- Worlds gameplay runs on PartyKit room server (separate infrastructure from Netlify site); a Netlify-only deploy does NOT update room behavior

**30-ui-boot-wiring.js**
- This file is 3,434 lines — it is NOT a thin delegation file; also contains full cloud sync logic (`twCloudAccessToken`, `twCloudApiCall`, `twCloudSyncLocalWorldsToCloud`, `twCloudBootstrapSync`, etc.)
- Key welcome-dialog functions: `initWelcomeDialog`, `openTinyverse` (async, waits for `window.__tinyworldWorlds.open`), `openBattleworlds` (sync stub, falls back to `chooseWelcomeMode('play')` if `window.__tinyworldBattleworlds.open` is absent)
- `waitForWorldsFrontend()` polls every 50 ms for up to 2 s; also listens to `tinyworld:worlds-ready` event and `window.__tinyworldWorldsReady` promise as dual signals

**Internationalization (i18n)**
- 4 locales: English (`en`), French (`fr`), Simplified Chinese (`zh`), Spanish (`es`)
- Locale data ships as IIFE JS files (`engine/i18n/en.js`, `fr.js`, `es.js`, `zh.js`), not JSON — avoids CORS/`file://` failures; `publish.sh` copies `engine/` recursively so no build change needed
- `engine/i18n/i18n-core.js` — IIFE; public surface: `t(key, params)` (global, with `{name}` interpolation + English fallback), `TWI18N.locale`, `TWI18N.supported`, `TWI18N.names` (endonyms), `TWI18N.apply(root)` (translate `data-i18n*` attributes), `TWI18N.setLocale(code)` (persist + reload); `en.js` is the authoritative key source
- Language switching is reload-on-switch (persist to localStorage + `location.reload()`); home grid survives because it autosaves to `tinyworld:v1` and restores on boot
- `tools/i18n-check.js` — key parity + usage checker; runs inside `npm run check` / `publish.sh`
- `docs/i18n.md` — architecture reference for the i18n system
- Skill: `.agents/skills/tinyworld-i18n/SKILL.md` — add/change strings + language workflow

**Rendering / Performance**
- Frame is **render-bound, not logic-bound**: `render.direct` ≈65ms/frame dominates; JS ticks < 0.2ms
- Measurement: load `?perf=1&stats=1`, use `renderer.info.render.calls/.triangles` (autoReset off) + `scene.traverse` probe; headless Chromium runs SwiftShader (fill-rate-bound) — trust structural metrics (draw calls, frustum-cull-disabled count), not absolute fps
- Always clear localStorage before baselining — test islands/engines persist and contaminate counts
- ~950 ground tiles all have transparent fade material (`prepareFadeable` / `keepFadeAtOpacity=true`) even at opacity 1 — this is the fill-rate bottleneck; now handled by terrain bake
- Shipped 2026-06-03: merged engine static body + scoped engine frustum culling → draw calls 2880→1673 (−42%), frustum-cull-disabled 1360→61
- Shipped 2026-06-09/10 (commits `e834531`/`7a17c15` → `7c7a163`/`80c40d2`): shadow map lever (30Hz cadence via `shadowMap.autoUpdate=false` + `window.requestShadowMapUpdate()`); VoxelShield Standard→Lambert; shield glow clone disposal; ghost-board cells skip surface-detail instancing; autosave debounce 800ms; defer on all scripts + async default-island fetch
- Shipped 2026-06-10 (commit `9fd0eaf`): per-cell home terrain mesh bake now a real feature behind `renderTerrainBake` flag (localStorage `tinyworld:renderTerrainBake=1` or `?meshbake=1`); 2039→1047 draw calls on starter world (−49%); bake lives in `17-tile-renderers.js` + raycast in `18-scene-pick-xr.js`; unbake on any edit + 1.2s settle debounce re-bake; 5–8ms bake cost on 8×8 grid
- Shipped 2026-06-10: flight model geometry merge (7 static parts → single BufferGeometry); engine frustum culling scoped (engine node keeps `frustumCulled=false`, post-merge traverse sets `true` on all others before engine node is added — plume/glow unaffected); frustum culling scope list in render-performance skill updated to include `34-flight-sim.js` and `46-mesh-terrain.js`
- VoxelShield r128 trap: toggling PointLight `.visible` per-frame triggers scene-wide shader recompile cascade; fix = drive `.visible` monotonically from deploy power, flicker via intensity only
- Engine glow/plume (HEAVY/rocket engine only): must stay `frustumCulled=false`; visible from front even when emitted from rear; plume node added after the post-merge traverse so it is never overridden

**WebGL resize trap**
- `onResize` → `applyStageSize()` → `renderer.setSize(w, h)` always clears the WebGL canvas; without an immediate `renderScene()` call after, the viewport stays blank until the next frame
- Fix (shipped 2026-06-12): call `renderScene()` at the end of `onResize` / `applyStageSize()`

**Worlds backend security hardening (in remote `advisor/*` branches — not yet merged to main as of 2026-06-13)**
- `netlify/functions/world-resources.mjs`: service token comparison now uses `timingSafeEqual` (branch `advisor/003-timing-safe-token`, commit `a4e64e2`)
- `netlify/functions/world-claim.mjs`: bookkeeping wrapped in a transaction (`advisor/004-claim-transaction`); bypass flag removed from response body (`advisor/002-bypass-flag-leak`)
- `netlify/functions/wallet-payments.mjs`: client-controlled payment recipient fixed (`advisor/001-payment-recipient`); auth + recipient invariant tests added in `tests/wallet-payments.test.mjs` (`advisor/005-wallet-payments-tests`)
- `@open-pets/client` npm dep removed (was unused); `.env.example` added with all required env vars documented (`advisor/006-env-example-dead-dep`)

**docs/ reference files**
- `docs/DESIGN.md` (added 2026-06-10, commit `1e2b633`) — descriptive UI design system extracted from `styles/tiny-world.css`; color tokens, radius scale, typography (Inter body / Pixelify Sans accents), frosted-glass recipe, `.btn`/inputs/switches/`.tool` recipes, motion rules, SVG-only icons, layering bands; **new controls must reuse these tokens, not introduce new hex colors**
- `docs/worlds.md` — Worlds MMO architecture, loops, deploy notes, required env vars
- `docs/SHADERS.md` — shader system reference
- `docs/i18n.md` — i18n architecture and file reference
- `docs/code-review-recent-commits.md` — on-disk code review notes (not auto-generated)

---

## Shipped Features

**Terrain mesh bake (2026-06-10, commit `9fd0eaf`, flag-gated)**
- Feature flag: `localStorage['tinyworld:renderTerrainBake'] === '1'` or `?meshbake=1`; default OFF
- Eligibility: home-grid, non-island cells; `canMergeStaticBaseMesh` passes after swapping `keepFadeAtOpaque` wrapper back to `userData.baseMat`
- Bake lives in `17-tile-renderers.js`; pick resolution in `18-scene-pick-xr.js` (derives cell from world-space hit point via `Math.floor(localHitPoint + GRID/2)`)
- Any `renderCellTile` call on a baked cell triggers full unbake + live rebuild + schedule re-bake after 1.2s settle
- Verified: hover, pick, place, erase, paint stroke, undo, save/load reload; 62/62 unit tests pass
- Also: prototype `99-late-boot.js` bake triggered by same flag; swaps `prepareFadeable` → `baseMat` clone across ~950 tiles; `window.runTerrainBake` callable from console

**Welcome dialog 4-mode rewrite (2026-06-09/10, confirmed working)**
- Four mode buttons: Tinyverse, Battleworlds, Build, Play — `tiny-world-builder.html` line 765
- Tinyverse click hides modal, opens `.tw-worlds-overlay`, renders 10 API-backed world cards
- Battleworlds button is a stub — falls back to `chooseWelcomeMode('play')` when `window.__tinyworldBattleworlds.open` is absent; no dedicated battleworlds module exists

**Landing page redesign (active as of 2026-06-12)**
- Separate `index.html` + `publish.sh` build; hero title: "Dream Big / Build Small" (two-line, `<br>` separator, "Build Small" in accent `<span>`)
- Remaining redesign work (glass nav, feature cards, CTA strip) status unknown

**Voxel window interior-mapping glass (2026-06-06)**
- `M.windowInterior` — `ShaderMaterial` parallax interior; per-pane uniforms `uTint/uDark/uBright/uReflect/uInteriorBright/uLit`
- Settings → Materials → "Building windows"; per-object inspector controls; interior panes excluded from batcher

**Model stamp import formats**
- `glb/gltf`, `fbx` (FBXLoader.r128.js), `vox` (MagicaVoxel), `obj` (rainbow fallback), `vdb` (VDBLoader.r128.js; frame sequence auto-detection via `vdbSequenceKey()`)

**Internationalization (i18n)**
- Shipped across commits `3932d84` → `f58f38f` → `ce6214b` → `bb883ef` → `bd0ba9e`
- 4 live locales; locale switcher in UI; `data-i18n` attribute wiring; key parity enforced at build time

---

## Active Workflows

**Boot sequence (CodeSurf sessions)**
- `mcp__contex__peer_set_state` then `mcp__contex__peer_get_state` must be called before any work; Contex MCP tools are absent in Codex sub-sessions — skip gracefully, do not abort

**UI wiring convention**
- New mode entry points go through `30-ui-boot-wiring.js`; the file is large (3,434 lines) — keep new additions thin and well-sectioned
- New async mode buttons follow the wait/disable/toast pattern from `openTinyverse`

**Tinyverse button integration pattern (canonical)**
- Check `window.__tinyworldWorlds.open` synchronously first
- Listen for `tinyworld:worlds-ready` event and `window.__tinyworldWorldsReady` promise as dual signals
- Poll every 50 ms for up to 2 s as fallback
- Button gets `disabled` + `aria-busy=true` during wait; shows toast via `twToast` on timeout

**Automated cron jobs (OpenClaw)**
- **Urgent Email Alert**: runs `bash /Users/jkneen/clawd/scripts/email-alert-check.sh`; healthy — HEARTBEAT_OK confirmed 2026-06-13
- **Tom Doerr tweet tracker**: polls `x.com/search?q=from:tom_doerr` with a logged-in browser profile; seen-state persisted at `/Users/jkneen/clawd/memory/tom-doerr-seen.json`; notifies Jason via Telegram on new tweets; Twitter/X login wall is a persistent reliability risk — login session expiry can block the cron
- **Lazar Daily Digest**: morning digest compiled from calendar, tasks, email, and conversation history; delivered to Jason via Telegram; ran successfully 2026-06-12 and 2026-06-13
- **VibeClaw Article Generator**: multi-source research cron; publishes articles to VibeClaw; 2026-06-13 run published two articles (Google/SpaceX AI partnership; Seattle AI data center moratorium)

**Pre-merge checklist**
- `npm test` passes (62 unit tests); no console errors on load; keyboard shortcuts `1`–`9`, `E`, `R`, `F`, `C` work; perspective toggle; fence neighbor geometry; house cluster shapes; smoke from chimneys after landing
- For Worlds features: `/api/worlds` returns data on port 8888 before running browser tests
- For terrain bake: verify hover, pick, place/erase, undo, and save/load with `?meshbake=1` active
- For i18n changes: run `npm run check` (triggers `tools/i18n-check.js` key parity validation)

---

## Open Threads

**Tinyworld codebase**
- `window.__tinyworldBattleworlds` referenced in `30-ui-boot-wiring.js` but no module implements it; intentional future stub; fallback to `chooseWelcomeMode('play')` is current behavior
- Six `advisor/*` security-hardening branches exist remotely (001–006) but are **not merged into main**; each addresses a specific vulnerability in Worlds backend; no technical blocker — awaiting deliberate merge
- AGENTS.md skill routing stale for modules 38–45 and all Worlds modules (46-universe through 52); `.agents/skills/` directory has 5 entries not referenced in AGENTS.md either
- Four `.codex/skills/` files absent from AGENTS.md routing: `threejs-primitive-reconstructor`, `tinyworld-25d-template-sprites`, `tinyworld-ghost-world-gen`, `tinyworld-shader-fx`
- Window interior system (`M.windowInterior`) has no `.codex/skills/` entry
- `39-atmosphere-effects.js` — day-night time-progression not wired to any UI control
- `49-worlds-avatar-picker.js` planned `@open-pets/client` provider integration: dep was removed; extensibility hook `WS.registerAvatarProvider` remains but no external provider exists
- Terrain bake (`renderTerrainBake`) is flag-gated and default OFF; no technical blocker to enabling by default — pending final QA decision
- Landing page (`index.html`) redesign: hero copy "Dream Big / Build Small" shipped; remaining redesign work (glass nav, feature cards, CTA strip) status unknown
- `41-flight-combat.js` player hit detection: `if (hit) {}` block is empty — stub comments and console.log were removed 2026-06-12 but no actual health/damage/screen-flash system has been implemented
- `41-flight-combat.js` altitude ceiling: enforcement code removed 2026-06-12; plane is now unbounded vertically

**OpenClaw infrastructure (external, persistent)**
- `mc-gateway-894a3d5b` had 4 consecutive failed turns on 2026-06-13 before recovering — unrelated to tinyworld; needs env/port diagnosis
- Tom Doerr Tweet Tracker cron: persistent Twitter/X login wall; automation unreliable without a logged-in browser profile on the cron host
- Urgent Email Alert cron (`email-alert-check.sh`) healthy — HEARTBEAT_OK confirmed
- Lead agent `c3f78d0c` (Ava) heartbeat healthy — HEARTBEAT_OK consistently

---

_This file is auto-generated by the CodeSurf dreaming job. Do not edit manually._
