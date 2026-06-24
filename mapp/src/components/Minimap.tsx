// -------- 2D 俯视小地图 — View 方块（无 canvas）--------

import { Component, PropsWithChildren } from 'react'
import { View } from '@tarojs/components'
import { inject, observer } from 'mobx-react'
import { EditorStore } from '../store/editorStore'
import { ensureCell } from '../core/world-data'

const TERRAIN_COLORS: Record<string, string> = {
  grass: '#6f9e30', dirt: '#462b15', path: '#f2d29c',
  water: '#3a8fcc', stone: '#8f8a82', lava: '#e7592b',
  sand: '#e6cc7c', snow: '#f2f5fa',
}
const OBJECT_DOT: Record<string, string> = {
  house: '#c49a6c', tree: '#2d6a1e', fence: '#8b7042',
  rock: '#9b9a8f', bridge: '#8b5a32',
}

type PageProps = PropsWithChildren & {
  store?: { editorStore: EditorStore }
}

@inject('store')
@observer
class Minimap extends Component<PageProps> {
  render() {
    const { editorStore } = this.props.store!
    const grid = editorStore.grid
    const cellPct = 100 / grid

    const cells: any[] = []
    for (let z = 0; z < grid; z++) {
      for (let x = 0; x < grid; x++) {
        const c = ensureCell(editorStore.world, x, z)
        const isSel = editorStore.selectedCell?.x === x && editorStore.selectedCell?.z === z
        const bg = TERRAIN_COLORS[c.terrain] || '#666'
        const style = `left:${x * cellPct}%;top:${z * cellPct}%;width:${cellPct}%;height:${cellPct}%;background:${bg};${isSel ? 'box-shadow:inset 0 0 0 1.5px #3a72c8;' : ''}`
        cells.push(<View key={`${x},${z}`} className='mm-cell' style={style} />)
        if (c.kind && OBJECT_DOT[c.kind]) {
          const dotStyle = `left:${x * cellPct + cellPct * 0.3}%;top:${z * cellPct + cellPct * 0.3}%;width:${cellPct * 0.4}%;height:${cellPct * 0.4}%;background:${OBJECT_DOT[c.kind]};`
          cells.push(<View key={`d-${x},${z}`} className='mm-dot' style={dotStyle} />)
        }
      }
    }

    return (
      <View className='minimap-wrap'>
        {cells}
      </View>
    )
  }
}

export default Minimap
