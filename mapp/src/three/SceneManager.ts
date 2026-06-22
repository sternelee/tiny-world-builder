/**
 * Three.js 场景管理器
 *
 * 封装 WeChat Mini Program Canvas + Three.js 渲染管线。
 * 通过 POC 验证的 adapter 手法初始化。
 */

import '../weapp-adapter'
import { updateWindowSize, adoptCanvasAnimationFrame } from '../weapp-adapter'
import * as THREE from 'three'

export class SceneManager {
  private renderer: THREE.WebGLRenderer | null = null
  private scene: THREE.Scene | null = null
  private camera: THREE.PerspectiveCamera | null = null
  private animId: number = 0
  private running = false

  private canvas: any = null

  /** 获取 Three.js 渲染器（供外部访问 scene/camera） */
  get renderer3D() { return this.renderer }
  get scene3D() { return this.scene }
  get camera3D() { return this.camera }

  /** 初始化 canvas + Three.js */
  async init(canvas: any, width: number, height: number, dpr: number) {
    this.canvas = canvas

    // 补缺的 DOM 方法
    if (!canvas.addEventListener) {
      canvas.addEventListener = () => {}
    }
    if (!canvas.removeEventListener) {
      canvas.removeEventListener = () => {}
    }
    if (!canvas.style) canvas.style = {}
    if (!canvas.clientWidth) canvas.clientWidth = width
    if (!canvas.clientHeight) canvas.clientHeight = height
    if (!canvas.getBoundingClientRect) {
      canvas.getBoundingClientRect = () => ({
        left: 0, top: 0, width, height, right: width, bottom: height,
      })
    }

    // 适配垫片
    updateWindowSize(width, height, dpr)
    adoptCanvasAnimationFrame(canvas)

    // 创建渲染器
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    })
    this.renderer.setSize(width, height)
    this.renderer.setPixelRatio(Math.min(dpr, 2))

    // 场景
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x1a1a2e)

    // 相机
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000)
    this.camera.position.set(6, 4, 8)
    this.camera.lookAt(0, 0, 0)

    // 灯光
    this.scene.add(new THREE.AmbientLight(0x404060))
    const sun = new THREE.DirectionalLight(0xffffff, 1)
    sun.position.set(8, 12, 10)
    this.scene.add(sun)
    const fill = new THREE.DirectionalLight(0x8888ff, 0.3)
    fill.position.set(-5, 3, -5)
    this.scene.add(fill)

    // 网格
    this.scene.add(new THREE.GridHelper(12, 12, 0x666688, 0x333344))
  }

  /** 启动渲染循环 */
  start() {
    if (this.running) return
    this.running = true
    this.loop()
  }

  /** 停止渲染循环 */
  stop() {
    this.running = false
    if (this.animId) {
      const w = (globalThis as any).window
      if (w?.cancelAnimationFrame) w.cancelAnimationFrame(this.animId)
      this.animId = 0
    }
  }

  private loop = () => {
    if (!this.running || !this.renderer || !this.scene || !this.camera) return
    this.renderer.render(this.scene, this.camera)
    const w = (globalThis as any).window
    if (w?.requestAnimationFrame) {
      this.animId = w.requestAnimationFrame(this.loop)
    }
  }

  /** 释放资源 */
  dispose() {
    this.stop()
    this.renderer?.dispose()
    this.renderer = null
    this.scene = null
    this.camera = null
  }
}

export default SceneManager
