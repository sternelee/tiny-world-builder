/**
 * 编辑器页面 — 完整管线：Canvas → Three.js → Raycaster → ToolBar
 */
import { Component, PropsWithChildren } from 'react'
import { Canvas, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { inject, observer } from 'mobx-react'

import { EditorStore } from '../../store/editorStore'
import { SceneManager } from '../../three/SceneManager'
import { makeTile, makeObject, tileLevelForCell } from '../../three/TileRenderer'
import { raycastCell } from '../../three/Raycaster'
import { getWindowInfo } from '../../services/PlatformAdapter'
import Toolbar from '../../components/Toolbar'

import * as THREE from 'three'

import './index.scss'
import { ensureCell } from '../../core/world-data'

type PageProps = PropsWithChildren & {
  store?: { editorStore: EditorStore }
}

interface EditorState {
  status: 'loading' | 'ready' | 'error'
  errorMsg: string | null
}

@inject('store')
@observer
class EditorPage extends Component<PageProps, EditorState> {
  private sceneManager = new SceneManager()
  private canvas: any = null
  private win = { width: 375, height: 667, dpr: 2 }

  /** 格子到世界坐标 */
  private cellToWorld(cx: number, cz: number) {
    const g = this.props.store!.editorStore.grid
    return {
      x: cx - (g - 1) / 2,
      z: cz - (g - 1) / 2,
    }
  }

  /** 重建每个格子的 tile mesh */
  private rebuildScene() {
    const { editorStore } = this.props.store!
    const grid = editorStore.grid
    const scene = this.sceneManager.scene3D
    if (!scene) return

    // 清除旧 tile
    const oldTileRoot = scene.getObjectByName('tileRoot')
    if (oldTileRoot) scene.remove(oldTileRoot)

    const tileRoot = new THREE.Group()
    tileRoot.name = 'tileRoot'

    for (let x = 0; x < grid; x++) {
      for (let z = 0; z < grid; z++) {
        const cell = ensureCell(editorStore.world, x, z)
        const wpos = this.cellToWorld(x, z)

        // 地形瓦片
        const level = tileLevelForCell(cell)
        const tile = makeTile(cell.terrain, level)
        tile.position.set(wpos.x, 0, wpos.z)
        tile.userData = { cellX: x, cellZ: z }
        tileRoot.add(tile)

        // 物体
        if (cell.kind) {
          const obj = makeObject(cell.kind, cell)
          if (obj) {
            obj.position.set(wpos.x, 0, wpos.z)
            obj.userData = { cellX: x, cellZ: z, kind: cell.kind }
            tileRoot.add(obj)
          }
        }
      }
    }

    scene.add(tileRoot)
    this.placeCamera(grid)
  }

  private placeCamera(grid: number) {
    const cam = this.sceneManager.camera3D
    if (!cam) return
    const s = grid * 0.6
    cam.position.set(s * 0.8, s * 0.6, s * 0.8)
    cam.lookAt(0, 0, 0)
  }

  state: EditorState = { status: 'loading', errorMsg: null }

  componentDidMount() {
    Taro.nextTick(() => this.init())
  }

  componentWillUnmount() {
    this.sceneManager.dispose()
  }

  private async init() {
    try {
      const canvas = await this.getCanvasNode()
      if (!canvas) {
        this.setState({ status: 'error', errorMsg: 'Canvas 获取失败' })
        return
      }
      this.canvas = canvas
      this.win = getWindowInfo()

      await this.sceneManager.init(canvas, this.win.width, this.win.height, this.win.dpr)
      this.sceneManager.start()

      const { editorStore } = this.props.store!
      editorStore.ready = true

      this.rebuildScene()
      this.setState({ status: 'ready' })

    } catch (err: any) {
      console.error('[editor] init error:', err)
      this.setState({ status: 'error', errorMsg: err?.message || String(err) })
    }
  }

  private getCanvasNode(): Promise<any> {
    return new Promise((resolve, reject) => {
      const query = Taro.createSelectorQuery()
      query
        .select('#editor-canvas')
        .node((res: any) => {
          if (res?.node) resolve(res.node)
          else reject(new Error('Canvas node null'))
        })
        .exec()
    })
  }

  // ---- Touch 交互 ----
  private touchStart = { x: 0, y: 0, time: 0 }
  private touchMoved = false

  private onTouchStart = (e: any) => {
    const t = e.touches?.[0]
    if (t) {
      this.touchStart = { x: t.x || t.clientX || 0, y: t.y || t.clientY || 0, time: Date.now() }
      this.touchMoved = false
    }
  }

  private onTouchMove = (e: any) => {
    this.touchMoved = true
    // 单指旋转
    const t = e.touches?.[0]
    if (!t || e.touches.length > 1) return
    const cam = this.sceneManager.camera3D
    if (!cam) return
    const x = t.x || t.clientX || 0
    const y = t.y || t.clientY || 0
    const dx = x - this.touchStart.x
    const dy = y - this.touchStart.y
    this.touchStart = { x, y, time: Date.now() }

    // 简单 orbit：绕 Y 轴旋转
    cam.position.x += dx * 0.008
    cam.position.z += dy * 0.008
    cam.lookAt(0, 0, 0)
  }

  private onTouchEnd = (e: any) => {
    if (this.touchMoved) return
    // 点击 → 放置/选择
    const t = e.changedTouches?.[0]
    if (!t) return
    const x = t.x || t.clientX || 0
    const y = t.y || t.clientY || 0

    const { editorStore } = this.props.store!
    const cam = this.sceneManager.camera3D
    const scene = this.sceneManager.scene3D
    if (!cam || !scene) return

    const hit = raycastCell(cam, x, y, this.win.width, this.win.height, scene, editorStore.grid)
    if (!hit) return

    const { x: cx, z: cz } = hit
    const tool = editorStore.activeTool
    if (!tool) return

    // 放置
    editorStore.setCell(cx, cz, {
      terrain: tool.terrain || undefined,
      kind: tool.kind,
    })
    this.rebuildScene()
  }

  render() {
    const { status, errorMsg } = this.state

    return (
      <View className='editor-container'>
        <Canvas
          type='webgl'
          id='editor-canvas'
          className='editor-canvas'
          onTouchStart={this.onTouchStart}
          onTouchMove={this.onTouchMove}
          onTouchEnd={this.onTouchEnd}
          disableScroll
        />

        {status === 'loading' && (
          <View className='editor-loading'>Loading...</View>
        )}

        {status === 'error' && (
          <View className='editor-error'>{errorMsg}</View>
        )}

        {status === 'ready' && (
          <Toolbar />
        )}
      </View>
    )
  }
}

export default EditorPage
