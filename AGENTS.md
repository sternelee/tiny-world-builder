# AGENTS.md

Guidance for AI coding agents working in the Tiny World Builder repo. Read this
file before touching `tiny-world-builder.html`, `engine/world/*.js`, or any
shared system.

## Project overview

Tiny World Builder is a browser-based, self-contained 3D voxel world editor. It
is intentionally a no-bundler, vanilla-ES6+ application: the main shell is
`tiny-world-builder.html`, styles live in `styles/tiny-world.css`, and runtime
logic is split into ordered classic `<script>` modules under `engine/world/`,
`engine/landscape/`, `engine/i18n/`, and `LandscapeEngine.js`. Three.js r128 and
its loaders are self-hosted under `vendor/three/`. The app can run from
`file://`, a local dev server, or a static host (Vercel / Netlify) without any
build-time transpilation.

Beyond the editor, the project also contains a static marketing site (`index.html`,
`features.html`, `docs.html`, `roadmap.html`, etc.), a PartyKit-powered multiplayer
/ MMO "Worlds" layer (`party/index.js` + `engine/world/46-worlds-universe.js`,
`47-worlds-room.js`, etc.), Netlify Functions + Postgres for accounts, cloud saves,
and the on-chain economy, and a small shared ESM package
`packages/tinyworld-mmo-core/`.

## Technology stack

- **Frontend:** vanilla ES6+, classic `<script>` modules, no bundler.
- **3D runtime:** Three.js r128 (self-hosted in `vendor/three/`; GLTFLoader,
  DRACOLoader, KTX2Loader, FBXLoader, VOXLoader, VDBLoader, USDZExporter, etc.).
- **Styles:** hand-written CSS in `styles/tiny-world.css` (~9.4 k lines) plus
  `landing.css`, `countdown.css`, `github-stars.css`.
- **Dev server:** `tools/dev-server.js` (Node `http`, live reload SSE, local-only
  Cluso widget injection, AI proxy endpoints for stamp reinterpretation).
- **Backend:** Netlify Functions (`netlify/functions/*.mjs`) backed by Netlify
  Postgres; migrations live in `netlify/database/migrations/`.
- **Realtime / MMO:** PartyKit room server in `party/index.js`; config in
  `partykit.json`.
- **Tests:** Node built-in test runner (`*.test.mjs`), static checks in
  `tools/check.js`, `tools/smoke-static.js`, and `tools/i18n-check.js`.
- **Package manager:** npm (also has `bun.lock` and `deno.lock` present). License
  is AGPL-3.0-only.

## Project structure and key files

```
tiny-world-builder.html          Main app shell, DOM, inline boot scripts,
                                 ordered <script src> tags at the bottom.
index.html                       Marketing landing page.
styles/tiny-world.css            Main app stylesheet (~9.4 k lines).
LandscapeEngine.js               Discrete / continuous terrain engine mixin.
engine/world/00..68 + 99-*.js    App logic modules in strict load order.
engine/landscape/*.js            Landscape engine helpers (noise, shaders,
                                 geometries, water, chunks).
engine/i18n/                     Locale data (en/fr/es/zh/th) + i18n core.
vendor/three/                    Self-hosted Three.js r128 and loaders.
vendor/tiny-crowd-layer.js       2.5D crowd sprite runtime.
vendor/tinyworld-auth.js         Netlify Identity browser bridge.
netlify/functions/               Serverless API (auth, profile, builds, share,
                                 assets, worlds, wallet, community, etc.).
netlify/functions/lib/           Shared server helpers (auth, db, profiles,
                                 solana, worlds, human verification).
netlify/database/migrations/     Postgres migrations.
party/index.js                   PartyKit room server (collab + Worlds MMO).
packages/tinyworld-mmo-core/     Shared ESM economy + multiplayer contracts.
tools/                           Dev server, static checks, i18n checker,
                                 model-stamp scanner, seed generators, bots.
tests/                           Node test runner suites.
docs/                            Human docs (DESIGN.md, i18n.md, worlds.md,
                                 SHADERS.md, etc.).
.codex/skills/*/SKILL.md         Repo-local skill files; read the matching
                                 skill before changing a subsystem.
```

## Module architecture

The `engine/world/*.js` files are **plain classic `<script>` tags that all share
one global scope**. This has two important consequences:

1. **Load order matters.** `tiny-world-builder.html` loads modules sequentially
   (00-prelude, 01-render-core, 02-cameras-lighting, etc.). Functions defined in
   earlier modules are used by later ones.
2. **Top-level identifiers must be unique across all modules.** A duplicate
   `const`/`let`/`function`/`class` name in two `engine/world/*.js` files throws
   `SyntaxError: Identifier 'X' has already been declared` and silently kills
   the whole module while the rest keep loading. Prefix module-local scratch
   globals (e.g. flight uses `_fl…`, surface roam uses `_sr…`).

`tools/check.js` enforces a duplicate top-level declaration guard across
`engine/world/*.js` as part of the publish gate.

Some subsystems are wrapped in IIFEs (e.g. `engine/landscape/*.js`,
`engine/i18n/*.js`, modules 38/40/46-worlds-universe/47-worlds-room/62-cctv-truman)
to avoid leaking internal names into the shared global scope.

## Mental model and data contract

Two parallel data structures drive the renderer:

```
world[x][z]                  // intent  — { terrain, terrainFloors, kind, floors, ... }
cellMeshes['x,z']            // render — { tile: Group, object: Group|null }
```

Mutate via **`setCell(x, z, opts)`**. It:

1. updates `world[x][z]`,
2. rebuilds the tile mesh if terrain / terrainFloors changed (or `forceTile` is set),
3. rebuilds the object mesh,
4. re-renders adjacency-sensitive neighbors (fences, house clusters, paths, bridges, rocks).

Never write to `world[x][z]` directly outside of init — go through `setCell`,
or you will desync intent from rendering.

## Build and test commands

```bash
# Local dev server
npm run dev                       # http://localhost:3000/
                                  # builder at /tiny-world-builder

# Static checks + tests
npm test                          # runs check + smoke + unit tests
npm run check                     # syntax, schema parity, asset checks, i18n
npm run smoke                     # no-browser smoke guard for key contracts
npm run test:unit                 # node --test tests/*.test.mjs

# Build distribution
npm run build                     # ./publish.sh -> dist/

# i18n
npm run i18n:check                # locale parity + key-usage validation
npm run i18n:report               # coverage report

# Multiplayer / Worlds
npm run party:dev                 # PartyKit dev server on :1999
npm run smoke:mp                  # multiplayer smoke tests
npm run smoke:mp:ai               # multiplayer smoke with AI bots

# Other useful scripts
npm run perf                      # performance probe
npm run db:local                  # local Postgres via Netlify CLI
```

`publish.sh` is the single source of truth for creating `dist/`. It copies the
HTML shells, engine modules, styles, vendor libs, assets, sounds, models,
textures, crowd sprites, docs, and generates `dist/models/stamp-manifest.json`
via `tools/model-stamps.js`. Both Vercel (`vercel.json`) and Netlify
(`netlify.toml`) run `publish.sh` and publish `dist/`.

## Code style guidelines

- **Semicolons are required.** This codebase uses semicolons.
- **Indent:** 2 spaces.
- **Quotes:** single quotes for strings.
- **Trailing commas:** where present, keep them.
- **Section comments:** use `// -------- name --------` to group related code.
  If you add a new system, give it its own section header.
- **Boring obvious code over clever.** Prefer small, well-sectioned changes over
  clever abstractions.
- **No emoji** in UI text, labels, code, comments, or commits.
- **Inline SVG glyphs only** for icons (`stroke="currentColor"`), no PNG icons.
- Follow the design tokens in `docs/DESIGN.md` and `styles/tiny-world.css`:
  warm parchment background, frosted-glass chrome cards, `--accent` blue,
  radius scale, glass recipe with `backdrop-filter`, transform/opacity-only
  animation.

## Testing instructions

- Run `npm test` before declaring a change done.
- Run `npm run build` to confirm `dist/` generation succeeds.
- For visual changes, load `http://localhost:3000/tiny-world-builder` and verify:
  - page loads with no console errors,
  - tool keyboard shortcuts (`1`–`9`, `E`) still work,
  - `R` / `F` raise and lower hovered terrain,
  - reset button restores the preset village,
  - `C` clears to grass with the staggered drop-in,
  - perspective ⇄ ortho toggles cleanly (`P` / `I`),
  - placing/erasing a fence updates its neighbors' geometry,
  - house clusters render as L/T/+/square where appropriate,
  - smoke spawns from chimneys after houses finish landing.
- For i18n changes, run `npm run i18n:check`.
- For multiplayer / Worlds changes, run `npm run party:dev` and `npm run smoke:mp`.

## Adding a new object kind

1. Add a factory: `function makeWidget(...)` returning a `THREE.Group`.
2. Add a tool entry to `TOOLS` (id, label, kind, color, optional
   `terrainOverride`).
3. Handle the `kind` in `renderCellObject` — call your factory, set
   `userData.kind`, push a drop-in animation if appropriate.
4. If the kind needs adjacency awareness, write a `getXxxNeighbors(x, z)`
   helper and re-render neighbors inside `setCell` (mirror the fence/house
   pattern at the bottom of `setCell`).
5. If the kind animates per-frame, add a branch inside the `for (const key in
   cellMeshes)` loop in `animate()` and **respect `obj.userData.landing`** so
   it doesn't fight the drop-in queue.

## Adding a new terrain

1. Add a material to `M`.
2. Add a tool entry with `terrain: 'name'`.
3. Handle the name inside `makeTile(terrain)` — pick `topMat` and any decals
   (flecks, scuffs, ripples).

## Three.js gotchas

- **r128 is pinned.** Do not bump casually — shadows and material color spaces
  changed in newer releases.
- Materials in `M.*` are **shared** across many meshes. Don't mutate
  `M.foo.color` in place; clone first.
- `disposeGroup(group)` disposes geometries but **not** materials, because
  materials are shared.
- Cameras: `orthoCam`, `softCam`, and `persCam` exist; `camera` is a reference
  swapped by `togglePerspective()` / `setCameraMode()`. `updateCamera()` writes
  to all camera projections/positions as needed.

## Internationalization

The UI is localized into English (`en`), French (`fr`), Spanish (`es`),
Simplified Chinese (`zh`), and Thai (`th`). Locale data ships as JS IIFEs in
`engine/i18n/<code>.js` that register onto `window.TWI18N_DATA`. `en.js` is the
authoritative key set; other locales must match it exactly.

Runtime API (global): `t(key, params?)`, `tx(key, fallback)`, `has(key)`,
`TWI18N.setLocale(code)`, `TWI18N.apply(root?)`. HTML attributes are translated
via `data-i18n`, `data-i18n-title`, `data-i18n-tooltip`,
`data-i18n-placeholder`, and `data-i18n-aria-label`.

When adding user-facing text, add the key to `en.js` first, reference it, then
run `npm run i18n:check` to see what other locales need. See
`.codex/skills/tinyworld-i18n/SKILL.md` for the full loop.

## Repo-local skills

Local skills live in `.codex/skills/*/SKILL.md`. Read the relevant skill before
changing the matching system. When a change creates a durable pattern, update
the related skill in the same turn; if there is no related skill, create a new
concise one.

Current skill routing includes: single-file constraints, auto-batching,
opacity-torch, tile-variation, asset-editing, visual-qa, render-performance,
settings, webxr, crowd-layer, low-poly prompts, integrations, runtime-state,
island-and-planes, tool-icons-and-modes, block-button-style, mesh-terrain,
flight-sim, tinyverse-race-track, surface-roam, cctv-truman, and others.

## Backend, deployment, and security considerations

- **No remote runtime scripts.** `tools/check.js` forbids CDN-loaded JS. All
  runtime libraries must be self-hosted under `vendor/`.
- **Content Security Policy** is configured in both `netlify.toml` and
  `vercel.json`. It permits `'self'`, inline scripts, WebAssembly, blob workers,
  and PartyKit WebSockets (`ws:` / `wss:`).
- **Netlify Functions** run under `netlify/functions/`. They use `esbuild` as
  the bundler. Sensitive handlers rely on Netlify Identity JWTs, wallet session
  secrets, and shared service tokens.
- **Postgres** is used for profiles, builds, world shares, asset libraries,
  preferences, and the Worlds economy. Migrations are immutable once applied;
  generate new migrations rather than editing applied ones.
- **PartyKit** is deployed separately from the static site. After changing
  `party/index.js`, run `npx partykit deploy`. The client detects stale room
  builds and shows `worlds.serverOld`.
- **Solana / wallet payments** are gated by env vars:
  `TINYWORLD_PAYMENT_WALLET`, `TINYWORLD_WALLET_SESSION_SECRET`,
  `WORLDS_SERVICE_TOKEN`, `WORLDS_JOIN_SECRET`. The wallet payment UI and
  LiveKit voice UI are currently hidden behind `data-feature-hidden` until
  re-enabled.
- **Cluso feedback tooling** is intentionally excluded from `dist/` and from the
  committed HTML; it is injected only by the local dev server.
- **`.env.example`** documents local env variables. Copy to `.env` and fill in
  secrets; never commit real secrets.

## Worlds MMO (high-level)

The Worlds layer is an optional on-chain MMO beside the freeform builder:

- `engine/world/46-worlds-universe.js` — universe map, buy/claim UI.
- `engine/world/47-worlds-room.js` — authoritative PartyKit room client.
- `engine/world/48-worlds-harvest-hud.js` — hearts, resources, actions, chat.
- `party/index.js` — authoritative server: movement, harvest, tax split, hearts,
  node regrowth, presence, chat, emotes, combat, lobby presentation.
- `netlify/functions/worlds.mjs`, `world-resources.mjs`, `wallet-payments.mjs`,
  `world-claim.mjs`, `world-economy.mjs` — durable persistence and economy.
- `packages/tinyworld-mmo-core/src/` — shared pure economy and multiplayer
  contracts imported by both the PartyKit room and Netlify Functions.

## Things to avoid

- Don't pull in npm packages or a bundler. The single-file / no-bundler
  constraint is the point.
- Don't rename `world` / `cellMeshes` / `setCell` — they're the public contract
  of the data layer.
- Don't remove the `userData.landing` checks. They prevent animations from
  fighting the drop-in queue.
- Don't "clean up" comments without asking.
- Don't touch `tiny-world-builder BACKUP.html` if that local snapshot exists.
- Don't animate `top`/`left`/`width`/`height`; animate `transform` and `opacity`
  only.

## Quick checks before declaring done

- [ ] `npm test` passes.
- [ ] `npm run build` succeeds.
- [ ] Page loads with no console errors.
- [ ] Tool keyboard shortcuts (`1`–`9`, `E`) still work.
- [ ] `R` / `F` raise and lower the hovered terrain; reset button restores the
      preset village; `C` clears to grass with the staggered drop-in.
- [ ] Perspective ⇄ ortho still toggles cleanly.
- [ ] Placing/erasing a fence updates its neighbors' geometry.
- [ ] Clusters of houses still render as L/T/+/square where appropriate.
- [ ] Smoke spawns from house chimneys after they finish landing.
