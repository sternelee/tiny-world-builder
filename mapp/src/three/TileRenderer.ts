// -------- 瓦片 & 物体渲染器 — 把 CellState → Three.js Mesh --------

import * as THREE from 'three'
import { CellState } from '../core/world-data'
import { M, terrainVoxelMaterials } from './Materials'
import {
  getBoxGeometry, getSphereGeometry, getCylinderGeometry,
  getConeGeometry, getTorusGeometry, getRoundedSlab,
} from './GeometryCache'

/** 每格物理尺寸 */
export const TILE_SIZE = 1
export const TOP_H = 0.12
const FLOR_H = 0.18

/** 格子高度 */
export function tileLevelForCell(cell: Partial<CellState>): number {
  const f = cell.terrainFloors ?? 1
  if (cell.terrain === 'water' || cell.terrain === 'lava') return 1
  if (cell.kind === 'bridge') return Math.max(2, f)
  return f
}

/** 地形高度（世界坐标偏移） */
export function terrainRiseForLevel(level: number): number {
  return Math.max(0, (Math.min(8, level || 1) - 1) * 0.20)
}

/** 生成地形瓦片 Mesh */
export function makeTile(terrain: string, level: number): THREE.Group {
  const group = new THREE.Group()
  const mats = terrainVoxelMaterials(terrain)
  const rise = terrainRiseForLevel(level)

  // 顶层
  const top = new THREE.Mesh(
    getRoundedSlab(TILE_SIZE, TOP_H),
    mats.base,
  )
  top.position.y = rise
  top.userData.tileTop = true
  group.add(top)

  // 基层
  if (rise > 0) {
    const base = new THREE.Mesh(
      getBoxGeometry(TILE_SIZE, rise, TILE_SIZE),
      mats.low,
    )
    base.position.y = rise / 2
    group.add(base)
  }

  // 装饰细节（简单草籽、石头斑块）
  if (terrain === 'grass') {
    addDecal(group, mats.hi, 0.25, 0.05, rise)
    addDecal(group, mats.hi, -0.21, 0.03, rise)
    addDecal(group, mats.low, 0.15, 0.03, rise)
  }
  if (terrain === 'dirt' || terrain === 'path') {
    addDecal(group, mats.scuff, 0.18, 0.03, rise)
    addDecal(group, mats.scuff, -0.15, 0.02, rise)
  }

  return group
}

function addDecal(group: THREE.Group, mat: THREE.Material, ox: number, size: number, y: number) {
  const d = new THREE.Mesh(getBoxGeometry(size, 0.02, size), mat)
  d.position.set(ox, TOP_H + y + 0.005, 0)
  group.add(d)
}

/** 生成物体 Mesh */
export function makeObject(kind: string, _cell?: CellState): THREE.Group | null {
  const group = new THREE.Group()

  switch (kind) {
    case 'tree':
      return makeTree(group)
    case 'rock':
      return makeRock(group)
    case 'fence': {
      const g = makeFencePost()
      g.position.y = 0
      group.add(g)
      return group
    }
    case 'bridge':
      return makeBridge(group)
    case 'house':
      return makeHouse(group)
    case 'tuft':
      return makeTuft(group)
    case 'flower':
      return makeFlower(group)
    case 'bush':
      return makeBush(group)
    case 'crop':
    case 'corn':
      return makeCrop(group, kind)
    case 'wheat':
      return makeWheat(group)
    case 'pumpkin':
      return makePumpkin(group)
    case 'carrot':
      return makeCarrot(group)
    case 'sunflower':
      return makeSunflower(group)
    case 'cow':
      return makeCow(group)
    case 'sheep':
      return makeSheep(group)
    default:
      return null
  }
}

// ========== Object Factories ==========

function makeTree(g: THREE.Group): THREE.Group {
  // Trunk
  const trunk = new THREE.Mesh(getCylinderGeometry(0.06, 0.45, 6), M.trunk)
  trunk.position.y = 0.225
  g.add(trunk)
  // Canopy (3 spheres)
  for (let i = 0; i < 3; i++) {
    const leaf = new THREE.Mesh(
      getSphereGeometry(0.12 + Math.random() * 0.06, 6, 6),
      i === 1 ? M.leavesDk : M.leaves,
    )
    leaf.position.set(
      (Math.random() - 0.5) * 0.2,
      0.35 + Math.random() * 0.15,
      (Math.random() - 0.5) * 0.2,
    )
    g.add(leaf)
  }
  return g
}

function makeRock(g: THREE.Group): THREE.Group {
  const s = 0.06 + Math.random() * 0.08
  const rock = new THREE.Mesh(
    getSphereGeometry(s, 5, 5),
    Math.random() > 0.5 ? M.rock : M.rockDk,
  )
  rock.scale.y = 0.5 + Math.random() * 0.3
  rock.position.y = s * 0.25
  rock.rotation.set(Math.random(), Math.random(), 0)
  g.add(rock)
  return g
}

function makeFencePost(): THREE.Group {
  const g = new THREE.Group()
  const post = new THREE.Mesh(getBoxGeometry(0.06, 0.35, 0.06), M.fencePost)
  post.position.y = 0.175
  g.add(post)
  // rail
  const rail = new THREE.Mesh(getBoxGeometry(0.85, 0.04, 0.04), M.fenceRail)
  rail.position.y = 0.22
  g.add(rail)
  const rail2 = new THREE.Mesh(getBoxGeometry(0.85, 0.03, 0.03), M.fenceRail)
  rail2.position.y = 0.10
  g.add(rail2)
  return g
}

function makeBridge(g: THREE.Group): THREE.Group {
  // Planks
  for (let i = -3; i <= 3; i++) {
    const plank = new THREE.Mesh(getBoxGeometry(0.10, 0.04, 0.80), M.bridgeWood)
    plank.position.set(i * 0.12, 0.08, 0)
    g.add(plank)
  }
  // Side rails
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(getBoxGeometry(0.80, 0.08, 0.04), M.bridgeWoodD)
    rail.position.set(0, 0.14, side * 0.38)
    g.add(rail)
  }
  return g
}

function makeHouse(g: THREE.Group): THREE.Group {
  // Base
  const base = new THREE.Mesh(getBoxGeometry(0.80, 0.28, 0.80), M.wallCream)
  base.position.y = 0.14
  g.add(base)

  // Roof
  const roofShape = new THREE.Shape()
  roofShape.moveTo(-0.45, 0)
  roofShape.lineTo(0.45, 0)
  roofShape.lineTo(0, 0.30)
  roofShape.closePath()
  const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: 0.80, bevelEnabled: false })
  roofGeo.rotateX(Math.PI / 2)
  roofGeo.translate(0, 0.28, -0.40)
  const roof = new THREE.Mesh(roofGeo, M.roofBlue)
  g.add(roof)

  // Door
  const door = new THREE.Mesh(getBoxGeometry(0.12, 0.16, 0.04), M.door)
  door.position.set(0, 0.10, 0.41)
  g.add(door)

  // Windows
  for (const wx of [-0.20, 0.20]) {
    const win = new THREE.Mesh(getBoxGeometry(0.08, 0.08, 0.02), M.windowB)
    win.position.set(wx, 0.18, 0.41)
    g.add(win)
  }
  return g
}

function makeTuft(g: THREE.Group): THREE.Group {
  const blades = 3 + Math.floor(Math.random() * 3)
  for (let i = 0; i < blades; i++) {
    const blade = new THREE.Mesh(
      getBoxGeometry(0.008, 0.04 + Math.random() * 0.06, 0.008),
      M.grassHi,
    )
    blade.position.set(
      (Math.random() - 0.5) * 0.12,
      0.02 + Math.random() * 0.03,
      (Math.random() - 0.5) * 0.12,
    )
    blade.rotation.x = (Math.random() - 0.5) * 0.3
    blade.rotation.z = (Math.random() - 0.5) * 0.3
    g.add(blade)
  }
  return g
}

function makeFlower(g: THREE.Group): THREE.Group {
  const stem = new THREE.Mesh(getBoxGeometry(0.008, 0.06, 0.008), M.cropGreen)
  stem.position.y = 0.03
  g.add(stem)
  const head = new THREE.Mesh(getSphereGeometry(0.025, 5, 5), M.flower)
  head.position.y = 0.07
  g.add(head)
  return g
}

function makeBush(g: THREE.Group): THREE.Group {
  for (let i = 0; i < 4; i++) {
    const ball = new THREE.Mesh(
      getSphereGeometry(0.05 + Math.random() * 0.03, 5, 5),
      M.bush,
    )
    ball.position.set(
      (Math.random() - 0.5) * 0.12,
      0.03 + Math.random() * 0.04,
      (Math.random() - 0.5) * 0.12,
    )
    g.add(ball)
  }
  return g
}

function makeCrop(g: THREE.Group, _kind: string): THREE.Group {
  const stem = new THREE.Mesh(getBoxGeometry(0.008, 0.12, 0.008), M.cropGreen)
  stem.position.y = 0.06
  g.add(stem)
  const head = new THREE.Mesh(getSphereGeometry(0.03, 5, 5), M.cropYellow)
  head.position.y = 0.14
  g.add(head)
  return g
}

function makeWheat(g: THREE.Group): THREE.Group {
  for (let i = 0; i < 3; i++) {
    const stalk = new THREE.Mesh(getBoxGeometry(0.005, 0.14, 0.005), M.cropGreen)
    stalk.position.set((i - 1) * 0.04, 0.07, 0)
    stalk.rotation.x = (Math.random() - 0.5) * 0.2
    g.add(stalk)
    const grain = new THREE.Mesh(getSphereGeometry(0.012, 4, 4), M.cropYellow)
    grain.position.set((i - 1) * 0.04, 0.15, 0)
    g.add(grain)
  }
  return g
}

function makePumpkin(g: THREE.Group): THREE.Group {
  const body = new THREE.Mesh(getSphereGeometry(0.07, 8, 6), M.pumpkin)
  body.scale.y = 0.7
  body.position.y = 0.04
  g.add(body)
  const stem = new THREE.Mesh(getCylinderGeometry(0.008, 0.025, 4), M.pumpkinStem)
  stem.position.y = 0.07
  g.add(stem)
  return g
}

function makeCarrot(g: THREE.Group): THREE.Group {
  const top = new THREE.Mesh(getConeGeometry(0.025, 0.06, 5), M.carrotTop)
  top.position.y = 0.07
  g.add(top)
  const body = new THREE.Mesh(getConeGeometry(0.02, 0.05, 5), M.carrotBody)
  body.position.y = 0.03
  g.add(body)
  return g
}

function makeSunflower(g: THREE.Group): THREE.Group {
  const stem = new THREE.Mesh(getCylinderGeometry(0.008, 0.20, 4), M.cropGreen)
  stem.position.y = 0.10
  g.add(stem)
  // Petals
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const petal = new THREE.Mesh(getBoxGeometry(0.02, 0.04, 0.008), M.sunflowerPetal)
    petal.position.set(Math.sin(a) * 0.035, 0.20, Math.cos(a) * 0.035)
    petal.rotation.y = -a
    g.add(petal)
  }
  const center = new THREE.Mesh(getSphereGeometry(0.025, 6, 6), M.sunflowerCenter)
  center.position.y = 0.20
  g.add(center)
  return g
}

// ---- Animals (simple block style) ----
function makeCow(g: THREE.Group): THREE.Group {
  // Body
  const body = new THREE.Mesh(getBoxGeometry(0.18, 0.10, 0.10), M.cowWhite)
  body.position.y = 0.07
  g.add(body)
  // Head
  const head = new THREE.Mesh(getBoxGeometry(0.06, 0.06, 0.06), M.cowWhite)
  head.position.set(0.12, 0.09, 0)
  g.add(head)
  // Legs
  for (const lx of [-0.06, 0.06]) {
    for (const lz of [-0.04, 0.04]) {
      const leg = new THREE.Mesh(getBoxGeometry(0.02, 0.06, 0.02), M.cowSpot)
      leg.position.set(lx, 0.03, lz)
      g.add(leg)
    }
  }
  return g
}

function makeSheep(g: THREE.Group): THREE.Group {
  // Body (fluffy = wider)
  const body = new THREE.Mesh(getBoxGeometry(0.16, 0.12, 0.12), M.sheepWhite)
  body.position.y = 0.08
  g.add(body)
  // Head
  const head = new THREE.Mesh(getBoxGeometry(0.05, 0.05, 0.05), M.sheepFace)
  head.position.set(0.11, 0.09, 0)
  g.add(head)
  // Legs
  for (const lx of [-0.05, 0.05]) {
    for (const lz of [-0.035, 0.035]) {
      const leg = new THREE.Mesh(getBoxGeometry(0.02, 0.05, 0.02), M.sheepFace)
      leg.position.set(lx, 0.025, lz)
      g.add(leg)
    }
  }
  return g
}
