/** 编辑器 MobX Store — 纯数据层封装 */

import { observable, action, computed } from 'mobx'
import {
  WorldGrid, CellState, SetCellOptions, computeCellUpdate, ensureCell, defaultCell,
} from '../core/world-data'
import { TerrainType, ObjectKind, ToolDef, TOOLS } from '../core/constants'
import { CameraMode } from '../types/editor'

export class EditorStore {
  @observable world: WorldGrid = {}
  @observable grid: number = 8
  @observable activeTool: ToolDef | null = null
  @observable cameraMode: CameraMode = 'perspective'
  @observable hoverCell: { x: number; z: number } | null = null
  @observable selectedCell: { x: number; z: number } | null = null
  @observable ready: boolean = false
  @observable tools: ToolDef[] = TOOLS

  constructor() {}

  @computed get cellCount(): number {
    return this.grid * this.grid
  }

  /** 获取格子，自动创建默认值 */
  getCell(x: number, z: number): CellState {
    return ensureCell(this.world, x, z)
  }

  /** setCell — 唯一数据修改入口 */
  @action setCell(x: number, z: number, opts: SetCellOptions) {
    const prev = this.getCell(x, z)
    const { newCell } = computeCellUpdate(prev, opts)

    if (!this.world[x]) this.world[x] = {}
    this.world[x][z] = newCell

    // 触发 MobX 观察者
    this.world = { ...this.world }
  }

  @action setActiveTool(tool: ToolDef | null) { this.activeTool = tool }
  @action setCameraMode(mode: CameraMode) { this.cameraMode = mode }
  @action setHoverCell(cell: { x: number; z: number } | null) { this.hoverCell = cell }
  @action setSelectedCell(cell: { x: number; z: number } | null) { this.selectedCell = cell }
  @action setGrid(n: number) { this.grid = n }

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

export default EditorStore
