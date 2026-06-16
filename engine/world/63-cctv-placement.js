  // -------- CCTV placement: lobby side-cams, pumpkincam, treecams --------
  // Wires the surveillance system (62-cctv-truman.js) into the worlds room. When a
  // player enters a tinyverse room we mount physical monitors flanking BOTH sides of
  // the lobby presentation screen, add a "PUMPKINCAM" over the largest pumpkin patch
  // and one or two "TREECAM"s over trees, point the room's avatar feed at the cameras
  // so they track whoever's moving, and enable capture. On leave we tear it all down.
  //
  // All cameras + monitors live under avatarParent() (the same local frame the
  // avatars and lobby screen use), so subject positions need no conversion and the
  // rig inherits the tinyverse scale/offset automatically.
  //
  // 4-space body indent keeps locals out of the duplicate-declaration guard.
  (function cctvPlacementBoot() {
    'use strict';
    if (typeof window === 'undefined' || typeof THREE === 'undefined') return;

    const WS = (window.__tinyworldWorlds = window.__tinyworldWorlds || {});
    const mounted = [];            // { id, monitor } we added to the parent
    let active = false;
    let parentRef = null;

    function CCTV() { return window.__tinyworldCCTV || null; }

    function gridSize() {
      return (typeof GRID !== 'undefined' && GRID) ? GRID : 8;
    }
    // Cell (x,z) -> world position in the avatar/lobby local frame (matches tilePos).
    function cellWorld(x, z) {
      const g = gridSize();
      return new THREE.Vector3(x - g / 2 + 0.5, 0, z - g / 2 + 0.5);
    }
    // Ground height at a cell, so cams sit a believable height above their subject.
    function groundY(x, z) {
      if (typeof voxelGroundY === 'function') { try { return voxelGroundY(x, z) || 0; } catch (_) {} }
      if (typeof cellMeshes !== 'undefined' && cellMeshes) {
        const cm = cellMeshes[x + ',' + z];
        if (cm && cm.tile) { try { return new THREE.Box3().setFromObject(cm.tile).max.y || 0; } catch (_) {} }
      }
      return 0;
    }

    // Scan world[][] for cells of a given kind; returns [{x,z,floors}] sorted by
    // floors desc (so "largest" pumpkin / tallest tree wins).
    function findKind(kind) {
      const out = [];
      const g = gridSize();
      if (typeof world === 'undefined' || !world) return out;
      for (let x = 0; x < g; x++) {
        if (!world[x]) continue;
        for (let z = 0; z < g; z++) {
          const c = world[x][z];
          if (c && c.kind === kind) out.push({ x, z, floors: c.floors || 1 });
        }
      }
      out.sort((a, b) => b.floors - a.floors);
      return out;
    }

    // North edge centre (where the lobby presentation screen stands) in local frame.
    function lobbyScreenAnchor() {
      const g = gridSize();
      return new THREE.Vector3(0, 0, -(g / 2) + 1.0);   // mirrors 58-lobby-presentation screenZ()
    }

    // Mount one camera + its physical monitor. camPos/look in local frame.
    function mount(id, name, camPos, look, monPos, monLookAt, opts) {
      const cc = CCTV(); if (!cc) return;
      opts = opts || {};
      const feed = cc.addCamera({
        id, name,
        pos: [camPos.x, camPos.y, camPos.z],
        look: [look.x, look.y, look.z],
        fov: opts.fov || 50,
        sweep: opts.sweep || { yaw: 0.5, pitch: 0.08, speed: 0.3 },
      });
      const monitor = cc.buildMonitor(feed, { width: opts.width || 1.1 });
      if (!monitor) return;
      monitor.position.copy(monPos);
      if (monLookAt) monitor.lookAt(monLookAt);
      if (opts.rotY != null) monitor.rotation.y = opts.rotY;
      if (parentRef) parentRef.add(monitor);
      mounted.push({ id, monitor });
    }

    // Build low-impact cable conduit linking the monitors in a column to each other
    // and trunking into the main lobby screen — a bit of back-of-house realism.
    // Cheap: a handful of thin dark boxes, non-shadowing + non-pickable, parked just
    // behind the monitor backs (toward the screen at anchor.z) so they read as raceways
    // without adding draw/shadow cost. `col` = [{x,y}] monitor anchor points (same x),
    // `anchorZ` = screen plane z. All in the avatar/lobby local frame.
    function buildConnectors(columns, anchorZ) {
      if (!parentRef) return;
      const mat = new THREE.MeshStandardMaterial({ color: 0x0c0f15, roughness: 0.9, metalness: 0.15 });
      const grp = new THREE.Group();
      grp.name = 'cctv-cable-conduit';
      const strip = (w, h, d, x, y, z) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(x, y, z);
        m.castShadow = false; m.receiveShadow = false;
        m.userData.noShadow = true; m.userData.noReceiveShadow = true;
        m.userData.lightVisual = true;          // skip fade-material replacement (render-perf)
        m.raycast = function () {};              // non-pickable
        grp.add(m);
        return m;
      };
      const zBack = anchorZ + 0.04;             // just behind the monitor backs, toward the screen
      for (const col of columns) {
        if (!col.pts.length) continue;
        const xs = col.x;
        const ys = col.pts.map((p) => p.y).sort((a, b) => a - b);
        const yLo = ys[0], yHi = ys[ys.length - 1];
        // vertical riser down the back of the column linking stacked monitors
        if (yHi > yLo) strip(0.06, (yHi - yLo) + 0.3, 0.05, xs, (yLo + yHi) / 2, zBack);
        // short drop nipples at each monitor (where the cable "enters" the unit)
        for (const p of col.pts) strip(0.10, 0.06, 0.05, xs, p.y, zBack + 0.02);
        // horizontal trunk from the column's lowest monitor inward to the screen edge
        const innerX = (xs < 0) ? -0.45 : 0.45;
        const runW = Math.abs(xs - innerX);
        strip(runW, 0.055, 0.05, (xs + innerX) / 2, yLo, zBack);
        // small junction box where it meets the screen frame
        strip(0.18, 0.18, 0.10, innerX, yLo, anchorZ - 0.02);
      }
      parentRef.add(grp);
      mounted.push({ id: '__conduit', monitor: grp });   // tracked so teardown removes it
    }

    function setup() {
      const cc = CCTV(); if (!cc) return;
      teardown();   // idempotent
      parentRef = (typeof WS.avatarParent === 'function' && WS.avatarParent()) || (typeof scene !== 'undefined' ? scene : null);
      if (!parentRef) return;

      const g = gridSize();
      const anchor = lobbyScreenAnchor();           // screen centre, north edge
      const screenY = groundY(Math.round(g / 2), 1) ;

      // --- two lobby cams flanking BOTH sides of the presentation screen ---
      // They sit on short poles either side of the screen, angled inward+down at
      // the crowd that gathers in front (toward +z, the board centre). Monitors are
      // mounted right beside the screen frame, facing the audience.
      const sideX = 3.6, camY = screenY + 2.6, monY = screenY + 2.2;
      const crowd = new THREE.Vector3(0, screenY + 0.7, anchor.z + 3.0);  // where people gather
      for (const sx of [-1, 1]) {
        const camPos = new THREE.Vector3(sx * sideX, camY, anchor.z + 0.2);
        const monPos = new THREE.Vector3(sx * (sideX + 0.2), monY, anchor.z + 0.15);
        const monLook = new THREE.Vector3(0, monY, anchor.z + 4.0);       // face the audience
        mount(
          sx < 0 ? 'lobby-l' : 'lobby-r',
          sx < 0 ? 'LOBBY CAM L' : 'LOBBY CAM R',
          camPos, crowd, monPos, monLook,
          { width: 1.25, fov: 54, sweep: { yaw: 0.45, pitch: 0.07, speed: 0.28 } }
        );
      }

      // --- PUMPKINCAM over the biggest pumpkin patch (fallback to board centre) ---
      const pumpkins = findKind('pumpkin');
      if (pumpkins.length) {
        const p = pumpkins[0];
        const wp = cellWorld(p.x, p.z); const gy = groundY(p.x, p.z);
        const camPos = new THREE.Vector3(wp.x + 1.6, gy + 2.2, wp.z + 1.6);
        const look = new THREE.Vector3(wp.x, gy + 0.4, wp.z);
        // Monitor goes up on the lobby screen's left, stacked above the side cam.
        const monPos = new THREE.Vector3(-(sideX + 0.2), monY + 1.5, anchor.z + 0.15);
        const monLook = new THREE.Vector3(0, monY + 1.5, anchor.z + 4.0);
        mount('pumpkincam', 'PUMPKINCAM', camPos, look, monPos, monLook,
          { width: 1.1, fov: 46, sweep: { yaw: 0.6, pitch: 0.12, speed: 0.4 } });
      }

      // --- TREECAMs over the tallest trees (up to 2) ---
      const trees = findKind('tree');
      const treeCount = Math.min(2, trees.length);
      for (let i = 0; i < treeCount; i++) {
        const tcell = trees[i];
        const wp = cellWorld(tcell.x, tcell.z); const gy = groundY(tcell.x, tcell.z);
        const camPos = new THREE.Vector3(wp.x - 1.6, gy + 2.8, wp.z + 1.6);
        const look = new THREE.Vector3(wp.x, gy + 0.6, wp.z);
        const monPos = new THREE.Vector3((sideX + 0.2), monY + 1.5 + i * 1.4, anchor.z + 0.15);
        const monLook = new THREE.Vector3(0, monY + 1.5 + i * 1.4, anchor.z + 4.0);
        mount('treecam-' + (i + 1), 'TREECAM 0' + (i + 1), camPos, look, monPos, monLook,
          { width: 1.1, fov: 48, sweep: { yaw: 0.55, pitch: 0.1, speed: 0.34 } });
      }

      // --- low-impact cable conduit linking the monitor columns + into the screen ---
      // Left column x = -(sideX+0.2): lobby-l @ monY, pumpkincam @ monY+1.5.
      // Right column x = +(sideX+0.2): lobby-r @ monY, treecam-1/2 stacked above.
      const colX = sideX + 0.2;
      const leftPts = [{ y: monY }];
      if (pumpkins.length) leftPts.push({ y: monY + 1.5 });
      const rightPts = [{ y: monY }];
      for (let i = 0; i < treeCount; i++) rightPts.push({ y: monY + 1.5 + i * 1.4 });
      buildConnectors([
        { x: -colX, pts: leftPts },
        { x: colX, pts: rightPts },
      ], anchor.z);

      // Feed live avatar positions to the cameras so they track whoever moves.
      if (typeof WS.subjects === 'function') cc.setSubjectsProvider(() => WS.subjects());
      cc.setEnabled(true);
      active = true;
      // Expose mounted feed ids so the lobby screen can cycle through them (cams only).
      window.__tinyworldCCTVFeeds = mounted.map((m) => m.id).filter((id) => id !== '__conduit');
    }

    function teardown() {
      const cc = CCTV();
      if (cc) {
        mounted.forEach((m) => {
          try { cc.removeCamera(m.id); } catch (_) {}
          if (m.monitor && m.monitor.parent) m.monitor.parent.remove(m.monitor);
        });
        cc.setEnabled(false);
        cc.setSubjectsProvider(null);
      }
      mounted.length = 0;
      window.__tinyworldCCTVFeeds = [];
      active = false;
    }

    if (typeof WS.on === 'function') {
      // Build slightly after enter so the lobby screen + world cells exist.
      WS.on('enter', () => { setTimeout(() => { try { setup(); } catch (_) {} }, 350); });
      WS.on('leave', () => { try { teardown(); } catch (_) {} });
    }

    window.__tinyworldCCTVPlacement = {
      setup, teardown,
      isActive: () => active,
      mountedIds: () => mounted.map((m) => m.id),
    };
  })();
