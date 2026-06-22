// -------- Tiny World Builder 类型定义 (WeChat Mini Program 版) --------

/** 地形类型 */
export type TerrainType =
  | 'grass' | 'dirt' | 'path' | 'water' | 'stone'
  | 'sand' | 'snow' | 'lava'

/** 物体类型 */
export type ObjectKind =
  | 'house' | 'tree' | 'fence' | 'rock' | 'bridge'
  | 'crop' | 'corn' | 'wheat' | 'pumpkin' | 'carrot' | 'sunflower'
  | 'tuft' | 'flower' | 'bush'
  | 'cow' | 'sheep'
  | null

/** 单个格子数据 */
export interface CellData {
  terrain: TerrainType
  kind: ObjectKind
  floors?: number          // 楼层高度
  terrainFloors?: number   // 地形隆起高度
  extras?: ExtraObject[]
  [key: string]: any
}

/** 附加物体 */
export interface ExtraObject {
  kind: string
  [key: string]: any
}

/** 世界数据 world[x][z] */
export type WorldData = Record<number, Record<number, CellData | undefined>>

/** setCell 选项 */
export interface SetCellOptions {
  terrain?: TerrainType
  kind?: ObjectKind
  floors?: number
  terrainFloors?: number
  forceTile?: boolean
  silent?: boolean
}

/** 工具定义 */
export interface ToolDef {
  id: string
  label: string
  kind: ObjectKind | null
  terrain: TerrainType | null
  color?: number
  group?: string
}

/** 相机模式 */
export type CameraMode = 'perspective' | 'isometric' | 'soft'

/** 编辑器状态 */
export interface EditorState {
  grid: number
  activeTool: ToolDef | null
  cameraMode: CameraMode
  hoverCell: { x: number; z: number } | null
  selectedCell: { x: number; z: number } | null
}
