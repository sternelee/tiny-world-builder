/** 编辑器 MobX Store — 含 undo/redo */

import { observable, action, computed } from 'mobx'
import {
  WorldGrid, CellState, SetCellOptions, computeCellUpdate, ensureCell, defaultCell,
} from '../core/world-data'
import { TerrainType, ObjectKind, ToolDef, TOOLS } from '../core/constants'
import { CameraMode } from '../types/editor'

// ---- undo/redo ----
const HISTORY_LIMIT = 60

interface Snapshot {
  world: WorldGrid
  grid: number
  cells: Array<{ x: number; z: number; cell: CellState }>
}

export class EditorStore {
  @observable world: WorldGrid = {}
  @observable grid: number = 8
  @observable activeTool: ToolDef | null = null
  @observable cameraMode: CameraMode = 'perspective'
  @observable hoverCell: { x: number; z: number } | null = null
  @observable selectedCell: { x: number; z: number } | null = null
  @observable ready: boolean = false
  @observable canUndo: boolean = false
  @observable canRedo: boolean = false

  tools: ToolDef[] = TOOLS

  private undoStack: Snapshot[] = []
  private redoStack: Snapshot[] = []
  private historyMuted: boolean = false

  constructor() {}

  @computed get cellCount(): number { return this.grid * this.grid }

  getCell(x: number, z: number): CellState { return ensureCell(this.world, x, z) }

  // ---- snapshot (before mutation) ----
  private takeSnapshot() {
    const cells: Snapshot['cells'] = []
    for (const xKey of Object.keys(this.world)) {
      const x = parseInt(xKey, 10)
      const row = this.world[x]
      if (!row) continue
      for (const zKey of Object.keys(row)) {
        const z = parseInt(zKey, 10)
        const c = row[z]
        if (!c) continue
        cells.push({ x, z, cell: { ...c } })
      }
    }
    return { world: this.world, grid: this.grid, cells }
  }

  private pushUndo(snapshot: Snapshot) {
    this.undoStack.push(snapshot)
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift()
    this.redoStack = []
    this.canUndo = this.undoStack.length > 0
    this.canRedo = false
  }

  // ---- setCell — 唯一数据入口 ----
  @action setCell(x: number, z: number, opts: SetCellOptions) {
    if (!this.historyMuted) this.pushUndo(this.takeSnapshot())

    const prev = this.getCell(x, z)
    const { newCell } = computeCellUpdate(prev, opts)

    if (!this.world[x]) this.world[x] = {}
    this.world[x][z] = newCell
    this.world = { ...this.world }
  }

  // ---- 擦除 ----
  @action eraseCell(x: number, z: number) {
    this.setCell(x, z, { kind: null })
  }

  // ---- 地形升降 ----
  @action raiseTerrain(x: number, z: number) {
    const cell = this.getCell(x, z)
    const next = Math.min(8, (cell.terrainFloors || 1) + 1)
    this.setCell(x, z, { terrainFloors: next })
  }

  @action lowerTerrain(x: number, z: number) {
    const cell = this.getCell(x, z)
    const next = Math.max(1, (cell.terrainFloors || 1) - 1)
    this.setCell(x, z, { terrainFloors: next })
  }

  // ---- undo/redo ----
  @action undo() {
    if (this.undoStack.length === 0) return
    this.redoStack.push(this.takeSnapshot())
    const snap = this.undoStack.pop()!
    this.applySnapshot(snap)
    this.canUndo = this.undoStack.length > 0
    this.canRedo = this.redoStack.length > 0
  }

  @action redo() {
    if (this.redoStack.length === 0) return
    this.undoStack.push(this.takeSnapshot())
    const snap = this.redoStack.pop()!
    this.applySnapshot(snap)
    this.canUndo = this.undoStack.length > 0
    this.canRedo = this.redoStack.length > 0
  }

  private applySnapshot(snap: Snapshot) {
    this.historyMuted = true
    const newWorld: WorldGrid = {}
    for (const { x, z, cell } of snap.cells) {
      if (!newWorld[x]) newWorld[x] = {}
      newWorld[x][z] = { ...cell }
    }
    this.world = newWorld
    this.grid = snap.grid
    this.historyMuted = false
    this.canUndo = this.undoStack.length > 0
    this.canRedo = this.redoStack.length > 0
  }

  // ---- 工具 ----
  @action setActiveTool(tool: ToolDef | null) { this.activeTool = tool }
  @action setCameraMode(mode: CameraMode) { this.cameraMode = mode }
  @action setHoverCell(cell: { x: number; z: number } | null) { this.hoverCell = cell }
  @action setSelectedCell(cell: { x: number; z: number } | null) { this.selectedCell = cell }
  @action setGrid(n: number) { this.grid = n }

  @action resetWorld() {
    this.world = {}
    this.grid = 8
    this.undoStack = []
    this.redoStack = []
    this.canUndo = false
    this.canRedo = false
    this.ready = true
  }

  @action clearWorld() {
    if (!this.historyMuted) this.pushUndo(this.takeSnapshot())
    this.world = {}
    this.ready = true
  }
}

export default EditorStore
