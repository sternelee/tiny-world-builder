// -------- 几何体缓存 — 从浏览器引擎 03-geometry-materials.js 提取 --------

import * as THREE from 'three'

const cache = new Map<string, THREE.BufferGeometry>()

export function getBoxGeometry(w: number, h: number, d: number): THREE.BoxGeometry {
  const qw = Math.round(w * 100) / 100
  const qh = Math.round(h * 100) / 100
  const qd = Math.round(d * 100) / 100
  const key = `box|${qw}|${qh}|${qd}`
  let g = cache.get(key) as THREE.BoxGeometry | undefined
  if (!g) {
    g = new THREE.BoxGeometry(qw, qh, qd)
    g.userData.cached = true
    cache.set(key, g)
  }
  return g
}

/** 有选择面的 Box（省略不可见面）materialIndex: 0=+x 1=-x 2=+y 3=-y 4=+z 5=-z */
export function getOpenBoxGeometry(
  w: number, h: number, d: number,
  skipTop = false, skipBottom = false,
  skipPX = false, skipNX = false, skipPZ = false, skipNZ = false,
): THREE.BoxGeometry {
  const key = `obox|${Math.round(w*100)}|${Math.round(h*100)}|${Math.round(d*100)}|${skipTop?1:0}${skipBottom?1:0}${skipPX?1:0}${skipNX?1:0}${skipPZ?1:0}${skipNZ?1:0}`
  let g = cache.get(key) as THREE.BoxGeometry | undefined
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d)
    const anySkip = skipTop || skipBottom || skipPX || skipNX || skipPZ || skipNZ
    if (anySkip) {
      const idx = g.getIndex()!.array
      const keep: number[] = []
      for (const grp of g.groups) {
        const mi = grp.materialIndex
        if (skipPX && mi === 0) continue
        if (skipNX && mi === 1) continue
        if (skipTop && mi === 2) continue
        if (skipBottom && mi === 3) continue
        if (skipPZ && mi === 4) continue
        if (skipNZ && mi === 5) continue
        for (let i = grp.start; i < grp.start + grp.count; i++) keep.push(idx[i])
      }
      g.setIndex(keep)
      g.groups.length = 0
      g.addGroup(0, keep.length, 0)
    }
    g.userData.cached = true
    cache.set(key, g)
  }
  return g
}

export function getSphereGeometry(radius: number, ws = 8, hs = 8): THREE.SphereGeometry {
  const qr = Math.round(radius * 1000) / 1000
  const key = `sphere|${qr}|${ws}|${hs}`
  let g = cache.get(key) as THREE.SphereGeometry | undefined
  if (!g) {
    g = new THREE.SphereGeometry(qr, ws, hs)
    g.userData.cached = true
    cache.set(key, g)
  }
  return g
}

export function getCylinderGeometry(radius: number, height: number, seg = 12): THREE.CylinderGeometry {
  const qr = Math.round(radius * 1000) / 1000
  const qh = Math.round(height * 100) / 100
  const key = `cyl|${qr}|${qh}|${seg}`
  let g = cache.get(key) as THREE.CylinderGeometry | undefined
  if (!g) {
    g = new THREE.CylinderGeometry(qr, qr, qh, seg)
    g.userData.cached = true
    cache.set(key, g)
  }
  return g
}

export function getConeGeometry(radius: number, height: number, seg = 8): THREE.ConeGeometry {
  const qr = Math.round(radius * 1000) / 1000
  const qh = Math.round(height * 100) / 100
  const key = `cone|${qr}|${qh}|${seg}`
  let g = cache.get(key) as THREE.ConeGeometry | undefined
  if (!g) {
    g = new THREE.ConeGeometry(qr, qh, seg)
    g.userData.cached = true
    cache.set(key, g)
  }
  return g
}

export function getTorusGeometry(radius: number, tube: number, seg = 8): THREE.TorusGeometry {
  const qr = Math.round(radius * 1000) / 1000
  const qt = Math.round(tube * 1000) / 1000
  const key = `torus|${qr}|${qt}|${seg}`
  let g = cache.get(key) as THREE.TorusGeometry | undefined
  if (!g) {
    g = new THREE.TorusGeometry(qr, qt, seg, seg)
    g.userData.cached = true
    cache.set(key, g)
  }
  return g
}

// roundedSlab — extruded rounded rectangle for tile pieces
export function getRoundedSlab(size: number, height: number, radius = 0.07): THREE.ExtrudeGeometry {
  const key = `slab|${size}|${height}|${radius}`
  let g = cache.get(key) as THREE.ExtrudeGeometry | undefined
  if (!g) {
    const w = size / 2; const r = Math.min(radius, w - 0.01)
    const shape = new THREE.Shape()
    shape.moveTo(-w + r, -w)
    shape.lineTo(w - r, -w)
    shape.quadraticCurveTo(w, -w, w, -w + r)
    shape.lineTo(w, w - r)
    shape.quadraticCurveTo(w, w, w - r, w)
    shape.lineTo(-w + r, w)
    shape.quadraticCurveTo(-w, w, -w, w - r)
    shape.lineTo(-w, -w + r)
    shape.quadraticCurveTo(-w, -w, -w + r, -w)
    g = new THREE.ExtrudeGeometry(shape, {
      depth: height, bevelEnabled: true, bevelSegments: 2,
      bevelSize: 0.04, bevelThickness: 0.04, curveSegments: 4,
    })
    g.rotateX(-Math.PI / 2)
    g.userData.cached = true
    cache.set(key, g)
  }
  return g
}

/** safe dispose — skips cached geometries */
export function safeDisposeGeometry(geo: THREE.BufferGeometry | null | undefined) {
  if (geo && !geo.userData?.cached) geo.dispose()
}
