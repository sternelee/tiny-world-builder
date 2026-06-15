# tinyworld-surface-roam

Surface-roam free movement on the Skybound procedural poser planet surface.

## What it does

When the player descends via J (module `54-fly-down.js`) and the fly-down animation finishes, module `47-worlds-room.js` automatically activates **surface roam mode**:

- **Camera-relative WASD** walk + **drag-look** mouse look (capture-phase so it beats grid handlers).
- **Space** = rise (fly up), **C** = sink (fly down); both enter fly mode that disables ground gravity.
- **Shift** doubles walk speed (sprint).
- **J** while down → `ascend()` → surface roam deactivates automatically once the ascend transition ends.
- A compact HUD (`#tw-surface-roam-hud`) shows the mode and key hints.

## Polling pattern

`54-fly-down.js` exposes `window.__tinyworldFlyDown.state()` returning `{ down, transitioning, phase }`. `47-worlds-room.js` polls this every avatar RAF tick (`_srPollFlyDown()`) — no custom events needed. This avoids the closure problem where `finishEase` is inaccessible from outside the IIFE.

## Height sampling

`57-poser-surface.js` exposes `window.__tinyworldPoserSurface.sampleWorld(wx, wz)` returning `{ walkWorldY, localH, water }`. The surface group (`group`) is placed at `(target.x, -DROP, target.z)` by `show()` and does not move after that.

**Critical**: `sampleWorld` and `worldToLocal` read `group.position.x/z` (the stable anchor) NOT `target.x/z` (which moves every frame during camera updates). Using `target` creates a feedback loop: camera update writes `target`, then `sampleWorld` reads wrong origin, then avatar height oscillates.

```js
// correct — stable anchor
const gx = (group && group.position) ? group.position.x : 0;
// wrong — drifts every frame
const gx = target.x;
```

## State variables (all prefixed `_sr`)

Declared inside the `47-worlds-room.js` IIFE, never top-level globals:

| Variable | Purpose |
|---|---|
| `_srActive` | master flag; all guards check this |
| `_srYaw`, `_srPitch` | drag-look angles |
| `_srX`, `_srZ`, `_srY` | avatar world position |
| `_srVY` | vertical velocity (fly mode) |
| `_srFlying` | whether in fly/gravity-off mode |
| `_srKeys` | WASD/Space/C/Shift state |
| `_srWasDown` | previous poll result (edge detection) |
| `selfEnt._srActive` | per-entity flag — guards `updateSelfAvatar` presence echoes |

## Guards you must keep

```js
// step() — no grid moves during surface roam
if (selfEnt && (selfEnt._traveling || selfEnt._climb || selfEnt._skyfall || selfEnt._srActive)) return;

// updateSelfAvatar() — don't let presence echoes yank avatar back to grid
if (selfEnt._srActive) return;

// animVoxel / animEntity — delegate tick to _srStep
if (ent === selfEnt && ent._srActive) { _srStep(dt); updateBubble(ent); return; }

// updateAvatarCameraOrbit — delegate camera to _srUpdateCamera
if (selfEnt._srActive) { _srUpdateCamera(); return; }
```

## CSS

```css
body.surface-roam-active { cursor: crosshair; }
#tw-surface-roam-hud { /* fixed top-center compact HUD */ }
```

## Speed/camera constants

| Constant | Value | Meaning |
|---|---|---|
| `SR_WALK` | 3.2 | walk speed (units/s) |
| `SR_SPRINT` | 6.4 | sprint speed |
| `SR_FLY_V` | 4.0 | vertical fly velocity |
| `SR_CAM_DIST` | 5.0 | chase-cam distance behind avatar |
| `SR_CAM_UP` | 2.4 | chase-cam height offset |
| `SR_DRAG_SENS` | 0.005 | mouse drag sensitivity (rad/px) |

## Files

- `engine/world/47-worlds-room.js` — surface roam controller (`_sr*` functions and state)
- `engine/world/54-fly-down.js` — exposes `state()` on `window.__tinyworldFlyDown`
- `engine/world/57-poser-surface.js` — exposes `sampleWorld`, `worldToLocal` on `window.__tinyworldPoserSurface`
- `styles/tiny-world.css` — HUD styles and cursor
