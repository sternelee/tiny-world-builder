import { observable, action, computed } from 'mobx'
import { CellData, ToolDef, CameraMode, ObjectKind, WorldData, SetCellOptions } from '../types/editor'

/** 默认草地格子 */
function defaultCell(): CellData {
  return { terrain: 'grass', kind: null, floors: 1, terrainFloors: 1 }
}

/** 编辑器 MobX Store — 核心状态 (MobX 4 decorator 模式) */
export class EditorStore {
  @observable world: WorldData = {}
  @observable grid: number = 8
  @observable activeTool: ToolDef | null = null
  @observable cameraMode: CameraMode = 'perspective'
  @observable hoverCell: { x: number; z: number } | null = null
  @observable selectedCell: { x: number; z: number } | null = null
  @observable ready: boolean = false

  constructor() {}

  // ---- computed ----
  @computed get cellCount(): number {
    return this.grid * this.grid
  }

  // ---- 获取格子（自动创建默认草） ----
  getCell(x: number, z: number): CellData {
    if (!this.world[x]) this.world[x] = {}
    if (!this.world[x][z]) this.world[x][z] = defaultCell()
    return this.world[x][z]!
  }

  // ---- setCell — 唯一数据修改入口 ----
  @action setCell(x: number, z: number, opts: SetCellOptions) {
    const cell = this.getCell(x, z)

    if (opts.terrain !== undefined) cell.terrain = opts.terrain
    if (opts.kind !== undefined) cell.kind = opts.kind
    if (opts.floors !== undefined) cell.floors = Math.max(1, Math.min(8, opts.floors))
    if (opts.terrainFloors !== undefined) cell.terrainFloors = Math.max(1, Math.min(8, opts.terrainFloors))

    // 作物强制 dirt 地形
    if (cell.kind && CROP_KINDS.has(cell.kind)) {
      cell.terrain = 'dirt'
    }

    // 桥强制 water + 升高
    if (cell.kind === 'bridge') {
      cell.terrain = 'water'
      cell.terrainFloors = 2
    }

    // 触发重渲染（通过观察者）
    this.world = { ...this.world }
  }

  // ---- 工具 ----
  @action setActiveTool(tool: ToolDef | null) {
    this.activeTool = tool
  }

  @action setCameraMode(mode: CameraMode) {
    this.cameraMode = mode
  }

  @action setHoverCell(cell: { x: number; z: number } | null) {
    this.hoverCell = cell
  }

  @action setSelectedCell(cell: { x: number; z: number } | null) {
    this.selectedCell = cell
  }

  // ---- 清空/重置 ----
  @action resetWorld() {
    this.world = {}
    this.grid = 8
    this.ready = true
  }

  @action clearWorld() {
    this.world = {}
    this.ready = true
  }
}

/** 作物种类集合 */
const CROP_KINDS = new Set<ObjectKind>(['crop', 'corn', 'wheat', 'pumpkin', 'carrot', 'sunflower'])

export default EditorStore
