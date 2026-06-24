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

/** 生成地形瓦片 Mesh — 支持邻接感知 */
export function makeTile(
  terrain: string,
  level: number,
  tNeighbors?: TerrainNeighbors,
  lNeighbors?: LevelNeighbors,
): THREE.Group {
  const group = new THREE.Group()
  const mats = terrainVoxelMaterials(terrain)
  const rise = terrainRiseForLevel(level)
  const tn = tNeighbors || { n: terrain, s: terrain, e: terrain, w: terrain }

  // 顶层 slab
  const top = new THREE.Mesh(getRoundedSlab(TILE_SIZE, TOP_H), mats.base)
  top.position.y = rise
  top.userData.tileTop = true
  group.add(top)

  // 基层
  if (rise > 0) {
    const base = new THREE.Mesh(getBoxGeometry(TILE_SIZE, rise, TILE_SIZE), mats.low)
    base.position.y = rise / 2
    group.add(base)
  }

  // ---- 道路连接带（path 邻接 path 时延伸） ----
  if (terrain === 'path') {
    const bandW = 0.18; const bandH = 0.025
    for (const [dir, dx, dz] of [[tn.n, 0, -1], [tn.s, 0, 1], [tn.e, 1, 0], [tn.w, -1, 0]] as const) {
      if (dir === 'path') {
        const band = new THREE.Mesh(getBoxGeometry(bandW, bandH, 0.44), mats.base)
        if (dx) { band.rotation.y = Math.PI / 2; band.position.set(dx * 0.28, TOP_H + rise - 0.01, 0) }
        else band.position.set(0, TOP_H + rise - 0.01, dz * 0.28)
        group.add(band)
      }
    }
  }

  // ---- 水岸泡沫（water 邻接非水时加岸边） ----
  if (terrain === 'water') {
    for (const [dir, dx, dz] of [[tn.n, 0, -1], [tn.s, 0, 1], [tn.e, 1, 0], [tn.w, -1, 0]] as const) {
      if (dir !== 'water') {
        const shore = new THREE.Mesh(getBoxGeometry(0.06, 0.025, 0.90), M.waterFoam)
        if (dx) { shore.rotation.y = Math.PI / 2; shore.position.set(dx * 0.47, TOP_H + rise - 0.01, 0) }
        else shore.position.set(0, TOP_H + rise - 0.01, dz * 0.47)
        group.add(shore)
      }
    }
  }

  // ---- 地形 riser 侧边（相邻地形更高时加侧面板） ----
  if (lNeighbors && rise > 0) {
    const ln = lNeighbors
    const sides: Array<[number | null, number, number]> = [[ln.n, 0, -1], [ln.s, 0, 1], [ln.e, 1, 0], [ln.w, -1, 0]]
    for (const [nl, dx, dz] of sides) {
      if (nl !== null && nl < level) {
        const diff = rise - terrainRiseForLevel(nl)
        if (diff > 0.01) {
          const panel = new THREE.Mesh(getBoxGeometry(0.96, diff, 0.08), mats.low)
          if (dx) {
            panel.position.set(dx * 0.48, diff / 2, 0)
          } else {
            panel.position.set(0, diff / 2, dz * 0.48)
            panel.rotation.y = Math.PI / 2
          }
          group.add(panel)
        }
      }
    }
  }

  // 装饰细节
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

/** 邻接信息 */
export interface CellNeighbors {
  n: boolean; s: boolean; e: boolean; w: boolean
}

/** 地形邻接信息 */
export interface TerrainNeighbors {
  n: string; s: string; e: string; w: string
}

/** 层高邻接信息 */
export interface LevelNeighbors {
  n: number | null; s: number | null; e: number | null; w: number | null
}

/** 生成物体 Mesh — 支持邻接感知 */
export function makeObject(
  kind: string, _cell?: CellState, neighbors?: CellNeighbors,
  clusterInfo?: { shape: string; length?: number; orientation?: string },
): THREE.Group | null {
  const group = new THREE.Group()

  switch (kind) {
    case 'tree':
      return makeTree(group)
    case 'rock':
      return makeRock(group)
    case 'fence':
      return makeFenceWithNeighbors(neighbors ?? { n: false, s: false, e: false, w: false })
    case 'bridge':
      return makeBridgeWithNeighbors(group, neighbors ?? { n: false, s: false, e: false, w: false })
    case 'house':
      return makeHouse(group, clusterInfo)
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

/** 围栏渲染 — 邻接感知：只渲染与邻居连接的段和角柱 */
function makeFenceWithNeighbors(n: { n: boolean; s: boolean; e: boolean; w: boolean }): THREE.Group {
  const g = new THREE.Group()
  const postMat = M.fencePost
  const railMat = M.fenceRail
  const postW = 0.06; const postH = 0.35; const postD = 0.06

  // 在格子的 4 个角渲染柱子
  const corners: Array<{ x: number; z: number; sides: [boolean, boolean] }> = [
    { x: -0.43, z: -0.43, sides: [n.n, n.w] },  // NW corner (touches N and W edges)
    { x: 0.43, z: -0.43, sides: [n.n, n.e] },   // NE corner
    { x: -0.43, z: 0.43, sides: [n.s, n.w] },   // SW corner
    { x: 0.43, z: 0.43, sides: [n.s, n.e] },    // SE corner
  ]

  for (const c of corners) {
    // 如果两邻接面都有围栏 → corner post
    // 如果只有一面有 → T-junction post
    // 如果都没 → standalone post
    const post = new THREE.Mesh(getBoxGeometry(postW, postH, postD), postMat)
    post.position.set(c.x, postH / 2, c.z)
    g.add(post)
  }

  // 沿有邻接的边渲染横栏
  const railH = 0.04; const railD = 0.04
  if (n.n) {
    const r1 = new THREE.Mesh(getBoxGeometry(0.86, railH, railD), railMat)
    r1.position.set(0, 0.24, -0.43)
    g.add(r1)
    const r2 = new THREE.Mesh(getBoxGeometry(0.86, 0.03, railD), railMat)
    r2.position.set(0, 0.12, -0.43)
    g.add(r2)
  }
  if (n.s) {
    const r1 = new THREE.Mesh(getBoxGeometry(0.86, railH, railD), railMat)
    r1.position.set(0, 0.24, 0.43)
    g.add(r1)
    const r2 = new THREE.Mesh(getBoxGeometry(0.86, 0.03, railD), railMat)
    r2.position.set(0, 0.12, 0.43)
    g.add(r2)
  }
  if (n.e) {
    const r1 = new THREE.Mesh(getBoxGeometry(railD, railH, 0.86), railMat)
    r1.position.set(0.43, 0.24, 0)
    g.add(r1)
    const r2 = new THREE.Mesh(getBoxGeometry(railD, 0.03, 0.86), railMat)
    r2.position.set(0.43, 0.12, 0)
    g.add(r2)
  }
  if (n.w) {
    const r1 = new THREE.Mesh(getBoxGeometry(railD, railH, 0.86), railMat)
    r1.position.set(-0.43, 0.24, 0)
    g.add(r1)
    const r2 = new THREE.Mesh(getBoxGeometry(railD, 0.03, 0.86), railMat)
    r2.position.set(-0.43, 0.12, 0)
    g.add(r2)
  }

  return g
}

/** 桥梁渲染 — 沿 connect 方向排列木板 */
function makeBridgeWithNeighbors(g: THREE.Group, n: { n: boolean; s: boolean; e: boolean; w: boolean }): THREE.Group {
  // 检测路径连接方向：优先 N-S，次选 E-W
  const ns = n.n || n.s
  const ew = n.e || n.w
  const alongX = ns && !ew  // N-S 路径 → 桥沿 X 轴铺
    ? true
    : ew && !ns
      ? false  // E-W 路径 → 桥沿 Z 轴铺
      : true   // 默认 X 轴

  const count = 7; const spacing = 0.12
  const start = -(count - 1) * spacing / 2

  for (let i = 0; i < count; i++) {
    const pos = start + i * spacing
    const plank = new THREE.Mesh(
      getBoxGeometry(alongX ? 0.10 : 0.80, 0.04, alongX ? 0.80 : 0.10),
      M.bridgeWood,
    )
    if (alongX) plank.position.set(pos, 0.08, 0)
    else plank.position.set(0, 0.08, pos)
    g.add(plank)
  }

  // 护栏
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(
      getBoxGeometry(alongX ? 0.80 : 0.04, 0.08, alongX ? 0.04 : 0.80),
      M.bridgeWoodD,
    )
    if (alongX) rail.position.set(0, 0.14, side * 0.38)
    else rail.position.set(side * 0.38, 0.14, 0)
    g.add(rail)
  }

  return g
}

function makeHouse(
  g: THREE.Group,
  cluster?: { shape: string; length?: number; orientation?: string },
): THREE.Group {
  const shape = cluster?.shape || 'solo'

  if (shape === 'square') {
    return buildSquareHouse(g)
  }
  if (shape === 'row' && cluster?.length) {
    return buildStretchedHouse(g, cluster.length, cluster.orientation || 'x')
  }
  return buildSoloHouse(g)
}

/** 独栋房子 */
function buildSoloHouse(g: THREE.Group): THREE.Group {
  const base = new THREE.Mesh(getBoxGeometry(0.80, 0.28, 0.80), M.wallCream)
  base.position.y = 0.14
  g.add(base)

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

  const door = new THREE.Mesh(getBoxGeometry(0.12, 0.16, 0.04), M.door)
  door.position.set(0, 0.10, 0.41)
  g.add(door)

  for (const wx of [-0.20, 0.20]) {
    const win = new THREE.Mesh(getBoxGeometry(0.08, 0.08, 0.02), M.windowB)
    win.position.set(wx, 0.18, 0.41)
    g.add(win)
  }
  return g
}

/** 行状房子（2+ 格连成一线）*/
function buildStretchedHouse(g: THREE.Group, length: number, orientation: string): THREE.Group {
  const l = Math.min(length, 4)
  const w = orientation === 'x' ? l * 0.96 : 0.80
  const d = orientation === 'x' ? 0.80 : l * 0.96

  const base = new THREE.Mesh(getBoxGeometry(w, 0.28, d), M.wallCream)
  base.position.y = 0.14
  g.add(base)

  const roofShape = new THREE.Shape()
  roofShape.moveTo(-w / 2, 0)
  roofShape.lineTo(w / 2, 0)
  roofShape.lineTo(0, 0.30)
  roofShape.closePath()
  const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: d, bevelEnabled: false })
  roofGeo.rotateX(Math.PI / 2)
  roofGeo.translate(0, 0.28, -d / 2)
  const roof = new THREE.Mesh(roofGeo, M.roofBlue)
  g.add(roof)

  // Windows spaced along the length
  for (let i = 0; i < l; i++) {
    const wx = orientation === 'x' ? (i - (l - 1) / 2) * 0.20 : 0
    const wz = orientation === 'x' ? 0 : (i - (l - 1) / 2) * 0.20
    const win = new THREE.Mesh(getBoxGeometry(0.08, 0.08, 0.02), M.windowB)
    win.position.set(wx, 0.18, wz + (orientation === 'x' ? 0.41 : d / 2 - 0.02))
    g.add(win)
  }
  return g
}

/** 2×2 正方形房子 */
function buildSquareHouse(g: THREE.Group): THREE.Group {
  const base = new THREE.Mesh(getBoxGeometry(1.90, 0.32, 1.90), M.wallCream)
  base.position.y = 0.16
  g.add(base)

  // Pyramid roof
  const roofShape = new THREE.Shape()
  roofShape.moveTo(-1.00, 0)
  roofShape.lineTo(1.00, 0)
  roofShape.lineTo(0, 0.38)
  roofShape.closePath()
  const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: 1.90, bevelEnabled: false })
  roofGeo.rotateX(Math.PI / 2)
  roofGeo.translate(0, 0.32, -0.95)
  const roof = new THREE.Mesh(roofGeo, M.roofBlueD)
  g.add(roof)

  // Double door
  const door = new THREE.Mesh(getBoxGeometry(0.18, 0.20, 0.04), M.door)
  door.position.set(0, 0.14, 0.96)
  g.add(door)

  // Windows on all visible sides
  for (const side of [-0.80, 0.80]) {
    for (const w of [-0.40, 0, 0.40]) {
      const win = new THREE.Mesh(getBoxGeometry(0.08, 0.08, 0.02), M.windowB)
      win.position.set(side, 0.22, w)
      g.add(win)
    }
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
