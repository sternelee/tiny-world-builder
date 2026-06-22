/**
 * POC: Three.js r128 WebGL 立方体 — 验证小程序 WebGL Canvas
 *
 * 1. 创建 WebGL Canvas
 * 2. 初始化 Three.js 渲染器
 * 3. 渲染旋转立方体
 * 4. 触摸拖动旋转视角
 */
import { Component, PropsWithChildren } from 'react'
import { Canvas, View } from '@tarojs/components'
import Taro from '@tarojs/taro'

import './index.scss'

// 必须在 Three.js 导入前加载垫片（全局 window/document 设置）
import '../../weapp-adapter'
import { updateWindowSize, adoptCanvasAnimationFrame } from '../../weapp-adapter'

// Three.js
import * as THREE from 'three'

interface POCState {
  loaded: boolean
  error: string | null
}

class POC extends Component<PropsWithChildren, POCState> {
  private canvas: any = null
  private renderer: THREE.WebGLRenderer | null = null
  private scene: THREE.Scene | null = null
  private camera: THREE.PerspectiveCamera | null = null
  private cube: THREE.Mesh | null = null
  private animId: number = 0
  private lastTouch = { x: 0, y: 0 }

  state: POCState = { loaded: false, error: null }

  componentDidMount() {
    Taro.nextTick(() => this.initScene())
  }

  componentWillUnmount() {
    if (this.animId) {
      const w = (globalThis as any).window
      if (w && w.cancelAnimationFrame) w.cancelAnimationFrame(this.animId)
    }
    this.renderer?.dispose()
    this.renderer = null
  }

  private async initScene() {
    try {
      // 1. 获取 canvas 节点
      const canvas = await this.getCanvasNode()
      if (!canvas) {
        this.setState({ error: 'Canvas 节点获取失败' })
        return
      }
      this.canvas = canvas

      // 2. 补 canvas 缺少的 DOM 方法（Three.js 需要）
      if (!canvas.addEventListener) {
        canvas.addEventListener = function (type: string, handler: any) {
          // Three.js 监听的 webglcontextlost / webglcontextrestored
          // 小程序 canvas 不会触发这些事件，noop 即可
        }
      }
      if (!canvas.removeEventListener) {
        canvas.removeEventListener = function () {}
      }
      if (!canvas.style) canvas.style = {}
      if (!canvas.clientWidth) canvas.clientWidth = 375
      if (!canvas.clientHeight) canvas.clientHeight = 667
      if (!canvas.getBoundingClientRect) {
        canvas.getBoundingClientRect = () => ({
          left: 0, top: 0, width: 375, height: 667,
          right: 375, bottom: 667,
        })
      }

      // 用新版 API 替代已废弃的 getSystemInfoSync
      const windowInfo = Taro.getWindowInfo ? Taro.getWindowInfo() : { windowWidth: 375, windowHeight: 667, pixelRatio: 2 }
      const deviceInfo = Taro.getDeviceInfo ? Taro.getDeviceInfo() : { pixelRatio: 2 }
      const dpr = deviceInfo.pixelRatio || windowInfo.pixelRatio || 2
      updateWindowSize(windowInfo.windowWidth, windowInfo.windowHeight, dpr)
      adoptCanvasAnimationFrame(canvas)

      // 3. 创建 Three.js 场景
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
      })
      this.renderer.setSize(windowInfo.windowWidth, windowInfo.windowHeight)
      this.renderer.setPixelRatio(Math.min(dpr, 2))

      this.scene = new THREE.Scene()
      this.scene.background = new THREE.Color(0x1a1a2e)

      this.camera = new THREE.PerspectiveCamera(
        45,
        windowInfo.windowWidth / windowInfo.windowHeight,
        0.1,
        1000,
      )
      this.camera.position.set(3, 2, 5)
      this.camera.lookAt(0, 0, 0)

      // 5. 灯光
      const ambientLight = new THREE.AmbientLight(0x404060)
      this.scene.add(ambientLight)

      const dirLight = new THREE.DirectionalLight(0xffffff, 1)
      dirLight.position.set(5, 10, 7)
      this.scene.add(dirLight)

      const backLight = new THREE.DirectionalLight(0x8888ff, 0.3)
      backLight.position.set(-5, 0, -5)
      this.scene.add(backLight)

      // 6. 立方体
      const geometry = new THREE.BoxGeometry(1, 1, 1)

      // 每个面不同颜色
      const materials = [
        new THREE.MeshStandardMaterial({ color: 0xff5733 }), // 右 - 橙
        new THREE.MeshStandardMaterial({ color: 0x33ff57 }), // 左 - 绿
        new THREE.MeshStandardMaterial({ color: 0x3357ff }), // 上 - 蓝
        new THREE.MeshStandardMaterial({ color: 0xff33f5 }), // 下 - 粉
        new THREE.MeshStandardMaterial({ color: 0xffd733 }), // 前 - 黄
        new THREE.MeshStandardMaterial({ color: 0x33fff5 }), // 后 - 青
      ]
      this.cube = new THREE.Mesh(geometry, materials)
      this.scene.add(this.cube)

      // 7. 网格辅助
      const gridHelper = new THREE.GridHelper(10, 10, 0x888888, 0x444444)
      this.scene.add(gridHelper)

      this.setState({ loaded: true, error: null })
      this.animate()

    } catch (err: any) {
      console.error('[POC] init error:', err)
      this.setState({ error: err?.message || String(err) })
    }
  }

  private getCanvasNode(): Promise<any> {
    return new Promise((resolve, reject) => {
      const query = Taro.createSelectorQuery()
      query
        .select('#webgl-canvas')
        .node((res: any) => {
          if (res && res.node) {
            resolve(res.node)
          } else {
            reject(new Error('Canvas node 为空'))
          }
        })
        .exec()
    })
  }

  private animate = () => {
    if (!this.cube || !this.renderer || !this.scene || !this.camera) return

    this.cube.rotation.x += 0.01
    this.cube.rotation.y += 0.015

    this.renderer.render(this.scene, this.camera)

    const w = (globalThis as any).window
    if (w && w.requestAnimationFrame) {
      this.animId = w.requestAnimationFrame(this.animate)
    }
  }

  // ---- touch 交互 ----
  private onTouchStart = (e: any) => {
    const t = e.touches?.[0]
    if (t) {
      this.lastTouch = { x: t.clientX || t.x || 0, y: t.clientY || t.y || 0 }
    }
  }

  private onTouchMove = (e: any) => {
    if (!this.cube) return
    const t = e.touches?.[0]
    if (!t) return

    const x = t.clientX || t.x || 0
    const y = t.clientY || t.y || 0
    const dx = x - this.lastTouch.x
    const dy = y - this.lastTouch.y

    // 双指：缩放
    if (e.touches.length === 2 && this.camera) {
      const prevDist = Math.sqrt(
        (e.touches[0].clientX - e.touches[1].clientX) ** 2 +
        (e.touches[0].clientY - e.touches[1].clientY) ** 2,
      )
      // pinch zoom handled by event detail... skip for now
    } else if (e.touches.length === 1) {
      // 单指：旋转视角（绕 Y 轴）
      this.cube.rotation.y += dx * 0.01
      this.cube.rotation.x += dy * 0.01
    }

    this.lastTouch = { x, y }
  }

  render() {
    const { loaded, error } = this.state

    return (
      <View className='poc-container'>
        <Canvas
          type='webgl'
          id='webgl-canvas'
          className='poc-canvas'
          onTouchStart={this.onTouchStart}
          onTouchMove={this.onTouchMove}
          disableScroll
        />

        {/* 状态信息 */}
        <View className='poc-status' id='info-text'>
          {error
            ? `Error: ${error}`
            : loaded
              ? 'Three.js r128 + Taro ✓'
              : 'Initializing...'}
        </View>

        {/* 操作提示 */}
        <View className='poc-hint'>
          Single finger: rotate | Pinch: zoom
        </View>
      </View>
    )
  }
}

export default POC
