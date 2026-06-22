// -------- 2D 俯视小地图 --------

import { Component, PropsWithChildren } from 'react'
import { CoverView, Canvas } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { inject, observer } from 'mobx-react'
import { EditorStore } from '../store/editorStore'
import { ensureCell } from '../core/world-data'

const MAP_SIZE = 100 // px
const TERRAIN_COLORS: Record<string, string> = {
  grass: '#6f9e30', dirt: '#462b15', path: '#f2d29c',
  water: '#3a8fcc', stone: '#8f8a82', lava: '#e7592b',
  sand: '#e6cc7c', snow: '#f2f5fa',
}
const OBJECT_COLORS: Record<string, string> = {
  house: '#c49a6c', tree: '#2d6a1e', fence: '#8b7042',
  rock: '#9b9a8f', bridge: '#8b5a32',
}

type PageProps = PropsWithChildren & {
  store?: { editorStore: EditorStore }
}

@inject('store')
@observer
class Minimap extends Component<PageProps> {
  private canvas: any = null

  componentDidMount() {
    setTimeout(() => this.draw(), 100)
  }

  componentDidUpdate() {
    this.draw()
  }

  private async draw() {
    const { editorStore } = this.props.store!
    const grid = editorStore.grid
    const cellSize = MAP_SIZE / grid

    // 获取 canvas 节点
    let node: any
    try {
      const res = await new Promise<any>((resolve) => {
        const query = Taro.createSelectorQuery()
        query.select('#minimap-canvas').node((r: any) => resolve(r)).exec()
      })
      node = res?.node
    } catch { return }
    if (!node) return

    const ctx = node.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE)

    // 背景
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE)

    // 绘制每个格子
    for (let x = 0; x < grid; x++) {
      for (let z = 0; z < grid; z++) {
        const cell = ensureCell(editorStore.world, x, z)
        const px = x * cellSize
        const py = z * cellSize

        // 地形色
        ctx.fillStyle = TERRAIN_COLORS[cell.terrain] || '#666'
        ctx.fillRect(px, py, cellSize, cellSize)

        // 物体标记
        if (cell.kind) {
          ctx.fillStyle = OBJECT_COLORS[cell.kind] || '#fff'
          const margin = cellSize * 0.2
          ctx.fillRect(px + margin, py + margin, cellSize - margin * 2, cellSize - margin * 2)
        }

        // 边框
        ctx.strokeStyle = 'rgba(255,255,255,0.08)'
        ctx.lineWidth = 0.5
        ctx.strokeRect(px, py, cellSize, cellSize)
      }
    }

    // 选中格高亮
    if (editorStore.selectedCell) {
      const { x: sx, z: sz } = editorStore.selectedCell
      ctx.strokeStyle = '#3a72c8'
      ctx.lineWidth = 2
      ctx.strokeRect(sx * cellSize, sz * cellSize, cellSize, cellSize)
    }
  }

  render() {
    return (
      <CoverView className='minimap-wrap'>
        <Canvas
          type='2d'
          id='minimap-canvas'
          className='minimap-canvas'
          style={`width:${MAP_SIZE}px;height:${MAP_SIZE}px`}
        />
      </CoverView>
    )
  }
}

export default Minimap
