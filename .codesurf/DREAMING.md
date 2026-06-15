# CodeSurf Workspace Memory — tinyworld

Generated: 2026-06-15

---

## Overview

Tiny World Builder is a vanilla ES6, no-bundler 3D world editor on Three.js r128. Shell lives in `tiny-world-builder.html` (~1.4k lines); logic is split across approximately **64 modules** under `engine/world/` (numbered 00–60 + 99, with `09b` and two `46-` files). Styles in `styles/tiny-world.css` (~5.2k lines). Deployed via Vercel and Netlify from `dist/` via `./publish.sh`. Port 8888 is the Netlify dev server; must be running with local `tinyworld` Postgres before any Worlds MMO features can be browser-tested.

A separate **landing/marketing page** (`index.html`) is also in the repo with its own build/publish pipeline — distinct from `tiny-world-builder.html`.

---

## Durable Facts

**Architecture**
- Shell: `tiny-world-builder.html` — HTML, boot config, ordered `<script src>` tags only
- Engine modules: ~64 `.js` files sharing one global scope + `flight-combat-math.mjs` (ES module companion to `34-flight-sim.js`); classic scripts, not ES modules
- Non-sequential extras: `09b-voxel-build-factories.js` (between 09 and 10); two files share the `46-` prefix (`46-mesh-terrain.js`, `46-worlds-universe.js`) — load order between them not formally documented
- Skybound additions (modules 53–60) added after the core 00–52 inventory; `99-late-boot.js` is the final late-init module
- Duplicate top-level identifiers silently kill the declaring module without affecting others; prefix module-local scratch globals (e.g. `_fl…` for flight, `_sf…` for skyfall)
- Three.js pinned to r128; MeshLambertMaterial, ExtrudeGeometry, and shadow setup assume r128 semantics — do not bump
- Materials in `M.*` are shared across meshes — clone before mutating color; `disposeGroup` disposes geometries but NOT materials
- `setCell(x, z, opts)` is the only sanctioned way to mutate world state; never write `world[x][z]` directly outside of init
- No bundler, no npm runtime dependencies; `npm test` for static checks, `./publish.sh` for dist
- Edits auto-commit to main and Netlify prod deploys immediately — branches do not guarantee isolation

**Skill directories**
- `.codex/skills/` — 23 skill files for core engine systems (tinyworld-single-file, tinyworld-render-performance, tinyworld-flight-sim, tinyworld-tinyverse-race-track, etc.)
- `.agents/skills/` — 5 additional skills: `3d-modeling`, `lightweight-3d-effects`, `poly-pizza-api`, `threejs-primitive-reconstructor`, `tinyworld-i18n`
- AGENTS.md lists only `.codex/skills/` routing; `.agents/skills/` entries are not yet referenced there

**Module reference — 34–52**
- `34-flight-sim.js` — flyable plane via `stunt-plane` model-stamp; click-to-Enter/Fly, rear chase-cam, Escape exits; `flight-combat-math.mjs` is its ES module companion; static body parts merged into single BufferGeometry via `threeStdlib.mergeGeometries`; only engine node keeps `frustumCulled=false`
- `38-multiplayer-partykit.js` — multiplayer via PartyKit
- `39-atmosphere-effects.js` — atmosphere/day-night effects; time-progression not wired to any UI control
- `40-shield-system.js` — VoxelShield materials are Lambert; per-mesh glow material clones are explicitly disposed on teardown
- `41-flight-combat.js` — missiles/projectiles fully implemented; **player hit detection stub removed 2026-06-12** (empty `if (hit) {}` block deleted); **altitude ceiling enforcement removed 2026-06-12** (`altitudeCeilingHeight` block deleted from `updateFlight`); health/damage not implemented; fog/atmosphere provides visual altitude boundary only
- `42-account-wallet-players.js` — JWT/cloud-save; **subscription system fully removed 2026-05-31**; no replacement monetisation wired
- `43-drag-drop-import.js` — GLB/FBX/OBJ/VOX/VDB drag-drop pipeline
- `44-sub-object-edit.js` — part-level selection, hover hulls, transform delegation
- `45-shader-fx.js` — `window.TinyShaderFX`; GLSL effects via `onBeforeCompile`
- `46-mesh-terrain.js` — opt-in voxel-block landscape sculptor; persists under `tinyworld:meshTerrain:*`; no `setCell` bake
- `46-worlds-universe.js` — Worlds MMO universe map, world buying (USDC), management/publish; dispatches `tinyworld:worlds-ready` and exposes `window.__tinyworldWorldsReady` promise
- `47-worlds-room.js` — Worlds MMO room client (PartyKit `world-<slug>`); sprite system uses `Without_shadow` sheets; exposes `WS.enterRoom/leaveRoom/harvest/setAvatarClass`; `createAvatar` routes through `window.makeVoxelAvatar` for self + peers + bots; owns skyfall ring meshes (torus geometry/material per ring, recolored each skyfall tick) + camera follow + steering keys for the freefall minigame; runs a SEPARATE avatar `requestAnimationFrame` in addition to the main render loop — do NOT add a third rAF for freefall/race mechanics; dispatches `tinyworld:skyfall-start` with `{rings: skyfall.rings}` on portal-jump
- `48-worlds-harvest-hud.js` — Worlds MMO in-world HUD (hearts, resources, harvest actions, cooldowns, reward popups); SVG glyphs only
- `49-worlds-avatar-picker.js` — avatar picker gallery; drives `WS.setAvatarClass`; extensible via `WS.registerAvatarProvider`
- `50-worlds-play-chat.js` — play-mode chat panel; wires to `47` events; reuses `mp-chat-*` CSS classes + `tw-play-chat-*` glassmorphism overrides; IIFE-wrapped
- `51-worlds-bots.js` — localhost-only bot simulation; 3 deterministic bots via seeded LCG PRNG; **localhost/127.0.0.1 only — never runs in production**
- `52-worlds-demo-seed.js` — localhost-only demo resource seeder; **localhost/127.0.0.1 only — never runs in production**
- `99-late-boot.js` — late boot finalization; `?meshbake=1` URL param activates early-prototype terrain bake; `window.runTerrainBake` exposed for console/settings invocation

**Skybound modules (53–60)**
- `53-voxel-avatar.js` — `window.makeVoxelAvatar`; replaces 2.5D sprite "stripes" for self + peers + bots; FK rig with named limb groups (`armL_sh`/`armR_sh`, `armL_elbow`/`armR_elbow`, `legL_hip`/`legR_hip`, `legL_knee`/`legR_knee`, chest, `head`); material MUST be `side:THREE.DoubleSide` (voxGeo winding inconsistent); `AVATAR_HEIGHT=0.5`; uses same LCG PRNG seeding pattern as `60-skyfall.js`
- `54-fly-down.js` — fly-down mechanic (key `j`); `window.__tinyworldFlyDown.{descend,ascend,toggle,isDown}`; eases camera to planet underlay; sets `window.__flyDownActive`; calls `window.__setPlanetLandscapeNearView(true/false)`; shows/hides home-island proxy (~4 draws) and force-hides the full board via `window.__hideHomeLayer`
- `55-stargate.js` — stargate object (key `G`); `window.__tinyworldStargate`; styles: nested/voyager/portal/rings; `nested` = voxel stone casing + recessed ring + white energy centre, sunk at ground level
- `56-gate-transit.js` — gate transit mechanic (key `h`); `window.__tinyworldGateTransit.{placeGate,enter,isOnSurface}`; `placeLobbyGates()` scatters 3 paired gates on enter; auto-travel loop every ~4–8s; CYBERGATE sign (`buildSign`) + maintenance climb rig + `climb-ladder` marker live on the lobby screen (58)
- `57-poser-surface.js` — `window.__tinyworldPoserSurface.{show,hide,build}`; VERBATIM lift of voxel-poser.html's SATS/ISLE/groundH geometry + banded water shader + foam ribbons; scaled (SCALE 1.6 / Y_BOOST 9) at y=−60 under home board; fly-down (54) shows/hides on descend/ascend; sea animates on its own rAF; **do NOT reimplement — extract verbatim per feedback-extract-dont-reinvent**; perf fix committed (5160cc8): G 0.2→0.4, sea plane 80×80→8×8
- `58-lobby-presentation.js` — `window.__tinyworldLobby`; framed in-world screen at `z = -(GRID/2)-1`; 6×3.375 canvas-rendered slide deck (MeshBasicMaterial, unlit); built/shown on `WS.on('enter')`, hidden on `'leave'`; `[`/`]` keys + DOM bar for Prev/Next; multiplayer slide sync via `WS.present(idx)` → PartyKit `present` handler → broadcast to all admitted → `applySlide` (no echo loop — apply is local-only)
- `59-gate-travel-fx.js` — 5-stage gate-travel visual effect: magnetic pull → particle dissolve-in → portal flash → back-extrude → receiving edge-light+flash+emerge; THREE.Points (one draw call each); companion to `56-gate-transit.js`; particles read subtle at gameplay scale — tuning lever: bigger gates / particle size
- `60-skyfall.js` — freefall minigame; listens for `tinyworld:skyfall-start` event (dispatched by `47-worlds-room.js` on portal-jump with `{rings}`); contains: position/vel simulation at 60 fps, gravity + drag + lift physics, WASD/arrow-key steering via `_sfKeys`, wind + turbulence, ring collision detection (cylinders `_sfRings`), ring-pass scoring (`_sfRingsHit`, `_sfScore`), `_sfEndSkyfall()` callback, ring mesh creation (`_sfRingsGroup`, `_sfCreateRings()`), ring visual update per frame, `_sfOnLand()` handler; **wiring to `47-worlds-room.js` already correct — verified 2026-06-12, no changes needed**; `47` owns ring meshes, camera follow, and steering keys; same LCG PRNG seeding as `53-voxel-avatar.js`

**Skybound roadmap lives at `plans/ROADMAP-skybound.md`.**

**Flooded planet (distant backdrop)**: LandscapeEngine flood config at `27-landscape-engine.js ~562`: `{waterLevel:150, heightScale:0.45, freqScale:6}` ≈ 13% land. Levers: waterLevel ↑ = less land; freqScale ↑ = smaller/more islands.

**Descended view (ground-up)**: reframed to low near-sea vantage gazing up (DESCEND_POLAR 1.5, VIEW_SIZE 26, toTargetY −drop×0.5). Home board is force-hidden via `window.__hideHomeLayer`. Note: skybound-systems memory references `58-island-proxy.js` but filesystem shows `58-lobby-presentation.js` — proxy logic is likely inline in `54-fly-down.js` or `57-poser-surface.js`; verify before descended-view work.

**LandscapeEngine**
- `LandscapeEngine.js` is superseded monolith; `getHeight`/chunk-building live in `engine/landscape/*.js` mixins — edit the mixins, not the monolith
- Constructor stays live (hence `VOXEL:true` but old method body)

**Worlds MMO namespace**
- `window.__tinyworldWorlds` (alias `WS`) shared across all Worlds modules; all IIFE-wrapped — no top-level globals leak
- `/api/worlds` lives at `netlify/functions/worlds.mjs`
- Worlds gameplay runs on PartyKit room server (separate from Netlify); Netlify-only deploy does NOT update room behavior — use `partykit deploy` for server changes
- `party/index.js` now has: (1) `present` handler for slide sync (rate-limited, clamped 0–999, broadcast to all admitted); (2) `grassCells` included in `world.state` snapshot (bots/joiners know standable cells); water removed from `rebuildBlocked`; lava + stone still blocked
- `party/index.js` contains a **hardcoded descriptor allowlist** for avatar fields; any new descriptor fields MUST be added to the allowlist in `party/index.js` alongside any client-side changes in `49-worlds-avatar-picker.js` and `53-voxel-avatar.js` — otherwise new fields are stripped at the server; `tests/party.test.mjs` is the verification harness

**30-ui-boot-wiring.js**
- 3,434 lines — NOT a thin delegation file; contains full cloud sync logic (`twCloudAccessToken`, `twCloudApiCall`, `twCloudSyncLocalWorldsToCloud`, `twCloudBootstrapSync`, etc.)
- Key welcome-dialog functions: `initWelcomeDialog`, `openTinyverse` (async, waits for `window.__tinyworldWorlds.open`), `openBattleworlds` (sync stub, falls back to `chooseWelcomeMode('play')` if `window.__tinyworldBattleworlds.open` absent)
- `waitForWorldsFrontend()` polls every 50 ms for up to 2 s; also listens to `tinyworld:worlds-ready` event and `window.__tinyworldWorldsReady` promise as dual signals

**Avatar animations**
- Voxel avatar states: `walk` (poser strideCore natural gait, NOT robotic — pow-1.3 chest bob, lateral sway, forward lean, 2× head bob, counter-arm swing, planar law-of-cosines IK `legIK`), `jump`, `crouch`, `sit` (POSES.Sit — direct angles, NOT legIK), `climb` (face rungs: `setHeading(0)`), `attack` (3 cycling sword swings), `blink`
- Walk GOTCHA (cost hours twice): rig hinge convention is **+hip.rotation.x → foot −z**; wrong fore/aft sign = MOONWALK. Verify via foot-trajectory measurement on ONE foot while planted; do not average — alternating feet corrupt per-frame deltas
- Adding a state requires whitelisting it in `setState` or it silently collapses to idle
- Drive (in `47-worlds-room.js`, local-self only, gated `ent===selfEnt`): c=crouch-hold, x=sit-toggle, W-into-`climb-ladder`=climb (up/down W/S), f=attack, j=fly-down; heading from `setHeadingFromDelta(dxw,dzw)`
- Water is WALKABLE (deliberate, confirmed): `rebuildBlocked` and server `setWorldStateFromData` both exclude water; do NOT revert to grass-only
- Gate travel: walk avatar onto lobby-gate cell → `47` `tryEnterGate()` → `56.travelPlayer(cell, selfEnt.voxel, onArrive)` → dissolve→emerge at paired gate; `animVoxel` cedes during `_traveling`
- Peer-sync of crouch/sit/climb deferred — `move` carries only x,z

**AI bots (`tools/ai-bots.mjs`)**
- Run: `npm run bots:ai -- --slug <world> --bots 3 --mode both`
- Default brain: Anthropic Messages API with `claude-haiku-4-5`; `--provider openai --model gpt-5-mini` branch built-in; `ANTHROPIC_API_KEY` from `.env`
- `--mode ambient|react|both` toggles ambient chatter vs replies-to-nearby-chat; per-bot 12s cooldown + probability gate
- Requires openMode (`WORLDS_JOIN_SECRET=` empty) — otherwise bots drop to observe
- Canned `51-worlds-bots.js` still auto-spawns on localhost alongside LLM bots — retirement deferred

**Test harnesses**
- `tests/party.test.mjs` — descriptor allowlist coverage for `party/index.js`; run before editing the allowlist or adding descriptor fields
- `tests/flight-combat-math.test.mjs`, `tests/appearance-surface.test.mjs`, `tests/model-stamp-materials.test.mjs`, `tests/wallet-auth.test.mjs`, `tests/db-schema-errors.test.mjs` also exist
- `npm test` runs `tools/check.js` (static duplicate-identifier scan) + the test suite

---

## i18n System (as of 2026-06-14)

**Foundation built 2026-06-14 — JSON-based, English + Spanish**
- `engine/i18n/index.js` — `window.t(key, fallback)` resolver; locale detection via `sessionStorage` → `navigator.language` → `en`; console-warns on missing keys
- `engine/i18n/en.json` — English strings; namespaces: `toolbar` (7 keys), `terrainEditor` (4 keys), `worldsPanel` (20 keys), `avatarPicker` (10 keys), `partyChat` (6 keys)
- `engine/i18n/es.json` — Spanish strings; mirrors all en.json namespaces
- Script tag injected before all engine modules in `tiny-world-builder.html`

**Wired modules** (using `window.t()` calls)
- `05-toolbar.js` — 7 toolbar strings
- `19-terrain-editor.js` — 4 terrain-editor strings
- `46-worlds-universe.js` — 20 worldsPanel keys
- `47-worlds-room.js` — i18n wired
- `49-worlds-avatar-picker.js` — 10 avatarPicker keys
- `50-worlds-play-chat.js` — 6 partyChat keys

**Not yet wired** — settings panel, inspector/editing UI, flight UI, mesh terrain UI, skybound modules (53–60), majority of core modules (00–18, 20–33, 35–45, 48, 51–52, 99)

---

## Skybound Roadmap Status

All phases 1–9 shipped (verified 2026-06-12):
- Phase 1 — Voxel Avatars (module 53) ✓
- Phase 2 — Fly-Down to Planet Surface (module 54, key j) ✓
- Phase 3 — Stargate Object (module 55, key G) ✓
- Phase 4 — Gate Transit (module 56, key h) ✓
- Phase 5 — Poser Surface Planet (module 57) ✓
- Phase 6 — Lobby Presentation (module 58) ✓
- Phase 7 — Gate Travel FX (module 59) ✓
- Phase 8 — Skyfall Minigame (module 60) ✓
- Phase 9 — Flight Combat (module 41) ✓
- **Phase 10 — Tinyverse Race Track — NEXT UP**; see `plans/ROADMAP-skybound.md` and `.codex/skills/tinyworld-tinyverse-race-track`

---

## Performance Findings (Committed)

- Frame is **render-bound not logic-bound** — `render.direct` ≈65ms/frame dominates, JS ticks <0.2ms; measure via `?perf=1&stats=1` + `renderer.info.render.calls/.triangles`; headless Chromium is SwiftShader (fill-rate-bound, ~10–17fps) — not representative; trust structural draw-call/transparent-count metrics
- **Shipped 2026-06-03**: merged engine static body + scoped frustum culling → draw calls 2880→1673 (−42%), frustum-cull-disabled 1360→61
- **Shipped 2026-06-09/10**: shadow map 30Hz cadence (`shadowMap.autoUpdate=false`); VoxelShield flicker via intensity only — toggling `.visible` per-frame causes r128 shader recompile cascade (progs 27→260 measured); Shield materials Standard→Lambert; fog in-place; waterFoam opaque; ghost-board cells skip surface-detail instancing
- **Shipped (commit 5160cc8)**: poser planet surface G 0.2→0.4, sea plane 80×80→8×8 → descended tris 673k→407k, render 66.8ms→19.9ms
- **Shipped (commit f11350f)**: cloud-sea veil fix — `cloudSeaMesh.visible` gates on opacity>0.003 so `frustumCulled=false` transparent mesh stops drawing at opacity 0
- **Remaining unshipped lever**: per-region terrain mesh bake. Measured: 144-cell world 399→117 draws (−70%). KEY BLOCKER: `prepareFadeable` keeps `transparent:true` on tiles even at opacity 1 (`keepFadeAtOpacity`); bake must swap each mesh to `userData.baseMat` first; `?meshbake=1` is flag-gated prototype only
- **Descended view**: home island still renders ~1600 draw calls (orbit-centred, frustum culling cannot remove); explicit hide/LOD-on-descend is the remaining fix
- **Skyfall ring constraint**: `47` creates one torus geometry/material per ring and recolors all ring meshes each skyfall tick; with 6 rings acceptable; any expanded multi-ring course should share one geometry/material pair

---

## Active Workflows and Capabilities

- **Publish flow**: edit source → `./publish.sh` → `dist/` updated → Netlify serves updated prod; skipping publish.sh means changes are invisible in the browser
- **PartyKit deploy**: `partykit deploy` for `party/index.js` server changes — does NOT go through `./publish.sh`; locally the workerd on :1999 hot-reloads on save
- **Admin gate**: `TINYWORLD_ADMIN_SECRET` env var must be set and `netlify dev` restarted; without it, roadmap drag and features admin silently 403
- **Cluso widget**: injected by dev-server at runtime only; `cluso/` gitignored; build guards forbid it in shipped HTML; never commit Cluso code
- **Shell/checkout traps**: `rm` is aliased interactive (scripted `rm` silently no-ops; use `command rm -f` and verify); cwd drifts into `~/clawd` mirror where edits auto-commit to main — always use absolute paths
- **Worlds MMO local dev**: port 8888 Netlify dev server + local `tinyworld` Postgres; `openMode` required for local peers or signed play token; without it bots/clients are observers only
- **CodeSurf multi-agent**: register with `mcp__contex__peer_set_state` + `peer_get_state` on every session start; coordinate before editing shared files via `peer_send_message`; `mcp__contex__peer_*` tools NOT available in all session types (Codex/GPT sessions may lack contex access)
- **Lobby presentation deploy**: `58-lobby-presentation.js` client ships via `./publish.sh`; `party/index.js` `present` handler ships via `partykit deploy`

---

## Open Threads

- **Phase 10 — Tinyverse Race Track** — not started; see `plans/ROADMAP-skybound.md` and `.codex/skills/tinyworld-tinyverse-race-track`
- **i18n coverage gaps** — settings panel, inspector/editing UI, flight UI, mesh terrain UI, skybound modules (53–60), and most core modules (00–18, 20–33, 35–45, 48, 51–52, 99) still use hardcoded English; only 6 modules wired so far
- **Skyfall end-of-run UX** — simulation + ring scoring complete; no end-of-run summary screen or persistent leaderboard yet
- **Flight combat health/damage** — missiles/projectiles implemented; player hit detection stub removed 2026-06-12; health/damage system not yet built
- **Altitude boundary** — ceiling enforcement removed 2026-06-12; fog/atmosphere provides visual boundary only; no soft speed-damping added yet
- **Avatar descriptor extension** — MUST update `party/index.js` allowlist + `tests/party.test.mjs` + `49-worlds-avatar-picker.js` + `53-voxel-avatar.js` atomically when adding new descriptor fields; fields stripped at server if not allowlisted
- **Ground track / race module** — planned as post-60 module attaching geometry to `window.__tinyworldPoserSurface` group; must not mutate editable-island cells, create a second terrain system, or add a third rAF
- **Subscription system removal** — fully removed from `42-account-wallet-players.js` 2026-05-31; no replacement monetisation wired
- **Poser surface perf — remaining** — committed fix 5160cc8 done; remaining lever: per-region terrain mesh bake (baseMat swap, −70% draws measured); `userData.baseMat` swap prerequisite not automated; `?meshbake=1` is prototype only
- **Descended view draw calls** — home island still renders ~1600 calls at orbit-centre; explicit hide/LOD-on-descend not built
- **Home-island proxy ambiguity** — memory references `58-island-proxy.js` but filesystem shows `58-lobby-presentation.js`; proxy logic likely inline in `54-fly-down.js` or `57-poser-surface.js`; verify before descended-view work
- **`.agents/skills/` not in AGENTS.md routing** — 5 skills (`3d-modeling`, `lightweight-3d-effects`, `poly-pizza-api`, `threejs-primitive-reconstructor`, `tinyworld-i18n`) exist under `.agents/skills/` but AGENTS.md only documents `.codex/skills/` routing
- **Party/index.js changes not yet deployed to prod** — `grassCells` in state snapshot and `present` handler verified locally; `partykit deploy` needed for prod
- **`openBattleworlds`** — sync stub in `30-ui-boot-wiring.js`, falls back to `chooseWelcomeMode('play')`; Battleworlds mode not fully wired
- **Avatar state drive keys** — verified via rig-measurement + unit test but live in-room keypress NOT yet confirmed (worlds-room is openMode/role-gated)
- **Peer-sync of crouch/sit/climb** — deferred; `move` carries only x,z; peer avatars do not mirror these states
- **Gate-travel FX (59) particle tuning** — particles read subtle at gameplay scale; open lever: bigger gates / scaled particle size
- **Lobby presentation admin** — any admitted peer can advance slides; no owner-only gate; follow-up via `ownerProfileId`
- **Canned `51-worlds-bots.js`** — still auto-spawns on localhost alongside LLM bots; retirement decision deferred
- **Time-progression in `39-atmosphere-effects.js`** — not wired to any UI control
- **`46-` prefix load-order** — `46-worlds-universe.js` and `46-mesh-terrain.js` share prefix; load order not formally documented in AGENTS.md
- **DGX GPU server** (`192.168.4.104:8003`) — unreachable as of 2026-06-15 morning; VibeClaw wallpaper and article hero image generation skipped; check before scheduling any image generation tasks
