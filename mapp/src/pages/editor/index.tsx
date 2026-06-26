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
import { makeTile, makeObject, CellNeighbors, TerrainNeighbors, LevelNeighbors, tileLevelForCell } from '../../three/TileRenderer'
import { raycastCell } from '../../three/Raycaster'
import { getWindowInfo } from '../../services/PlatformAdapter'
import Toolbar from '../../components/Toolbar'
import EditorHUD from '../../components/EditorHUD'
import Minimap from '../../components/Minimap'
import ToolPaletteModal from '../../components/ToolPaletteModal'
import ModelLibraryModal from '../../components/ModelLibraryModal'

import './index.scss'
import { ensureCell } from '../../core/world-data'
import { applyPreset } from '../../core/presets'
import { getTerrainNeighbors, getLevelNeighbors, bfsHouseCluster, classifyClusterShape } from '../../core/adjacency'
import { saveWorld, loadWorld, exportWorldToFile, importWorldFromFile } from '../../services/WorldPersistence'

type PageProps = PropsWithChildren & {
  store?: { editorStore: EditorStore }
}

interface EditorState {
  status: 'loading' | 'ready' | 'error'
  errorMsg: string | null
  toolbarVisible: boolean
  paletteOpen: boolean
  libraryOpen: boolean
}

@inject('store')
@observer
class EditorPage extends Component<PageProps, EditorState> {
  private sceneManager = new SceneManager()
  private canvas: any = null
  private win = { width: 375, height: 667, dpr: 2 }
  private ghostGroup: THREE.Group | null = null

  state: EditorState = { status: 'loading', errorMsg: null, toolbarVisible: true, paletteOpen: false, libraryOpen: false }

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

  private rebuildScene(animate: boolean = false) {
    const { editorStore } = this.props.store!
    const grid = editorStore.grid
    const scene = this.sceneManager.scene3D
    if (!scene) return

    const oldTileRoot = scene.getObjectByName('tileRoot')
    if (oldTileRoot) scene.remove(oldTileRoot)
    this.sceneManager.clearDrops()

    // ---- 房子聚类：第一遍扫描，找到所有 house 簇 ----
    const houseVisited = new Set<string>()
    const houseClusterMap = new Map<string, { shape: string; length?: number; orientation?: string }>() // key 'x,z' → cluster info for anchor only
    const houseSkipSet = new Set<string>() // 'x,z' of non-anchor cells

    for (let x = 0; x < grid; x++) {
      for (let z = 0; z < grid; z++) {
        const key = `${x},${z}`
        if (houseVisited.has(key)) continue
        const cell = ensureCell(editorStore.world, x, z)
        if (cell.kind !== 'house') continue

        // BFS 收集簇
        const cells = bfsHouseCluster(editorStore.world, x, z, grid)
        for (const c of cells) houseVisited.add(`${c.x},${c.z}`)

        const shape = classifyClusterShape(cells)
        // 找出锚点（最小 x + z 或第一个）
        const anchor = cells.reduce((best, c) => {
          if (c.x < best.x || (c.x === best.x && c.z < best.z)) return c
          return best
        }, cells[0])
        const anchorKey = `${anchor.x},${anchor.z}`

        // 非锚点跳过渲染
        for (const c of cells) {
          const ck = `${c.x},${c.z}`
          if (ck !== anchorKey) houseSkipSet.add(ck)
        }

        // 行状：计算长度和方向
        let clusterInfo: any = { shape, cells, anchor }
        if (shape === 'row') {
          clusterInfo.length = cells.length
          clusterInfo.orientation = cells.length > 1 && cells[0].x === cells[1].x ? 'z' : 'x'
        }
        houseClusterMap.set(anchorKey, clusterInfo)
      }
    }

    // ---- 第二遍：渲染 tile + object ----
    const tileRoot = new THREE.Group()
    tileRoot.name = 'tileRoot'

    for (let x = 0; x < grid; x++) {
      for (let z = 0; z < grid; z++) {
        const cell = ensureCell(editorStore.world, x, z)
        const wpos = this.cellToWorld(x, z)
        const key = `${x},${z}`

        // 地形瓦片（总是渲染）
        const level = tileLevelForCell(cell)
        const tn = getTerrainNeighbors(editorStore.world, x, z, grid)
        const ln = getLevelNeighbors(editorStore.world, x, z, grid)
        const tile = makeTile(cell.terrain, level, tn, ln)
        tile.position.set(wpos.x, 0, wpos.z)
        tile.userData = { cellX: x, cellZ: z }
        tileRoot.add(tile)
        if (animate) {
          const delay = (x + z) * 0.025
          this.sceneManager.addDrop(tile, 0, 2.4, 0.42, delay)
        }

        // 物体
        if (cell.kind) {
          if (houseSkipSet.has(key)) continue // 非锚点房子不渲染自己

          const neighbors = this.getCellNeighbors(x, z, grid)
          const clusterInfo = houseClusterMap.get(key)
          const obj = makeObject(cell.kind, cell, neighbors, clusterInfo)
          if (obj) {
            obj.position.set(wpos.x, 0, wpos.z)
            obj.userData = { cellX: x, cellZ: z, kind: cell.kind }
            tileRoot.add(obj)
            if (animate) {
              const delay = (x + z) * 0.025 + 0.08
              this.sceneManager.addDrop(obj, 0, 1.8, 0.36, delay)
            }
          }
        }
      }
    }

    scene.add(tileRoot)
    this.placeCamera(grid)
    this.refreshGhostMesh()
    this.renderSelection(scene)
  }

  /** 增量更新：只重建受影响的格子，避免全量销毁 */
  private updateCell(x: number, z: number, animate: boolean = false) {
    const { editorStore } = this.props.store!
    const grid = editorStore.grid
    const scene = this.sceneManager.scene3D
    if (!scene) return
    const tileRoot = scene.getObjectByName('tileRoot') as THREE.Group | undefined
    if (!tileRoot) { this.rebuildScene(animate); return }

    // 收集受影响的格子：目标 + 四邻
    const affected = new Set<string>([`${x},${z}`])
    const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]]
    for (const [dx, dz] of dirs) {
      const nx = x + dx, nz = z + dz
      if (nx >= 0 && nx < grid && nz >= 0 && nz < grid) affected.add(`${nx},${nz}`)
    }

    // 如果目标或邻居是 house，扩展到整个连通簇
    const needsHouseScan = [...affected].some(k => {
      const [cx, cz] = k.split(',').map(Number)
      return ensureCell(editorStore.world, cx, cz).kind === 'house'
    })
    if (needsHouseScan) {
      for (const k of [...affected]) {
        const [cx, cz] = k.split(',').map(Number)
        if (ensureCell(editorStore.world, cx, cz).kind === 'house') {
          const cluster = bfsHouseCluster(editorStore.world, cx, cz, grid)
          for (const c of cluster) affected.add(`${c.x},${c.z}`)
        }
      }
    }

    // 删除受影响格子的旧 mesh（只查直接子节点，避免重复匹配）
    const toRemove: THREE.Object3D[] = []
    for (let i = tileRoot.children.length - 1; i >= 0; i--) {
      const child = tileRoot.children[i]
      const ud = (child as any).userData
      if (ud?.cellX != null && affected.has(`${ud.cellX},${ud.cellZ}`)) {
        toRemove.push(child)
      }
    }
    for (const obj of toRemove) {
      tileRoot.remove(obj)
    }

    // 重新计算房子聚类（只扫描受影响格子涉及的行）
    const houseVisited = new Set<string>()
    const houseClusterMap = new Map<string, any>()
    const houseSkipSet = new Set<string>()

    for (const k of affected) {
      const [cx, cz] = k.split(',').map(Number)
      if (houseVisited.has(k)) continue
      const cell = ensureCell(editorStore.world, cx, cz)
      if (cell.kind !== 'house') continue

      const cells = bfsHouseCluster(editorStore.world, cx, cz, grid)
      for (const c of cells) houseVisited.add(`${c.x},${c.z}`)
      const shape = classifyClusterShape(cells)
      const anchor = cells.reduce((best, c) =>
        c.x < best.x || (c.x === best.x && c.z < best.z) ? c : best, cells[0])
      const anchorKey = `${anchor.x},${anchor.z}`
      for (const c of cells) {
        const ck = `${c.x},${c.z}`
        if (ck !== anchorKey) houseSkipSet.add(ck)
      }
      let clusterInfo: any = { shape, cells, anchor }
      if (shape === 'row') {
        clusterInfo.length = cells.length
        clusterInfo.orientation = cells.length > 1 && cells[0].x === cells[1].x ? 'z' : 'x'
      }
      houseClusterMap.set(anchorKey, clusterInfo)
    }

    // 重建受影响格子
    for (const k of affected) {
      const [cx, cz] = k.split(',').map(Number)
      const cell = ensureCell(editorStore.world, cx, cz)
      const wpos = this.cellToWorld(cx, cz)

      // 地形瓦片
      const level = tileLevelForCell(cell)
      const tn = getTerrainNeighbors(editorStore.world, cx, cz, grid)
      const ln = getLevelNeighbors(editorStore.world, cx, cz, grid)
      const tile = makeTile(cell.terrain, level, tn, ln)
      tile.position.set(wpos.x, 0, wpos.z)
      tile.userData = { cellX: cx, cellZ: cz }
      tileRoot.add(tile)
      if (animate) {
        const delay = (cx + cz) * 0.025
        this.sceneManager.addDrop(tile, 0, 2.4, 0.42, delay)
      }

      // 物体
      if (cell.kind && !houseSkipSet.has(k)) {
        const neighbors = this.getCellNeighbors(cx, cz, grid)
        const clusterInfo = houseClusterMap.get(k)
        const obj = makeObject(cell.kind, cell, neighbors, clusterInfo)
        if (obj) {
          obj.position.set(wpos.x, 0, wpos.z)
          obj.userData = { cellX: cx, cellZ: cz, kind: cell.kind }
          tileRoot.add(obj)
          if (animate) {
            const delay = (cx + cz) * 0.025 + 0.08
            this.sceneManager.addDrop(obj, 0, 1.8, 0.36, delay)
          }
        }
      }
    }

    this.refreshGhostMesh()
    this.renderSelection(scene)
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
    const s = grid * 0.65
    this.sceneManager.moveCameraTo(s * 0.7, s * 0.55, s * 0.7)
  }

  componentDidUpdate(_prevProps: any) {
    const tool = this.props.store?.editorStore.activeTool
    if (tool?.id !== (this as any)._lastToolId) {
      (this as any)._lastToolId = tool?.id
      this.refreshGhostMesh()
    }
  }

  componentDidMount() {
    Taro.nextTick(() => this.init())
    Taro.onWindowResize?.(this.onWindowResize)
  }

  componentWillUnmount() {
    Taro.offWindowResize?.(this.onWindowResize)
    this.sceneManager.dispose()
  }

  private onWindowResize = (res: any) => {
    const { windowWidth, windowHeight } = res
    if (!windowWidth || !windowHeight) return
    this.win.width = windowWidth
    this.win.height = windowHeight

    // 更新 canvas DOM 尺寸
    if (this.canvas) {
      this.canvas.width = windowWidth * this.win.dpr
      this.canvas.height = windowHeight * this.win.dpr
      if (this.canvas.style) {
        this.canvas.style.width = windowWidth + 'px'
        this.canvas.style.height = windowHeight + 'px'
      }
    }

    const renderer = this.sceneManager.renderer3D
    const camera = this.sceneManager.camera3D
    if (renderer) {
      renderer.setSize(windowWidth, windowHeight)
      renderer.setPixelRatio(Math.min(this.win.dpr, 2))
    }
    if (camera) {
      camera.aspect = windowWidth / windowHeight
      camera.updateProjectionMatrix()
    }
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
      this.rebuildScene(true)
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
      this.sceneManager.moveCameraTo(s, s * 1.2, s)
    } else {
      this.placeCamera(grid)
    }
  }

  private onMore = () => this.setState({ paletteOpen: true })
  private closePalette = () => this.setState({ paletteOpen: false })
  private openLibrary = () => this.setState({ libraryOpen: true })
  private closeLibrary = () => this.setState({ libraryOpen: false })

  private onToggleToolbar = () => {
    this.setState(s => ({ toolbarVisible: !s.toolbarVisible }))
  }

  private onLoadPreset = () => {
    const { editorStore } = this.props.store!
    applyPreset(editorStore)
    editorStore.setSelectedCell(null)
    this.rebuildScene(true)
  }

  private onLogin = () => {
    Taro.showToast({ title: 'Login — coming soon', icon: 'none', duration: 1500 })
  }

  private onToggleTime = () => {
    this.sceneManager.autoTimeOfDay = !this.sceneManager.autoTimeOfDay
    Taro.showToast({ title: this.sceneManager.autoTimeOfDay ? 'Time: auto' : 'Time: paused', icon: 'none', duration: 1000 })
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
      this.rebuildScene(true)
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
    this.refreshGhostMesh()
  }

  private onRaise = () => {
    const { editorStore } = this.props.store!
    const cell = editorStore.selectedCell ?? { x: Math.floor(editorStore.grid / 2), z: Math.floor(editorStore.grid / 2) }
    editorStore.raiseTerrain(cell.x, cell.z)
    this.updateCell(cell.x, cell.z)
  }

  private onLower = () => {
    const { editorStore } = this.props.store!
    const cell = editorStore.selectedCell ?? { x: Math.floor(editorStore.grid / 2), z: Math.floor(editorStore.grid / 2) }
    editorStore.lowerTerrain(cell.x, cell.z)
    this.updateCell(cell.x, cell.z)
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

  // ---- Ghost 预览 ----
  private refreshGhostMesh() {
    const old = this.ghostGroup
    if (old?.parent) old.parent.remove(old)
    this.ghostGroup = null

    const { editorStore } = this.props.store!
    const tool = editorStore.activeTool
    if (!tool || !tool.kind) return

    // Build ghost mesh using makeObject but with ghost material applied
    const ghostMat = new THREE.MeshBasicMaterial({
      color: 0x6fb6ff,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    })
    const obj = makeObject(tool.kind, undefined, undefined, undefined, ghostMat)
    if (!obj) return

    // Wrap in a group so we can change position easily
    this.ghostGroup = new THREE.Group()
    this.ghostGroup.name = 'ghostPreview'
    this.ghostGroup.add(obj)
    this.ghostGroup.visible = false
    // Render ghost above normal objects
    obj.traverse(child => {
      if ((child as any).isMesh) (child as any).renderOrder = 999
    })
    const scene = this.sceneManager.scene3D
    if (scene) scene.add(this.ghostGroup)
  }

  private updateGhostPosition(wx: number, wy: number) {
    if (!this.ghostGroup) return
    const { editorStore } = this.props.store!
    const cam = this.sceneManager.camera3D
    const scene = this.sceneManager.scene3D
    if (!cam || !scene) return

    const hit = raycastCell(cam, wx, wy, this.win.width, this.win.height, scene, editorStore.grid)
    if (hit) {
      const wpos = this.cellToWorld(hit.x, hit.z)
      this.ghostGroup.position.set(wpos.x, 0, wpos.z)
      this.ghostGroup.visible = true
    } else {
      this.ghostGroup.visible = false
    }
  }
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
    this.updateGhostPosition(x, y)
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
    this.renderSelection(scene)
    Taro.showActionSheet({
      itemList: ['Raise terrain', 'Lower terrain', 'Delete object', 'Cancel'],
      success: (res) => {
        if (res.tapIndex === 0) editorStore.raiseTerrain(hit.x, hit.z)
        else if (res.tapIndex === 1) editorStore.lowerTerrain(hit.x, hit.z)
        else if (res.tapIndex === 2) editorStore.eraseCell(hit.x, hit.z)
        else return
        this.updateCell(hit.x, hit.z)
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
      this.updateCell(hit.x, hit.z)
      return
    }

    // 有活动工具 → 放置/修改
    if (editorStore.activeTool) {
      const tool = editorStore.activeTool as any
      editorStore.setCell(hit.x, hit.z, { terrain: tool.terrain || undefined, kind: tool.kind })
      this.updateCell(hit.x, hit.z, true)
      return
    }

    // 无工具 → 选取格子
    editorStore.setSelectedCell(hit)
    this.renderSelection(scene)
  }

  render() {
    const { status, errorMsg, toolbarVisible } = this.state

    return (
      <View className='editor-container'>
        {/* HUD on top - regular View as flex child */}
        {status === 'ready' && (
          <EditorHUD
            onGridChange={this.onGridChange}
            onToggleCamera={this.onToggleCamera}
            onSave={this.onSave}
            onLoad={this.onLoad}
            onLoadPreset={this.onLoadPreset}
            onNewProject={this.onClear}
            onLogin={this.onLogin}
            onToggleTime={this.onToggleTime}
            onOpenLibrary={this.openLibrary}
          />
        )}

        {/* Canvas fills middle area */}
        <View className='canvas-wrap'>
          <Canvas
            type='webgl' id='editor-canvas' className='editor-canvas'
            onTouchStart={this.onTouchStart}
            onTouchMove={this.onTouchMove}
            onTouchEnd={this.onTouchEnd}
            disableScroll
          />

          {status === 'loading' && <View className='editor-loading'>Loading...</View>}
          {status === 'error' && <View className='editor-error'>{errorMsg}</View>}

          {status === 'ready' && <Minimap />}
        </View>

        {/* Toolbar at bottom - regular View as flex child */}
        {status === 'ready' && toolbarVisible && (
          <Toolbar
            onEraser={this.onEraser}
            onRaise={this.onRaise}
            onLower={this.onLower}
            onUndo={this.onUndo}
            onRedo={this.onRedo}
            onMore={this.onMore}
          />
        )}

        <ToolPaletteModal visible={this.state.paletteOpen} onClose={this.closePalette} />
        <ModelLibraryModal visible={this.state.libraryOpen} onClose={this.closeLibrary} />
      </View>
    )
  }
}

export default EditorPage
