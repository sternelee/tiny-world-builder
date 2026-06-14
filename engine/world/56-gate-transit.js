  // -------- stargate transit: walk a voxel person through the gate to swap layers --------
  // Plants the nested stargate on the sky island and lets a person walk THROUGH it to
  // transition between the floating island (sky) and the flooded land below. The walk-
  // through drives the existing fly-down (54): cross the event-horizon -> descend; cross
  // back -> ascend. A bright portal flash sells the moment.
  //
  // v1 mechanic: window.__tinyworldGateTransit.enter() walks the demo person through the
  // gate and triggers the layer swap; the 'h' key does the same. (Full free-roam avatar
  // control on the surface is a later step — this proves the gate-as-transition loop.)
  // IIFE — no top-level identifiers leak into the shared global scope.
  (function gateTransitBoot() {
    'use strict';
    if (typeof window === 'undefined' || typeof THREE === 'undefined') return;

    let gate = null;          // { group, update, centerY, openR }
    let walker = null;        // voxel avatar that walks through
    let raf = null, t0 = null;
    let busy = false;         // mid walk-through
    let onSurface = false;    // which layer the gate currently leads to

    function parent() {
      if (typeof worldGroup !== 'undefined' && worldGroup) return worldGroup;
      if (typeof xrWorldRoot !== 'undefined' && xrWorldRoot) return xrWorldRoot;
      return (typeof scene !== 'undefined') ? scene : null;
    }

    // Ground height at a home cell (tile top), so the gate + walker sit on the island.
    function groundYAt(x, z) {
      if (typeof cellMeshes !== 'undefined' && cellMeshes[x + ',' + z] && cellMeshes[x + ',' + z].tile) {
        const bb = new THREE.Box3().setFromObject(cellMeshes[x + ',' + z].tile);
        if (isFinite(bb.max.y)) return bb.max.y;
      }
      return 0.18;
    }

    // Place the gate near the edge of the home board, on the path, opening facing inward.
    function placeGate() {
      if (gate) return gate;
      const SG = window.__tinyworldStargate;
      const par = parent();
      if (!SG || typeof SG.build !== 'function' || !par || typeof tilePos !== 'function') return null;
      const grid = (typeof GRID === 'number') ? GRID : 8;
      const ex = Math.max(0, Math.floor(grid / 2) - 1), ez = grid - 1;     // a back-edge cell
      const p = tilePos(ex, ez);
      const gy = groundYAt(ex, ez);
      gate = SG.build('nested');
      gate.group.position.set(p.x, gy, p.z);
      gate.group.rotation.y = 0;                                           // opening faces +z (toward board)
      gate.group.userData.gateTransit = true;
      par.add(gate.group);
      gate._cellZ = ez; gate._cellX = ex; gate._gy = gy; gate._p = p;
      startTick();
      return gate;
    }

    function ensureWalker() {
      if (walker) return walker;
      if (typeof window.makeVoxelAvatar !== 'function' || !gate) return null;
      walker = window.makeVoxelAvatar({ seed: 'gatewalker', fit: 'Scout', head: 'Wide' });
      parent().add(walker.group);
      return walker;
    }

    function flash() {
      if (!gate) return;
      // brief white bloom on the gate core (uses the gate's own additive materials)
      gate.group.traverse(o => {
        if (o.isMesh && o.material && o.material.blending === THREE.AdditiveBlending && o.material.transparent) {
          o.material.opacity = Math.min(1, (o.material.opacity || 0.5) + 0.5);
        }
      });
    }

    function startTick() {
      if (raf) return;
      const tick = (now) => {
        if (t0 == null) t0 = now;
        const t = (now - t0) / 1000;
        if (gate) gate.update(t);
        if (walker) walker.update(0.016);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }

    // Walk the person from in front of the gate, THROUGH the opening, then swap layers
    // as they cross the event-horizon plane.
    function enter() {
      if (busy) return false;
      if (!gate) { if (!placeGate()) return false; }
      const av = ensureWalker(); if (!av) return false;
      busy = true;
      const p = gate._p, gy = gate._gy;
      const startZ = p.z + 1.1, endZ = p.z - 1.1, crossZ = p.z;   // approach +z -> exit -z
      av.group.position.set(p.x, gy, startZ);
      av.setHeading(Math.PI);                                     // face -z (into the gate)
      av.setState('walk');
      let crossed = false, et0 = null;
      const speed = 1.2;                                          // units/sec
      const step = (now) => {
        if (et0 == null) et0 = now;
        const dt = 0.016;
        const z = av.group.position.z;
        const nz = Math.max(endZ, z - speed * dt);
        av.group.position.z = nz;
        av.update(dt);
        if (!crossed && nz <= crossZ) {                          // crossed the event-horizon
          crossed = true;
          flash();
          if (!onSurface) { if (window.__tinyworldFlyDown) window.__tinyworldFlyDown.descend(); onSurface = true; }
          else { if (window.__tinyworldFlyDown) window.__tinyworldFlyDown.ascend(); onSurface = false; }
        }
        if (nz > endZ) { requestAnimationFrame(step); }
        else { av.setState('idle'); busy = false; }
      };
      requestAnimationFrame(step);
      return true;
    }

    function remove() {
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      if (walker) { try { walker.dispose(); } catch (_) {} walker = null; }
      if (gate) { try { gate.group.parent && gate.group.parent.remove(gate.group); gate.group.traverse(o => { if (o.isMesh) { o.geometry && o.geometry.dispose(); o.material && o.material.dispose(); } }); } catch (_) {} gate = null; }
      busy = false; onSurface = false; t0 = null;
    }

    window.__tinyworldGateTransit = {
      placeGate, enter, remove,
      isOnSurface: () => onSurface,
      gate: () => gate,
    };

    // 'h' = place the gate (first press) / walk through it to swap layers.
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'h' && e.key !== 'H') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = document.activeElement; if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (!gate) placeGate(); else enter();
    });
  })();
