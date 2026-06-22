// -------- 世界数据模型 — pure logic, no THREE/DOM dependency --------

import {
  TerrainType, ObjectKind, CROP_KINDS, MAX_FLOORS,
  WATER_FLOAT_KINDS, OBJECT_TERRAIN_OVERRIDES, HOME_GRID_DEFAULT,
} from './constants'

/** 单格完整状态 */
export interface CellState {
  terrain: TerrainType
  terrainFloors: number
  kind: ObjectKind
  floors: number
  rotationY: number
  offsetX: number
  offsetY: number
  offsetZ: number
  extras?: any[]
  userEdited?: boolean
  [key: string]: any
}

/** 世界数据 world[x][z] */
export type WorldGrid = Record<number, Record<number, CellState | undefined>>

/** setCell 选项 */
export interface SetCellOptions {
  terrain?: TerrainType
  kind?: ObjectKind
  floors?: number
  terrainFloors?: number
  forceTile?: boolean
  silent?: boolean
  animate?: boolean
  impactDust?: boolean
  rotationY?: number
  offsetX?: number
  offsetY?: number
  offsetZ?: number
  dest?: string
  label?: string
  userEdited?: boolean
  extras?: any[]
}

/** 默认格子值 */
export function defaultCell(): CellState {
  return {
    terrain: 'grass',
    terrainFloors: 1,
    kind: null,
    floors: 1,
    rotationY: 0,
    offsetX: 0,
    offsetY: 0,
    offsetZ: 0,
  }
}

/** 格子高度（楼层数→世界坐标偏移） */
export function tileLevelForCell(cell: Partial<CellState>): number {
  const f = cell.terrainFloors ?? 1
  const k = cell.kind
  // 水面只有 1 层
  if (cell.terrain === 'water' || cell.terrain === 'lava') return 1
  // 桥在水上+2
  if (k === 'bridge') return Math.max(2, f)
  return f
}

/** 地形高度（世界坐标） */
export function terrainRiseAt(tf: number): number {
  return (tf - 1) * 0.25
}

/** 默认 terrainFloors 值 */
export function terrainLevelForCell(prev: Partial<CellState>): number {
  return prev.terrainFloors ?? 1
}

/** 解析 setCell 选项，计算新旧差异 */
export interface CellDiff {
  terrainChanged: boolean
  kindChanged: boolean
  floorsChanged: boolean
  terrainFloorsChanged: boolean
  tileHeightChanged: boolean
  kindIsNew: boolean
}

/**
 * 计算 setCell 操作需要变更的内容（纯数据层）
 * 返回 { newCell, diff }
 */
export function computeCellUpdate(
  prev: CellState,
  opts: SetCellOptions,
): { newCell: CellState; diff: CellDiff } {
  let nextTerrain = opts.terrain || prev.terrain || 'grass'
  let nextKind = opts.kind !== undefined ? opts.kind : prev.kind

  // ---- 约束规则 ----
  // 桥强制 water
  if (nextKind === 'bridge') nextTerrain = 'water'
  // 作物强制 dirt
  else if (nextKind && CROP_KINDS.has(nextKind)) nextTerrain = 'dirt'
  // 房子不能放水上/路径/岩浆
  else if (nextKind === 'house' && (nextTerrain === 'water' || nextTerrain === 'path' || nextTerrain === 'lava')) {
    nextTerrain = 'grass'
  }
  // 水面只留特定物体
  else if ((nextTerrain === 'water' || nextTerrain === 'lava') && nextKind && !WATER_FLOAT_KINDS.has(nextKind)) {
    nextKind = null
  }

  const terrainChanged = prev.terrain !== nextTerrain
  const kindChanged = (prev.kind || null) !== nextKind

  const newFloors = opts.floors !== undefined
    ? Math.max(1, Math.min(MAX_FLOORS, opts.floors))
    : (kindChanged ? 1 : (prev.floors || 1))

  const floorsChanged = (prev.floors || 1) !== newFloors

  const newTerrainFloors = opts.terrainFloors !== undefined
    ? Math.max(1, Math.min(MAX_FLOORS, opts.terrainFloors))
    : terrainLevelForCell(prev)

  const terrainFloorsChanged = terrainLevelForCell(prev) !== newTerrainFloors

  const prevTileLevel = tileLevelForCell(prev)
  const nextTileLevel = tileLevelForCell({
    terrain: nextTerrain,
    terrainFloors: newTerrainFloors,
    kind: nextKind,
    floors: newFloors,
  })
  const tileHeightChanged = prevTileLevel !== nextTileLevel

  const kindIsNew = (prev.kind || null) !== nextKind

  const newRotationY = opts.rotationY !== undefined ? opts.rotationY : (kindIsNew ? 0 : (prev.rotationY || 0))
  const newOffsetX   = opts.offsetX   !== undefined ? opts.offsetX   : (kindIsNew ? 0 : (prev.offsetX   || 0))
  const newOffsetY   = opts.offsetY   !== undefined ? opts.offsetY   : (kindIsNew ? 0 : (prev.offsetY   || 0))
  const newOffsetZ   = opts.offsetZ   !== undefined ? opts.offsetZ   : (kindIsNew ? 0 : (prev.offsetZ   || 0))

  const carriedExtras = opts.extras !== undefined
    ? (opts.extras || [])
    : (prev.extras || [])

  const newCell: CellState = {
    terrain: nextTerrain,
    terrainFloors: newTerrainFloors,
    kind: nextKind,
    floors: newFloors,
    rotationY: newRotationY,
    offsetX: newOffsetX,
    offsetY: newOffsetY,
    offsetZ: newOffsetZ,
    extras: carriedExtras,
    userEdited: !!(prev.userEdited || opts.userEdited),
  }

  if (opts.dest !== undefined) newCell.dest = opts.dest
  if (opts.label !== undefined) newCell.label = opts.label

  const diff: CellDiff = {
    terrainChanged,
    kindChanged,
    floorsChanged,
    terrainFloorsChanged,
    tileHeightChanged,
    kindIsNew,
  }

  return { newCell, diff }
}

/** 格子位置 → 世界坐标 */
export function tilePos(cx: number, cz: number, grid: number): { x: number; z: number } {
  return {
    x: cx - (grid - 1) / 2,
    z: cz - (grid - 1) / 2,
  }
}

/** 世界坐标 → 格子位置 */
export function worldToCellCoord(v: number, grid: number): number {
  return Math.round(v + grid / 2 - 0.5)
}

/** 获取／创建格子 */
export function ensureCell(world: WorldGrid, x: number, z: number): CellState {
  if (!world[x]) world[x] = {}
  if (!world[x][z]) world[x][z] = defaultCell()
  return world[x][z]!
}

/** 检查是否作物格子 */
export function isCropKind(kind: ObjectKind): boolean {
  return !!kind && CROP_KINDS.has(kind)
}
