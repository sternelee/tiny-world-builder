// -------- 2D 俯视小地图（跟 Tiny World Builder 浏览器版对齐）--------

import { Component, PropsWithChildren } from 'react'
import { Canvas } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { inject, observer } from 'mobx-react'
import { EditorStore } from '../store/editorStore'
import { ensureCell } from '../core/world-data'

const MAP_SIZE = 84 // px
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
  private node: any = null
  private ctx: any = null
  private dpr = 2

  componentDidMount() {
    setTimeout(() => this.acquireNode().then(() => this.draw()), 100)
  }

  componentDidUpdate() {
    this.draw()
  }

  private async acquireNode() {
    if (this.node) return
    return new Promise<void>((resolve) => {
      Taro.createSelectorQuery()
        .select('#minimap-canvas')
        .node((res: any) => {
          if (res?.node) {
            this.node = res.node
            this.ctx = res.node.getContext('2d')
            try { this.dpr = Taro.getDeviceInfo?.()?.pixelRatio || 2 } catch {}
            this.node.width = MAP_SIZE * this.dpr
            this.node.height = MAP_SIZE * this.dpr
            this.ctx?.scale(this.dpr, this.dpr)
          }
          resolve()
        })
        .exec()
    })
  }

  private async draw() {
    if (!this.ctx) await this.acquireNode()
    if (!this.ctx) return

    const { editorStore } = this.props.store!
    const grid = editorStore.grid
    const cellSize = MAP_SIZE / grid
    const ctx = this.ctx

    ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE)
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE)

    for (let x = 0; x < grid; x++) {
      for (let z = 0; z < grid; z++) {
        const cell = ensureCell(editorStore.world, x, z)
        const px = x * cellSize
        const py = z * cellSize

        // 地形色
        ctx.fillStyle = TERRAIN_COLORS[cell.terrain] || '#666'
        ctx.fillRect(px, py, cellSize, cellSize)

        // 物体标记
        if (cell.kind && OBJECT_COLORS[cell.kind]) {
          ctx.fillStyle = OBJECT_COLORS[cell.kind]
          const margin = cellSize * 0.25
          ctx.fillRect(px + margin, py + margin, cellSize - margin * 2, cellSize - margin * 2)
        }
      }
    }

    // 选中格高亮
    if (editorStore.selectedCell) {
      const { x: sx, z: sz } = editorStore.selectedCell
      ctx.strokeStyle = '#3a72c8'
      ctx.lineWidth = 1.5
      ctx.strokeRect(sx * cellSize + 0.75, sz * cellSize + 0.75, cellSize - 1.5, cellSize - 1.5)
    }
  }

  render() {
    return (
      <Canvas
        type='2d'
        id='minimap-canvas'
        className='minimap-wrap'
        style={`width:${MAP_SIZE}px;height:${MAP_SIZE}px`}
      />
    )
  }
}

export default Minimap
