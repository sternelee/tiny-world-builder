// -------- 格子邻接算法 — pure logic, no THREE dependency --------

import { CellState, WorldGrid, ensureCell } from './world-data'

/** 4-邻域偏移 */
const NEIGHBORS_4: [number, number][] = [
  [ 1, 0], [-1, 0],
  [ 0, 1], [ 0,-1],
]

/** 8-邻域偏移 */
const NEIGHBORS_8: [number, number][] = [
  [ 1, 0], [-1, 0], [ 0, 1], [ 0,-1],
  [ 1, 1], [ 1,-1], [-1, 1], [-1,-1],
]

/** 获取邻居格子 */
export function getNeighbor(
  world: WorldGrid, x: number, z: number, dx: number, dz: number, grid: number,
): CellState | null {
  const nx = x + dx
  const nz = z + dz
  if (nx < 0 || nx >= grid || nz < 0 || nz >= grid) return null
  return ensureCell(world, nx, nz)
}

/** 获取 4-邻域 */
export function getNeighbors4(
  world: WorldGrid, x: number, z: number, grid: number,
): CellState[] {
  return NEIGHBORS_4
    .map(([dx, dz]) => getNeighbor(world, x, z, dx, dz, grid))
    .filter((n): n is CellState => n !== null)
}

/** 获取 8-邻域 */
export function getNeighbors8(
  world: WorldGrid, x: number, z: number, grid: number,
): CellState[] {
  return NEIGHBORS_8
    .map(([dx, dz]) => getNeighbor(world, x, z, dx, dz, grid))
    .filter((n): n is CellState => n !== null)
}

// ======== 围栏邻接 ========

/** 围栏接合方向（邻接围栏的位掩码） */
export function getFenceNeighbors(
  world: WorldGrid, x: number, z: number, grid: number,
): { n: boolean; s: boolean; e: boolean; w: boolean } {
  const cell = ensureCell(world, x, z)
  const isFence = (c: CellState) => c.kind === 'fence' || (c.extras && c.extras.some(e => e.kind === 'fence'))

  return {
    n: !!getNeighbor(world, x, z, 0, -1, grid) && isFence(getNeighbor(world, x, z, 0, -1, grid)!),
    s: !!getNeighbor(world, x, z, 0, 1, grid) && isFence(getNeighbor(world, x, z, 0, 1, grid)!),
    e: !!getNeighbor(world, x, z, 1, 0, grid) && isFence(getNeighbor(world, x, z, 1, 0, grid)!),
    w: !!getNeighbor(world, x, z, -1, 0, grid) && isFence(getNeighbor(world, x, z, -1, 0, grid)!),
  }
}

/** 围栏侧面段数（角落→post位置） */
export function fenceSideSegments(dx: number, dz: number): number {
  // 两个邻接 = corner post, 一个邻接 = 5 段, 无邻接 = 1 段
  const count = (dx ? 1 : 0) + (dz ? 1 : 0)
  if (count >= 2) return 0 // corner
  if (count === 1) return 5
  return 1
}

// ======== 房子聚类 BFS ========

/** BFS 收集邻接房子的格子簇 */
export function bfsHouseCluster(
  world: WorldGrid, sx: number, sz: number, grid: number,
): Array<{ x: number; z: number }> {
  const cluster: Array<{ x: number; z: number }> = []
  const visited = new Set<string>()
  const queue: Array<{ x: number; z: number }> = [{ x: sx, z: sz }]

  while (queue.length > 0) {
    const cur = queue.shift()!
    const key = `${cur.x},${cur.z}`
    if (visited.has(key)) continue
    visited.add(key)
    cluster.push(cur)

    for (const [dx, dz] of NEIGHBORS_4) {
      const nx = cur.x + dx
      const nz = cur.z + dz
      if (nx < 0 || nx >= grid || nz < 0 || nz >= grid) continue
      const nk = `${nx},${nz}`
      if (visited.has(nk)) continue
      const cell = ensureCell(world, nx, nz)
      if (cell.kind === 'house') {
        queue.push({ x: nx, z: nz })
      }
    }
  }

  return cluster
}

/** 判断房子聚类形状：'single' | 'L' | 'T' | '+' | 'square' | 'row' */
export function classifyClusterShape(
  cells: Array<{ x: number; z: number }>,
): string {
  if (cells.length === 0) return 'none'
  if (cells.length === 1) return 'single'

  const xs = cells.map(c => c.x)
  const zs = cells.map(c => c.z)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minZ = Math.min(...zs)
  const maxZ = Math.max(...zs)
  const w = maxX - minX + 1
  const h = maxZ - minZ + 1
  const area = w * h

  // 正方形
  if (w === h && cells.length === area) return 'square'
  // 行/列
  if (h === 1 || w === 1) return 'row'

  // 检查 L/T/+ 形状（通过覆盖度判断）
  const coverage = cells.length / area
  if (coverage >= 0.75) {
    // 密集 → 检查缺口
    const gapCoords = []
    for (let x = minX; x <= maxX; x++) {
      for (let z = minZ; z <= maxZ; z++) {
        if (!cells.find(c => c.x === x && c.z === z)) {
          gapCoords.push({ x, z })
        }
      }
    }
    if (gapCoords.length === 1) {
      const gx = gapCoords[0].x
      const gz = gapCoords[0].z
      const isCorner = (gx === minX || gx === maxX) && (gz === minZ || gz === maxZ)
      if (isCorner) return 'L'
      const isEdge = (gx === minX || gx === maxX || gz === minZ || gz === maxZ)
      if (isEdge) return 'T'
    }
  }

  return 'cluster'
}

// ======== 道路邻接 ========

/** 道路连接方向 */
export function getRoadNeighbors(
  world: WorldGrid, x: number, z: number, grid: number,
): { n: boolean; s: boolean; e: boolean; w: boolean } {
  return {
    n: getNeighbor(world, x, z, 0, -1, grid)?.terrain === 'path',
    s: getNeighbor(world, x, z, 0, 1, grid)?.terrain === 'path',
    e: getNeighbor(world, x, z, 1, 0, grid)?.terrain === 'path',
    w: getNeighbor(world, x, z, -1, 0, grid)?.terrain === 'path',
  }
}

// ======== 桥梁邻接 ========

export interface BridgeNeighbors {
  n: boolean; s: boolean; e: boolean; w: boolean
}

/** 桥梁连接方向 */
export function getBridgeNeighbors(
  world: WorldGrid, x: number, z: number, grid: number,
): BridgeNeighbors {
  const isBridge = (c: CellState) => c.kind === 'bridge' || c.terrain === 'path'

  return {
    n: !!getNeighbor(world, x, z, 0, -1, grid) && isBridge(getNeighbor(world, x, z, 0, -1, grid)!),
    s: !!getNeighbor(world, x, z, 0, 1, grid) && isBridge(getNeighbor(world, x, z, 0, 1, grid)!),
    e: !!getNeighbor(world, x, z, 1, 0, grid) && isBridge(getNeighbor(world, x, z, 1, 0, grid)!),
    w: !!getNeighbor(world, x, z, -1, 0, grid) && isBridge(getNeighbor(world, x, z, -1, 0, grid)!),
  }
}

// ======== 水体邻接（岸边/泡沫） ========

/** 4-邻域水面计数 */
export function getWaterNeighborCount(
  world: WorldGrid, x: number, z: number, grid: number,
): number {
  let count = 0
  for (const [dx, dz] of NEIGHBORS_4) {
    const n = getNeighbor(world, x, z, dx, dz, grid)
    if (n?.terrain === 'water') count++
  }
  return count
}

/** 判断是否岸边格子（邻接水面但自身不是水） */
export function isShoreCell(
  world: WorldGrid, x: number, z: number, grid: number,
): boolean {
  const cell = ensureCell(world, x, z)
  if (cell.terrain === 'water') return false
  return getWaterNeighborCount(world, x, z, grid) > 0
}

// ======== 石板邻接 ========

/** 获取同种石板的 4-邻域掩码 */
export function getStoneNeighbors(
  world: WorldGrid, x: number, z: number, grid: number,
): { n: boolean; s: boolean; e: boolean; w: boolean } {
  return {
    n: getNeighbor(world, x, z, 0, -1, grid)?.terrain === 'stone',
    s: getNeighbor(world, x, z, 0, 1, grid)?.terrain === 'stone',
    e: getNeighbor(world, x, z, 1, 0, grid)?.terrain === 'stone',
    w: getNeighbor(world, x, z, -1, 0, grid)?.terrain === 'stone',
  }
}

/** 获取4-邻域的地形类型 */
export function getTerrainNeighbors(
  world: WorldGrid, x: number, z: number, grid: number,
): { n: string; s: string; e: string; w: string } {
  return {
    n: getNeighbor(world, x, z, 0, -1, grid)?.terrain || 'grass',
    s: getNeighbor(world, x, z, 0, 1, grid)?.terrain || 'grass',
    e: getNeighbor(world, x, z, 1, 0, grid)?.terrain || 'grass',
    w: getNeighbor(world, x, z, -1, 0, grid)?.terrain || 'grass',
  }
}

/** 获取4-邻域的 tile 层高（riser 侧边 culling 用）*/
export function getLevelNeighbors(
  world: WorldGrid, x: number, z: number, grid: number,
): { n: number | null; s: number | null; e: number | null; w: number | null } {
  const probe = (nx: number, nz: number): number | null => {
    if (nx < 0 || nx >= grid || nz < 0 || nz >= grid) return null
    const c = ensureCell(world, nx, nz)
    return c.terrainFloors || 1
  }
  return {
    n: probe(x, z - 1),
    s: probe(x, z + 1),
    e: probe(x + 1, z),
    w: probe(x - 1, z),
  }
}
