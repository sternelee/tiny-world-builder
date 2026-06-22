// -------- 世界持久化：保存/加载/导出/导入 --------

import { EditorStore } from '../store/editorStore'
import { CellState, WorldGrid } from '../core/world-data'
import { twStorage } from './PlatformAdapter'

const STORAGE_PREFIX = 'tinyworld:worlds.v1'
const ACTIVE_SLOT_KEY = 'tinyworld:activeSlot'

export interface WorldSaveData {
  v: number
  grid: number
  cells: Array<{ x: number; z: number; cell: CellState }>
}

// ======== 序列化 ========

function serializeStore(store: EditorStore): WorldSaveData {
  const cells: WorldSaveData['cells'] = []
  for (const xKey of Object.keys(store.world)) {
    const x = parseInt(xKey)
    const row = store.world[x]
    if (!row) continue
    for (const zKey of Object.keys(row)) {
      const z = parseInt(zKey)
      const c = row[z]
      if (!c) continue
      cells.push({ x, z, cell: { ...c } })
    }
  }
  return { v: 1, grid: store.grid, cells }
}

function deserializeStore(store: EditorStore, data: WorldSaveData) {
  const newWorld: WorldGrid = {}
  for (const { x, z, cell } of data.cells) {
    if (!newWorld[x]) newWorld[x] = {}
    newWorld[x][z] = { ...cell }
  }
  store.world = newWorld
  if (data.grid) store.grid = data.grid
}

// ======== wx 存储（多槽位） ========

const SLOT_NAMES = ['Default', 'World 1', 'World 2', 'World 3', 'World 4']

export function getSlotNames(): string[] { return SLOT_NAMES }

export function getActiveSlot(): number {
  return twStorage.get<number>(ACTIVE_SLOT_KEY) ?? 0
}

export function setActiveSlot(idx: number) {
  twStorage.set(ACTIVE_SLOT_KEY, idx)
}

export function saveWorld(store: EditorStore, slot?: number) {
  const idx = slot ?? getActiveSlot()
  const data = serializeStore(store)
  twStorage.setJSON(`${STORAGE_PREFIX}.slot.${idx}`, data)
  setActiveSlot(idx)
  return idx
}

export function loadWorld(store: EditorStore, slot?: number): boolean {
  const idx = slot ?? getActiveSlot()
  const data = twStorage.getJSON<WorldSaveData>(`${STORAGE_PREFIX}.slot.${idx}`)
  if (!data) return false
  deserializeStore(store, data)
  setActiveSlot(idx)
  return true
}

export function hasSavedWorld(slot?: number): boolean {
  return twStorage.getJSON<WorldSaveData>(`${STORAGE_PREFIX}.slot.${slot ?? getActiveSlot()}`) !== null
}

export function deleteWorld(slot?: number) {
  const idx = slot ?? getActiveSlot()
  twStorage.remove(`${STORAGE_PREFIX}.slot.${idx}`)
}

// ======== JSON 导出 ========

export function exportWorldToJSON(store: EditorStore): string {
  return JSON.stringify(serializeStore(store), null, 2)
}

export function importWorldFromJSON(store: EditorStore, json: string): boolean {
  try {
    const data = JSON.parse(json) as WorldSaveData
    if (!data || !Array.isArray(data.cells)) return false
    deserializeStore(store, data)
    return true
  } catch { return false }
}

// ======== wx 文件系统导出 ========

export async function exportWorldToFile(store: EditorStore): Promise<string> {
  const json = exportWorldToJSON(store)
  const fs = wx.getFileSystemManager()
  const now = Date.now()
  const path = `${wx.env.USER_DATA_PATH}/tinyworld_${now}.json`
  fs.writeFileSync(path, json, 'utf8')
  return path
}

export async function importWorldFromFile(store: EditorStore): Promise<boolean> {
  return new Promise((resolve) => {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['json'],
      success: (res) => {
        const file = res.tempFiles[0]
        const fs = wx.getFileSystemManager()
        const content = fs.readFileSync(file.path, 'utf8')
        resolve(importWorldFromJSON(store, content as string))
      },
      fail: () => resolve(false),
    })
  })
}
