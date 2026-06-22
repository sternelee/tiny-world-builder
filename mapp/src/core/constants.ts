// -------- 常量定义 — 从浏览器版引擎提取 --------

/** 有效网格尺寸 */
export const HOME_GRID_DEFAULT = 8
export const HOME_GRID_MIN = 8
export const HOME_GRID_MAX = 20
export const HOME_GRID_OPTIONS = [8, 10, 12, 16, 20]
export const HOME_GRID_OPTION_SET = new Set(HOME_GRID_OPTIONS)

/** 最大楼层数 */
export const MAX_FLOORS = 8

/** 作物种类 */
export const CROP_KINDS = new Set([
  'crop', 'corn', 'wheat', 'pumpkin', 'carrot', 'sunflower',
])

/** 地形类型列表 */
export const TERRAIN_TYPES = [
  'grass', 'dirt', 'path', 'water', 'stone', 'lava', 'sand', 'snow',
] as const

export type TerrainType = typeof TERRAIN_TYPES[number]

/** 物体种类列表 */
export const OBJECT_KINDS = [
  'house', 'tree', 'fence', 'rock', 'bridge',
  'crop', 'corn', 'wheat', 'pumpkin', 'carrot', 'sunflower',
  'tuft', 'flower', 'bush', 'cow', 'sheep',
] as const

export type ObjectKind = typeof OBJECT_KINDS[number] | null

/** 工具定义 */
export interface ToolDef {
  id: string
  label: string
  kind: ObjectKind | null
  terrain: TerrainType | null
  color?: number
  group?: string
  terrainOverride?: string
}

/** 默认地形映射（物体→强制地形） */
export const OBJECT_TERRAIN_OVERRIDES: Record<string, TerrainType> = {
  crop: 'dirt',
  corn: 'dirt',
  wheat: 'dirt',
  pumpkin: 'dirt',
  carrot: 'dirt',
  sunflower: 'dirt',
}

/** 水面漂浮物（允许放水上） */
export const WATER_FLOAT_KINDS = new Set([
  'house', 'rock', 'bridge', 'ripple', 'bridge-rail',
  'voxel-build', 'model-stamp',
])

/** 工具列表（从 browser engine 19-tools-toolbar.js 提取） */
export const TOOLS: ToolDef[] = [
  // ---- Terrain ----
  { id: 'grass', label: 'Grass', kind: null, terrain: 'grass', group: 'terrain' },
  { id: 'path', label: 'Path', kind: null, terrain: 'path', group: 'terrain' },
  { id: 'dirt', label: 'Dirt', kind: null, terrain: 'dirt', group: 'terrain' },
  { id: 'water', label: 'Water', kind: null, terrain: 'water', group: 'terrain' },
  { id: 'stone', label: 'Stone', kind: null, terrain: 'stone', group: 'terrain' },
  { id: 'lava', label: 'Lava', kind: null, terrain: 'lava', group: 'terrain' },
  { id: 'sand', label: 'Sand', kind: null, terrain: 'sand', group: 'terrain' },
  { id: 'snow', label: 'Snow', kind: null, terrain: 'snow', group: 'terrain' },
  // ---- Objects ----
  { id: 'house', label: 'House', kind: 'house', terrain: null, group: 'objects' },
  { id: 'tree', label: 'Tree', kind: 'tree', terrain: null, group: 'objects' },
  { id: 'fence', label: 'Fence', kind: 'fence', terrain: null, group: 'objects' },
  { id: 'rock', label: 'Rock', kind: 'rock', terrain: null, group: 'objects' },
  { id: 'bridge', label: 'Bridge', kind: 'bridge', terrain: null, group: 'objects' },
  // ---- Crops ----
  { id: 'crop', label: 'Crop', kind: 'crop', terrain: null, group: 'crops', terrainOverride: 'dirt' },
  { id: 'corn', label: 'Corn', kind: 'corn', terrain: null, group: 'crops', terrainOverride: 'dirt' },
  { id: 'wheat', label: 'Wheat', kind: 'wheat', terrain: null, group: 'crops', terrainOverride: 'dirt' },
  { id: 'pumpkin', label: 'Pumpkin', kind: 'pumpkin', terrain: null, group: 'crops', terrainOverride: 'dirt' },
  { id: 'carrot', label: 'Carrot', kind: 'carrot', terrain: null, group: 'crops', terrainOverride: 'dirt' },
  { id: 'sunflower', label: 'Sunflower', kind: 'sunflower', terrain: null, group: 'crops', terrainOverride: 'dirt' },
  // ---- Plants ----
  { id: 'tuft', label: 'Tuft', kind: 'tuft', terrain: null, group: 'plants' },
  { id: 'flower', label: 'Flower', kind: 'flower', terrain: null, group: 'plants' },
  { id: 'bush', label: 'Bush', kind: 'bush', terrain: null, group: 'plants' },
  // ---- Animals ----
  { id: 'cow', label: 'Cow', kind: 'cow', terrain: null, group: 'animals' },
  { id: 'sheep', label: 'Sheep', kind: 'sheep', terrain: null, group: 'animals' },
]

/** 获取工具 by id */
export function getTool(id: string): ToolDef | undefined {
  return TOOLS.find(t => t.id === id)
}

/** 获取工具分类 */
export function getToolGroups(): Record<string, ToolDef[]> {
  const groups: Record<string, ToolDef[]> = {}
  for (const t of TOOLS) {
    const g = t.group || 'other'
    if (!groups[g]) groups[g] = []
    groups[g].push(t)
  }
  return groups
}
