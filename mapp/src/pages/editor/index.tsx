/**
 * 编辑器页面 — 完整管线
 */
import { Component, PropsWithChildren } from 'react'
import { Canvas, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { inject, observer } from 'mobx-react'
import * as THREE from 'three'

import { EditorStore } from '../../store/editorStore'
import { SceneManager } from '../../three/SceneManager'
import { makeTile, makeObject, CellNeighbors, tileLevelForCell } from '../../three/TileRenderer'
import { raycastCell } from '../../three/Raycaster'
import { getWindowInfo } from '../../services/PlatformAdapter'
import Toolbar from '../../components/Toolbar'
import EditorHUD from '../../components/EditorHUD'
import Minimap from '../../components/Minimap'

import './index.scss'
import { ensureCell } from '../../core/world-data'
import { applyPreset } from '../../core/presets'
import { saveWorld, loadWorld, exportWorldToFile, importWorldFromFile } from '../../services/WorldPersistence'

type PageProps = PropsWithChildren & {
  store?: { editorStore: EditorStore }
}

interface EditorState {
  status: 'loading' | 'ready' | 'error'
  errorMsg: string | null
  toolbarVisible: boolean
}

@inject('store')
@observer
class EditorPage extends Component<PageProps, EditorState> {
  private sceneManager = new SceneManager()
  private canvas: any = null
  private win = { width: 375, height: 667, dpr: 2 }

  state: EditorState = { status: 'loading', errorMsg: null, toolbarVisible: true }

  private cellToWorld(cx: number, cz: number) {
    const g = this.props.store!.editorStore.grid
    return { x: cx - (g - 1) / 2, z: cz - (g - 1) / 2 }
  }

  private getCellNeighbors(x: number, z: number, grid: number): CellNeighbors {
    const { world } = this.props.store!.editorStore
    const isKind = (cx: number, cz: number, kind: string) => {
      if (cx < 0 || cx >= grid || cz < 0 || cz >= grid) return false
      return ensureCell(world, cx, cz).kind === kind
    }
    return {
      n: isKind(x, z - 1, 'fence') || isKind(x, z - 1, 'bridge'),
      s: isKind(x, z + 1, 'fence') || isKind(x, z + 1, 'bridge'),
      e: isKind(x + 1, z, 'fence') || isKind(x + 1, z, 'bridge'),
      w: isKind(x - 1, z, 'fence') || isKind(x - 1, z, 'bridge'),
    }
  }

  private rebuildScene() {
    const { editorStore } = this.props.store!
    const grid = editorStore.grid
    const scene = this.sceneManager.scene3D
    if (!scene) return

    const oldTileRoot = scene.getObjectByName('tileRoot')
    if (oldTileRoot) scene.remove(oldTileRoot)

    const tileRoot = new THREE.Group()
    tileRoot.name = 'tileRoot'

    for (let x = 0; x < grid; x++) {
      for (let z = 0; z < grid; z++) {
        const cell = ensureCell(editorStore.world, x, z)
        const wpos = this.cellToWorld(x, z)

        const level = tileLevelForCell(cell)
        const tile = makeTile(cell.terrain, level)
        tile.position.set(wpos.x, 0, wpos.z)
        tile.userData = { cellX: x, cellZ: z }
        tileRoot.add(tile)

        if (cell.kind) {
          const neighbors = this.getCellNeighbors(x, z, grid)
          const obj = makeObject(cell.kind, cell, neighbors)
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

  private renderSelection(scene: THREE.Scene) {
    const oldSel = scene.getObjectByName('selectionHighlight')
    if (oldSel) scene.remove(oldSel)

    const { selectedCell, grid } = this.props.store!.editorStore
    if (!selectedCell) return

    const wpos = this.cellToWorld(selectedCell.x, selectedCell.z)
    const h = 0.02

    const g = new THREE.Group()
    g.name = 'selectionHighlight'

    // 蓝色边框 (8 条线)
    const mat = new THREE.LineBasicMaterial({ color: 0x3a72c8, transparent: true, opacity: 0.6 })
    const s = 0.49
    const corners = [
      new THREE.Vector3(-s, h, -s), new THREE.Vector3(s, h, -s),
      new THREE.Vector3(s, h, s), new THREE.Vector3(-s, h, s),
      new THREE.Vector3(-s, h, -s),
    ]
    const geo = new THREE.BufferGeometry().setFromPoints(corners)
    const line = new THREE.Line(geo, mat)
    line.position.set(wpos.x, 0, wpos.z)
    g.add(line)

    scene.add(g)
  }

  private placeCamera(grid: number) {
    const cam = this.sceneManager.camera3D
    if (!cam) return
    const s = grid * 0.6
    cam.position.set(s * 0.8, s * 0.6, s * 0.8)
    cam.lookAt(0, 0, 0)
  }

  componentDidMount() {
    Taro.nextTick(() => this.init())
  }

  componentWillUnmount() {
    this.sceneManager.dispose()
  }

  private async init() {
    try {
      const canvas = await this.getCanvasNode()
      if (!canvas) { this.setState({ status: 'error', errorMsg: 'Canvas 获取失败' }); return }
      this.canvas = canvas
      this.win = getWindowInfo()

      await this.sceneManager.init(canvas, this.win.width, this.win.height, this.win.dpr)
      this.sceneManager.start()

      this.props.store!.editorStore.ready = true
      this.rebuildScene()
      this.setState({ status: 'ready' })
    } catch (err: any) {
      console.error('[editor] init error:', err)
      this.setState({ status: 'error', errorMsg: err?.message || String(err) })
    }
  }

  private getCanvasNode(): Promise<any> {
    return new Promise((resolve, reject) => {
      Taro.createSelectorQuery()
        .select('#editor-canvas').node((res: any) => {
          res?.node ? resolve(res.node) : reject(new Error('Canvas node null'))
        }).exec()
    })
  }

  // ---- HUD 操作 ----
  private onGridChange = (size: number) => {
    const { editorStore } = this.props.store!
    if (size === editorStore.grid) return
    editorStore.setGrid(size)
    this.rebuildScene()
  }

  private onReset = () => {
    const { editorStore } = this.props.store!
    editorStore.resetWorld()
    this.rebuildScene()
  }

  private onClear = () => {
    const { editorStore } = this.props.store!
    editorStore.clearWorld()
    this.rebuildScene()
  }

  private onToggleCamera = () => {
    const { editorStore } = this.props.store!
    const modes = ['perspective', 'isometric', 'soft'] as const
    const idx = modes.indexOf(editorStore.cameraMode as any)
    const next = modes[(idx + 1) % modes.length]
    editorStore.setCameraMode(next)

    const cam = this.sceneManager.camera3D
    if (!cam) return
    const grid = editorStore.grid
    const s = grid * 0.5
    if (next === 'isometric') {
      cam.position.set(s, s * 1.2, s)
      cam.lookAt(0, 0, 0)
    } else {
      this.placeCamera(grid)
    }
  }

  private onToggleToolbar = () => {
    this.setState(s => ({ toolbarVisible: !s.toolbarVisible }))
  }

  private onLoadPreset = () => {
    const { editorStore } = this.props.store!
    applyPreset(editorStore)
    editorStore.setSelectedCell(null)
    this.rebuildScene()
  }

  private onSave = () => {
    const { editorStore } = this.props.store!
    saveWorld(editorStore)
    Taro.showToast({ title: 'Saved', icon: 'success', duration: 1500 })
  }

  private onLoad = () => {
    const { editorStore } = this.props.store!
    if (loadWorld(editorStore)) {
      editorStore.setSelectedCell(null)
      this.rebuildScene()
      Taro.showToast({ title: 'Loaded', icon: 'success', duration: 1500 })
    } else {
      Taro.showToast({ title: 'No save found', icon: 'none', duration: 1500 })
    }
  }

  private onExport = async () => {
    const { editorStore } = this.props.store!
    try {
      const path = await exportWorldToFile(editorStore)
      Taro.showToast({ title: `Exported: ${path.slice(-30)}`, icon: 'none', duration: 2000 })
    } catch (e) {
      Taro.showToast({ title: 'Export failed', icon: 'none', duration: 1500 })
    }
  }

  private onImport = async () => {
    const { editorStore } = this.props.store!
    const ok = await importWorldFromFile(editorStore)
    if (ok) {
      editorStore.setSelectedCell(null)
      this.rebuildScene()
      Taro.showToast({ title: 'Imported', icon: 'success', duration: 1500 })
    } else {
      Taro.showToast({ title: 'Import failed', icon: 'none', duration: 1500 })
    }
  }

  // ---- Toolbar 动作 ----
  private onEraser = () => {
    const { editorStore } = this.props.store!
    if (editorStore.activeTool?.id === '__eraser__') {
      editorStore.setActiveTool(null)
    } else {
      editorStore.setActiveTool({ id: '__eraser__', label: 'Erase', kind: null, terrain: null })
    }
  }

  private onRaise = () => {
    const { editorStore } = this.props.store!
    const cell = editorStore.selectedCell ?? { x: Math.floor(editorStore.grid / 2), z: Math.floor(editorStore.grid / 2) }
    editorStore.raiseTerrain(cell.x, cell.z)
    this.rebuildScene()
  }

  private onLower = () => {
    const { editorStore } = this.props.store!
    const cell = editorStore.selectedCell ?? { x: Math.floor(editorStore.grid / 2), z: Math.floor(editorStore.grid / 2) }
    editorStore.lowerTerrain(cell.x, cell.z)
    this.rebuildScene()
  }

  private onUndo = () => {
    const { editorStore } = this.props.store!
    editorStore.undo()
    this.rebuildScene()
  }

  private onRedo = () => {
    const { editorStore } = this.props.store!
    editorStore.redo()
    this.rebuildScene()
  }

  // ---- Touch 交互（单指转动 + 双指缩放 + 长按菜单）----
  private touchStart = { x: 0, y: 0, time: 0 }
  private touchMoved = false
  private pinchDist = 0
  private camDist = 0
  private longPressTimer: any = null

  private onTouchStart = (e: any) => {
    const t = e.touches?.[0]
    if (!t) return
    this.touchStart = { x: t.x || t.clientX || 0, y: t.y || t.clientY || 0, time: Date.now() }
    this.touchMoved = false
    this.pinchDist = 0

    // 双指：记录初始距离
    if (e.touches.length === 2) {
      const a = e.touches[0]; const b = e.touches[1]
      this.pinchDist = Math.hypot(b.x - a.x, b.y - a.y)
      const cam = this.sceneManager.camera3D
      if (cam) this.camDist = cam.position.length()
    }

    // 单指：启动长按计时
    if (e.touches.length === 1) {
      clearTimeout(this.longPressTimer)
      this.longPressTimer = setTimeout(() => {
        if (!this.touchMoved) this.handleLongPress(e)
      }, 600)
    }
  }

  private onTouchMove = (e: any) => {
    this.touchMoved = true
    clearTimeout(this.longPressTimer)
    const cam = this.sceneManager.camera3D
    if (!cam) return

    // 双指缩放
    if (e.touches.length === 2 && this.pinchDist > 0) {
      const a = e.touches[0]; const b = e.touches[1]
      const dist = Math.hypot(b.x - a.x, b.y - a.y)
      const ratio = this.pinchDist / Math.max(dist, 1)
      const newDist = Math.max(0.5, Math.min(15, this.camDist * ratio))
      const dir = cam.position.clone().normalize()
      cam.position.copy(dir.multiplyScalar(newDist))
      cam.lookAt(0, 0, 0)
      this.camDist = newDist
      this.pinchDist = dist
      return
    }

    // 单指转动
    const t = e.touches?.[0]
    if (!t) return
    const x = t.x || t.clientX || 0
    const y = t.y || t.clientY || 0
    const dx = x - this.touchStart.x
    const dy = y - this.touchStart.y
    this.touchStart = { x, y, time: Date.now() }

    cam.position.x += dx * 0.008
    cam.position.z += dy * 0.008
    cam.lookAt(0, 0, 0)
  }

  private handleLongPress(e: any) {
    const t = e.changedTouches?.[0]
    if (!t) return
    const { editorStore } = this.props.store!
    const cam = this.sceneManager.camera3D
    const scene = this.sceneManager.scene3D
    if (!cam || !scene) return

    const hit = raycastCell(cam, t.x || t.clientX || 0, t.y || t.clientY || 0, this.win.width, this.win.height, scene, editorStore.grid)
    if (!hit) return

    // 长按：选中 + 显示动作菜单
    editorStore.setSelectedCell(hit)
    this.rebuildScene()
    Taro.showActionSheet({
      itemList: ['Raise terrain', 'Lower terrain', 'Delete object', 'Cancel'],
      success: (res) => {
        if (res.tapIndex === 0) editorStore.raiseTerrain(hit.x, hit.z)
        else if (res.tapIndex === 1) editorStore.lowerTerrain(hit.x, hit.z)
        else if (res.tapIndex === 2) editorStore.eraseCell(hit.x, hit.z)
        else return
        this.rebuildScene()
      },
    })
  }

  private onTouchEnd = (e: any) => {
    clearTimeout(this.longPressTimer)
    if (this.touchMoved) return
    const t = e.changedTouches?.[0]
    if (!t) return

    const { editorStore } = this.props.store!
    const cam = this.sceneManager.camera3D
    const scene = this.sceneManager.scene3D
    if (!cam || !scene) return

    const hit = raycastCell(cam, t.x || t.clientX || 0, t.y || t.clientY || 0, this.win.width, this.win.height, scene, editorStore.grid)
    if (!hit) return

    // Eraser mode
    if (editorStore.activeTool?.id === '__eraser__') {
      editorStore.eraseCell(hit.x, hit.z)
      this.rebuildScene()
      return
    }

    // 有活动工具 → 放置/修改
    if (editorStore.activeTool) {
      const tool = editorStore.activeTool as any
      editorStore.setCell(hit.x, hit.z, { terrain: tool.terrain || undefined, kind: tool.kind })
      this.rebuildScene()
      return
    }

    // 无工具 → 选取格子
    editorStore.setSelectedCell(hit)
    this.rebuildScene()
  }

  render() {
    const { status, errorMsg, toolbarVisible } = this.state

    return (
      <View className='editor-container'>
        <Canvas
          type='webgl' id='editor-canvas' className='editor-canvas'
          onTouchStart={this.onTouchStart}
          onTouchMove={this.onTouchMove}
          onTouchEnd={this.onTouchEnd}
          disableScroll
        />

        {status === 'loading' && <View className='editor-loading'>Loading...</View>}
        {status === 'error' && <View className='editor-error'>{errorMsg}</View>}

        {status === 'ready' && (
          <>
            <EditorHUD
              onGridChange={this.onGridChange}
              onReset={this.onReset}
              onClear={this.onClear}
              onToggleCamera={this.onToggleCamera}
              onToggleToolbar={this.onToggleToolbar}
              onLoadPreset={this.onLoadPreset}
              onSave={this.onSave}
              onLoad={this.onLoad}
              onExport={this.onExport}
              onImport={this.onImport}
            />
            <Minimap />
            {toolbarVisible && (
              <Toolbar
                onEraser={this.onEraser}
                onRaise={this.onRaise}
                onLower={this.onLower}
                onUndo={this.onUndo}
                onRedo={this.onRedo}
              />
            )}
          </>
        )}
      </View>
    )
  }
}

export default EditorPage
