// -------- 预设世界数据 (从浏览器引擎 loadInitialScene 提取) --------

import { EditorStore } from '../store/editorStore'

export interface PresetCell {
  terrain: string
  kind: string | null
  floors?: number
  buildingType?: string
  fenceSide?: string
}

export type PresetLayout = Record<string, PresetCell>

/** 默认村庄 — 河流 + 桥 + 小屋 + 农场 + 围栏 */
export const VILLAGE_PRESET: PresetLayout = {
  // River across row 2
  '0,2': { terrain: 'water', kind: null },
  '1,2': { terrain: 'water', kind: null },
  '2,2': { terrain: 'water', kind: null },
  '3,2': { terrain: 'water', kind: 'bridge', floors: 1 },
  '4,2': { terrain: 'water', kind: null },
  '5,2': { terrain: 'water', kind: null },
  '6,2': { terrain: 'water', kind: null },
  '7,2': { terrain: 'water', kind: null },

  // Road down column 3 + across row 5
  '3,0': { terrain: 'path', kind: null },
  '3,1': { terrain: 'path', kind: null },
  '3,3': { terrain: 'path', kind: null },
  '3,4': { terrain: 'path', kind: null },
  '3,5': { terrain: 'path', kind: null },
  '3,6': { terrain: 'path', kind: null },
  '3,7': { terrain: 'path', kind: null },
  '1,5': { terrain: 'path', kind: null },
  '2,5': { terrain: 'path', kind: null },
  '4,5': { terrain: 'path', kind: null },
  '5,5': { terrain: 'path', kind: null },
  '6,5': { terrain: 'path', kind: null },

  // Houses (left cluster + manor + tower)
  '1,4': { terrain: 'grass', kind: 'house' },
  '2,4': { terrain: 'grass', kind: 'house' },
  '5,4': { terrain: 'grass', kind: 'house', buildingType: 'manor', floors: 2 },
  '6,3': { terrain: 'grass', kind: 'house', buildingType: 'tower', floors: 3 },

  // Fence corner (bottom-left)
  '0,0': { terrain: 'grass', kind: 'house', floors: 2 },
  '0,1': { terrain: 'grass', kind: 'fence' },
  '1,0': { terrain: 'grass', kind: 'fence' },
  '1,1': { terrain: 'grass', kind: 'fence' },

  // Farm plots (top-right)
  '5,6': { terrain: 'dirt', kind: 'wheat' },
  '6,6': { terrain: 'dirt', kind: 'corn' },
  '7,6': { terrain: 'dirt', kind: 'sunflower' },
  '5,7': { terrain: 'dirt', kind: 'carrot' },
  '6,7': { terrain: 'dirt', kind: 'pumpkin' },
  '7,7': { terrain: 'dirt', kind: 'crop' },

  // Trees & rocks (decorative)
  '0,6': { terrain: 'grass', kind: 'tree' },
  '1,7': { terrain: 'grass', kind: 'tree' },
  '5,0': { terrain: 'grass', kind: 'rock' },
  '5,1': { terrain: 'grass', kind: 'tree' },
  '6,1': { terrain: 'grass', kind: 'tree' },
  '7,0': { terrain: 'grass', kind: 'rock', floors: 3 },
  '7,1': { terrain: 'grass', kind: 'tree', floors: 2 },
  '6,0': { terrain: 'grass', kind: 'rock', floors: 2 },

  // Tufts
  '0,3': { terrain: 'grass', kind: 'tuft' },
  '4,1': { terrain: 'grass', kind: 'tuft' },
  '7,3': { terrain: 'grass', kind: 'tuft' },
}

/** 把预设布局应用到 store */
export function applyPreset(store: EditorStore, layout: PresetLayout = VILLAGE_PRESET) {
  store.clearWorld()
  store.setGrid(8)

  for (const [key, cell] of Object.entries(layout)) {
    const [x, z] = key.split(',').map(Number)
    let terrain = cell.terrain || 'grass'
    let kind = cell.kind || null

    // Bridge forces water
    if (kind === 'bridge') terrain = 'water'
    // Crops force dirt
    else if (kind && ['crop', 'corn', 'wheat', 'pumpkin', 'carrot', 'sunflower'].includes(kind)) terrain = 'dirt'
    // Water can't hold most objects
    else if (terrain === 'water') kind = null

    store.setCell(x, z, {
      terrain: terrain as any,
      kind: kind as any,
      floors: cell.floors,
    })
  }
}
