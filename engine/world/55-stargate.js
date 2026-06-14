  // -------- stargates: portal gates for the sky <-> land transition --------
  // Three selectable styles so you can compare and pick one for the fly-down:
  //   'voyager' — faithful port + polish of voxel-poser's mkPortalGate (voxel stone
  //               ring, gold chevrons, crystal nodes, counter-rotating glyph rings,
  //               recessed event-horizon disc + additive shimmer veil + glow light).
  //   'portal'  — a new, sleeker sci-fi gate: smooth metallic torus + 9 chevron studs
  //               + a layered animated event-horizon (rotating cyan shimmer discs).
  //   'rings'   — an upgrade of the island warpRing: concentric additive torus hoops
  //               with chevrons and a breathing core, a pure-energy gate.
  // API: window.__tinyworldStargate = { build(style), showDemo(), hideDemo(),
  //      setStyle(s), cycle(), styles, current(), update(dt) }
  // IIFE — no top-level identifiers leak into the shared global scope.
  (function stargateBoot() {
    'use strict';
    if (typeof window === 'undefined' || typeof THREE === 'undefined') return;

    const STYLES = ['voyager', 'portal', 'rings'];
    const _c = new THREE.Color();

    // ---- voxel mesher (vs-param, beveled) — ported from voxel-poser voxGeo ----
    function hash3(x, y, z) { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return s - Math.floor(s); }
    function vox(map, x, y, z, hex) { map.set(x + ',' + y + ',' + z, hex); }
    function voxGeo(map, cx, cy, cz, vs) {
      const pos = [], nor = [], col = [], idx = [];
      const PK = (x, y, z) => ((x + 128) << 16) | ((y + 128) << 8) | (z + 128);
      const occ = new Set(); const cells = [];
      for (const [k, hex] of map) { const p = k.split(','); const x = +p[0], y = +p[1], z = +p[2]; occ.add(PK(x, y, z)); cells.push(x, y, z, hex); }
      const has = (x, y, z) => occ.has(PK(x, y, z));
      const b = 0.22;
      const quad = (pts, n, r, g, bl) => { const base = pos.length / 3; for (const p of pts) { pos.push(p[0] * vs, p[1] * vs, p[2] * vs); nor.push(n[0], n[1], n[2]); col.push(r, g, bl); } idx.push(base, base + 1, base + 2, base + 2, base + 1, base + 3); };
      for (let ci = 0; ci < cells.length; ci += 4) {
        const x = cells[ci], y = cells[ci + 1], z = cells[ci + 2];
        _c.set(cells[ci + 3]).convertSRGBToLinear();
        const j = 0.94 + hash3(x, y, z) * 0.10; const r = _c.r * j, g = _c.g * j, bl = _c.b * j;
        const C = [x - cx, y - cy, z - cz];
        for (let a = 0; a < 3; a++) for (const s of [1, -1]) {
          const n = [0, 0, 0]; n[a] = s; if (has(x + n[0], y + n[1], z + n[2])) continue;
          const ua = (a + 1) % 3, va = (a + 2) % 3;
          const conv = (ax, ss) => { const e = [0, 0, 0]; e[ax] = ss; return !has(x + e[0], y + e[1], z + e[2]); };
          const corner = (su, sv) => { const p = [C[0], C[1], C[2]]; p[a] += s * 0.5; p[ua] += su * (0.5 - (conv(ua, su) ? b : 0)); p[va] += sv * (0.5 - (conv(va, sv) ? b : 0)); return p; };
          quad([corner(-1, -1), corner(1, -1), corner(-1, 1), corner(1, 1)], n, r, g, bl);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.setIndex(idx); geo.computeBoundingBox();
      return geo;
    }
    function shade(hex, f) { _c.set(hex).multiplyScalar(f); _c.r = Math.min(_c.r, 1); _c.g = Math.min(_c.g, 1); _c.b = Math.min(_c.b, 1); return '#' + _c.getHexString(); }

    // ============================ STYLE: voyager ============================
    // Ported + polished from voxel-poser mkPortalGate.
    function buildVoyager() {
      const vs = 0.05, g = new THREE.Group();
      const HJ = (x, y, z) => { let h = (x * 374761 + y * 668265 + z * 9301) | 0; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967296; };
      const STONE = ['#8c8f96', '#7d818a', '#969aa2', '#85888f'];
      const RAD = 15, RING = 5, TH = 3, CY = RAD + RING + 2;
      const OR = RAD * vs;
      const M = new Map();
      for (let y = -(RAD + RING + 1); y <= RAD + RING + 1; y++) for (let x = -(RAD + RING + 1); x <= RAD + RING + 1; x++) {
        const rr = Math.hypot(x, y); if (rr < RAD || rr > RAD + RING) continue;
        const band = (rr - RAD) / RING; const prof = Math.sin(band * Math.PI);
        const dz = Math.max(1, Math.round(TH * (0.45 + 0.55 * prof)));
        for (let z = -dz; z <= dz; z++) {
          let c; const inner = rr < RAD + 1.2;
          const chevron = (Math.round(Math.atan2(y, x) / (Math.PI * 2) * 36) % 4 === 0) && band > 0.35 && band < 0.85;
          if (inner && Math.abs(z) <= 1) c = '#2b3138';
          else if (chevron && z === 0) c = '#caa23a';
          else c = STONE[(Math.abs(x * 7 + y * 13 + z * 3)) % 4];
          let col = c; if (HJ(x, y, z) <= 0.5) col = shade(c, 0.78);
          vox(M, x, y + CY, z, col);
        }
      }
      for (let q = 0; q < 6; q++) { const a = q / 6 * Math.PI * 2, rr = RAD + RING - 1; const cxv = Math.round(Math.cos(a) * rr), cyv = Math.round(Math.sin(a) * rr); for (let k = 0; k < 3; k++) vox(M, cxv, cyv + CY + (k - 1), TH, '#7fe6ff'); }
      for (let y = 0; y <= CY - RAD - RING + 1; y++) for (const lx of [-4, -3, 3, 4]) for (let z = -2; z <= 2; z++) vox(M, lx, y, z, STONE[(y + lx + z) & 3]);
      for (let x = -6; x <= 6; x++) for (let z = -2; z <= 2; z++) vox(M, x, 0, z, '#6f7480');
      const frame = new THREE.Mesh(voxGeo(M, 0, 0, 0, vs), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.05, side: THREE.DoubleSide }));
      frame.castShadow = frame.receiveShadow = true; g.add(frame);
      const cyW = CY * vs;
      const runes = []; const runeGeo = new THREE.BoxGeometry(vs * 1.5, vs * 1.5, vs * 0.7);
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, rr = (RAD + RING * 0.5) * vs; const m = new THREE.Mesh(runeGeo, new THREE.MeshBasicMaterial({ color: 0x123a44 })); m.position.set(Math.cos(a) * rr, cyW + Math.sin(a) * rr, TH * vs + vs * 0.3); m.rotation.z = a; g.add(m); runes.push(m); }
      const rings = []; const ringDefs = [{ r: RAD - 0.5, teeth: 36, z: TH * vs + vs * 0.8 }, { r: RAD - 2.5, teeth: 24, z: -(TH * vs + vs * 0.8) }];
      for (const def of ringDefs) {
        const rg = new Map();
        for (let a = 0; a < def.teeth; a++) { const th = a / def.teeth * Math.PI * 2; const x = Math.round(Math.cos(th) * def.r), y = Math.round(Math.sin(th) * def.r); const lit = (a % 4 === 0); rg.set(x + ',' + y + ',0', lit ? '#7fe6ff' : '#39414c'); }
        const m = new THREE.Mesh(voxGeo(rg, 0, 0, 0, vs), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }));
        m.position.set(0, cyW, def.z); g.add(m); rings.push(m);
      }
      const horizon = new THREE.Mesh(new THREE.CircleGeometry(OR * 1.02, 48), new THREE.MeshBasicMaterial({ color: 0x0a2a3a, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
      horizon.position.set(0, cyW, -vs * 0.6); g.add(horizon);
      const veil = new THREE.Mesh(new THREE.CircleGeometry(OR * 1.04, 48), new THREE.MeshBasicMaterial({ color: 0x59d8ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      veil.position.set(0, cyW, vs * 0.3); g.add(veil);
      const light = new THREE.PointLight(0x6fd8ff, 0.8, 6); light.position.set(0, cyW, 0.4); g.add(light);
      g.position.y = 0;
      return {
        group: g, centerY: cyW, openR: OR,
        update(t) {
          rings[0].rotation.z = t * 0.6; rings[1].rotation.z = -t * 0.9;
          const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
          veil.material.opacity = 0.22 + pulse * 0.3; veil.scale.setScalar(1 + pulse * 0.015);
          horizon.material.opacity = 0.7 + pulse * 0.18;
          light.intensity = 0.6 + pulse * 0.9;
          for (let i = 0; i < runes.length; i++) { const lp = 0.5 + 0.5 * Math.sin(t * 3 + i * 0.5); runes[i].material.color.setRGB(0.07 + lp * 0.35, 0.23 + lp * 0.55, 0.27 + lp * 0.6); }
        },
      };
    }

    // ============================ STYLE: portal ============================
    // New sleek metallic gate + layered animated event-horizon.
    function buildPortal() {
      const g = new THREE.Group();
      const R = 0.85, tube = 0.1;
      const ringMat = new THREE.MeshStandardMaterial({ color: 0x33424f, roughness: 0.35, metalness: 0.85, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(R, tube, 18, 64), ringMat);
      ring.castShadow = true; g.add(ring);
      const innerMat = new THREE.MeshStandardMaterial({ color: 0x9fb4c4, roughness: 0.25, metalness: 0.9, side: THREE.DoubleSide });
      const inner = new THREE.Mesh(new THREE.TorusGeometry(R - tube * 0.6, tube * 0.35, 12, 64), innerMat); g.add(inner);
      // 9 chevron studs
      const chev = [];
      const chevGeo = new THREE.ConeGeometry(tube * 0.9, tube * 1.8, 4);
      for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; const m = new THREE.Mesh(chevGeo, new THREE.MeshStandardMaterial({ color: 0x2a3540, roughness: 0.4, metalness: 0.8, emissive: 0x000000 })); m.position.set(Math.cos(a) * R, Math.sin(a) * R, 0); m.rotation.z = a - Math.PI / 2; g.add(m); chev.push(m); }
      // layered event horizon: 2 additive cyan discs that rotate + a base disc
      const baseDisc = new THREE.Mesh(new THREE.CircleGeometry(R - tube * 0.4, 56), new THREE.MeshBasicMaterial({ color: 0x0b3550, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
      baseDisc.position.z = -0.02; g.add(baseDisc);
      const swirl = [];
      for (let k = 0; k < 2; k++) {
        const m = new THREE.Mesh(new THREE.RingGeometry((R - tube) * (0.15 + k * 0.4), (R - tube) * (0.55 + k * 0.42), 48, 1), new THREE.MeshBasicMaterial({ color: 0x5fd8ff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        m.position.z = 0.01 + k * 0.005; g.add(m); swirl.push(m);
      }
      const glow = new THREE.Mesh(new THREE.CircleGeometry(R + tube, 48), new THREE.MeshBasicMaterial({ color: 0x3fbfff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      glow.position.z = -0.03; g.add(glow);
      const light = new THREE.PointLight(0x5fd8ff, 0.8, 5); light.position.z = 0.3; g.add(light);
      g.position.y = R + tube + 0.1;          // stand the ring above ground
      // a small base plinth
      const plinth = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.5, R * 0.62, 0.12, 12), new THREE.MeshStandardMaterial({ color: 0x3a4652, roughness: 0.6, metalness: 0.5 }));
      plinth.position.set(0, -(R + tube + 0.04), 0); plinth.castShadow = true; g.add(plinth);
      return {
        group: g, centerY: R + tube + 0.1, openR: R - tube,
        update(t) {
          swirl[0].rotation.z = t * 0.8; swirl[1].rotation.z = -t * 1.3;
          const pulse = 0.5 + 0.5 * Math.sin(t * 2.0);
          swirl.forEach(s => { s.material.opacity = 0.25 + pulse * 0.4; });
          baseDisc.material.opacity = 0.75 + pulse * 0.2;
          glow.material.opacity = 0.08 + pulse * 0.14; glow.scale.setScalar(1 + pulse * 0.06);
          light.intensity = 0.5 + pulse * 1.0;
          for (let i = 0; i < chev.length; i++) { const lp = (Math.sin(t * 4 - i * 0.7) > 0.6) ? 1 : 0; chev[i].material.emissive.setRGB(lp * 0.2, lp * 0.55, lp * 0.7); }
        },
      };
    }

    // ============================ STYLE: rings ============================
    // Energy gate: concentric additive torus hoops + chevrons + breathing core.
    function buildRings() {
      const g = new THREE.Group();
      const R = 0.8;
      const hoops = [];
      const cols = [0xdffbff, 0x8fe3ff, 0x59c8ff, 0x3aa0ff];
      for (let i = 0; i < 4; i++) {
        const m = new THREE.Mesh(new THREE.TorusGeometry(R - i * 0.12, 0.022 + i * 0.006, 8, 64), new THREE.MeshBasicMaterial({ color: cols[i], transparent: true, opacity: 0.55 - i * 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        g.add(m); hoops.push(m);
      }
      // chevron spikes around the outer hoop
      const chev = [];
      const chevGeo = new THREE.ConeGeometry(0.03, 0.1, 4);
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; const m = new THREE.Mesh(chevGeo, new THREE.MeshBasicMaterial({ color: 0x7fe6ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })); m.position.set(Math.cos(a) * (R + 0.04), Math.sin(a) * (R + 0.04), 0); m.rotation.z = a + Math.PI / 2; g.add(m); chev.push(m); }
      // breathing core disc
      const core = new THREE.Mesh(new THREE.CircleGeometry(R - 0.42, 48), new THREE.MeshBasicMaterial({ color: 0x6fd8ff, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      g.add(core);
      const light = new THREE.PointLight(0x8fe3ff, 1.0, 6); light.position.z = 0.2; g.add(light);
      g.position.y = R + 0.12;
      return {
        group: g, centerY: R + 0.12, openR: R - 0.2,
        update(t) {
          for (let i = 0; i < hoops.length; i++) { hoops[i].rotation.z = (i % 2 ? -1 : 1) * t * (0.4 + i * 0.25); const p = 0.5 + 0.5 * Math.sin(t * 2 + i); hoops[i].material.opacity = (0.55 - i * 0.06) * (0.6 + p * 0.5); }
          const pulse = 0.5 + 0.5 * Math.sin(t * 1.6);
          core.scale.setScalar(0.9 + pulse * 0.18); core.material.opacity = 0.12 + pulse * 0.22;
          light.intensity = 0.7 + pulse * 0.9;
          for (let i = 0; i < chev.length; i++) chev[i].material.opacity = 0.5 + 0.5 * Math.abs(Math.sin(t * 3 + i * 0.4));
        },
      };
    }

    const BUILDERS = { voyager: buildVoyager, portal: buildPortal, rings: buildRings };
    function build(style) { return (BUILDERS[style] || buildVoyager)(); }

    // ---- demo: place all three side by side so you can compare ----
    let demo = null, raf = null, t0 = null;
    function parent() {
      if (typeof worldGroup !== 'undefined' && worldGroup) return worldGroup;
      if (typeof xrWorldRoot !== 'undefined' && xrWorldRoot) return xrWorldRoot;
      return (typeof scene !== 'undefined') ? scene : null;
    }
    function tick(now) {
      if (!demo) { raf = null; return; }
      if (t0 == null) t0 = now;
      const t = (now - t0) / 1000;
      demo.gates.forEach(gt => gt.update(t));
      raf = requestAnimationFrame(tick);
    }
    function showDemo(opts) {
      hideDemo();
      const par = parent(); if (!par) return null;
      opts = opts || {};
      const spacing = opts.spacing || 2.4;
      const y = (opts.y != null) ? opts.y : 0.05;
      const z = (opts.z != null) ? opts.z : 0;
      const gates = [];
      STYLES.forEach((s, i) => {
        const gt = build(s);
        gt.group.position.set((i - 1) * spacing, y, z);
        gt.group.userData.stargateStyle = s;
        gt.group.name = 'stargate-' + s;
        par.add(gt.group);
        gates.push(gt);
      });
      demo = { gates, parent: par };
      t0 = null; if (!raf) raf = requestAnimationFrame(tick);
      return { styles: STYLES.slice(), positions: gates.map(g => g.group.position.toArray()) };
    }
    function hideDemo() {
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      if (demo) { demo.gates.forEach(gt => { if (gt.group.parent) gt.group.parent.remove(gt.group); gt.group.traverse(o => { if (o.isMesh) { o.geometry && o.geometry.dispose(); o.material && o.material.dispose(); } }); }); demo = null; }
    }

    let current = 'voyager';
    window.__tinyworldStargate = {
      styles: STYLES.slice(),
      build, showDemo, hideDemo,
      current: () => current,
      setStyle: (s) => { if (STYLES.indexOf(s) >= 0) current = s; return current; },
      cycle: () => { current = STYLES[(STYLES.indexOf(current) + 1) % STYLES.length]; return current; },
    };

    // Keyboard: G toggles the 3-gate compare demo (skips when typing).
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'g' && e.key !== 'G') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = document.activeElement; if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (demo) hideDemo(); else showDemo();
    });
  })();
