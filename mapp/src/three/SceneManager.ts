/**
 * Three.js 场景管理器
 *
 * 封装 WeChat Mini Program Canvas + Three.js 渲染管线。
 * 通过 POC 验证的 adapter 手法初始化。
 */

import '../weapp-adapter'
import { updateWindowSize, adoptCanvasAnimationFrame } from '../weapp-adapter'
import * as THREE from 'three'

export interface DropAnim {
  object: THREE.Object3D
  targetY: number
  startY: number
  startTime: number
  duration: number
  delay: number
  done?: boolean
}

export class SceneManager {
  private renderer: THREE.WebGLRenderer | null = null
  private scene: THREE.Scene | null = null
  private camera: THREE.PerspectiveCamera | null = null
  private animId: number = 0
  private running = false
  private startTime = 0
  private dropAnims: DropAnim[] = []

  private canvas: any = null
  private _todMinutes = 600
  private _skyColor = new THREE.Color()
  private _todAuto = true
  private _lastTodUpdate = 0

  get timeOfDayMinutes() { return this._todMinutes }
  set timeOfDayMinutes(m: number) { this._todMinutes = m % 1440; this._todAuto = false }
  get autoTimeOfDay() { return this._todAuto }
  set autoTimeOfDay(v: boolean) { this._todAuto = v }

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
    this.scene.background = this._skyColor

    // 日夜间状态
    this._skyColor.set(0xb9dcf4)
    this._todAuto = true

    // 相机
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000)
    this.camera.position.set(6, 4, 8)
    this.camera.lookAt(0, 0, 0)

    // 灯光
    this.scene.add(new THREE.HemisphereLight(0x87ceeb, 0x3a7d44, 0.6))
    const sun = new THREE.DirectionalLight(0xffffff, 0.9)
    sun.position.set(8, 15, 10)
    this.scene.add(sun)
    const fill = new THREE.DirectionalLight(0xb0c4ff, 0.3)
    fill.position.set(-5, 5, -5)
    this.scene.add(fill)

    // 软阴影地面（在 tile 未覆盖区域提供参考）
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.MeshLambertMaterial({ color: 0xc8e0f0, depthWrite: false, transparent: true, opacity: 0.6 }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.06
    this.scene.add(ground)

    this._addClouds()
    this.updateSkyColor()
  }
  start() {
    if (this.running) return
    this.running = true
    this.startTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
    this.loop()
  }

  /** 添加 drop 动画: 从 targetY + dropHeight 掉落到 targetY */
  addDrop(object: THREE.Object3D, targetY: number, dropHeight: number, duration: number, delay: number) {
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
    this.dropAnims.push({
      object,
      targetY,
      startY: targetY + dropHeight,
      startTime: now,
      duration,
      delay,
    })
    object.position.y = targetY + dropHeight
  }

  /** 清除 drop 队列 */
  clearDrops() {
    this.dropAnims.length = 0
  }

  private tickDrops(nowMs: number) {
    if (!this.dropAnims.length) return
    const keep: DropAnim[] = []
    for (const a of this.dropAnims) {
      const t = (nowMs - a.startTime - a.delay * 1000) / (a.duration * 1000)
      if (t < 0) {
        keep.push(a)
        continue
      }
      if (t >= 1) {
        a.object.position.y = a.targetY
        continue
      }
      // easeOutCubic
      const k = 1 - Math.pow(1 - t, 3)
      a.object.position.y = a.startY + (a.targetY - a.startY) * k
      keep.push(a)
    }
    this.dropAnims = keep
  }

  private tickTod(nowMs: number) {
    if (!this._todAuto) return
    // 每秒推进 2 分钟 (30s = 1 hour, 12 min = 24 hours)
    const dt = nowMs - this._lastTodUpdate
    if (dt < 50) return
    this._todMinutes = (this._todMinutes + dt * 0.002) % 1440
    this._lastTodUpdate = nowMs
    this.updateSkyColor()
  }

  private updateSkyColor() {
    const m = this._todMinutes
    const t = (m / 1440) * Math.PI * 2
    // Day (600=10AM) to dusk (1080=6PM) to night (0=midnight) to dawn (360=6AM)
    const sr = 0.5 + 0.5 * Math.sin(t - Math.PI / 2) // 0=night → 1=day
    const r = 0.1 + 0.62 * sr
    const g = 0.1 + 0.76 * sr
    const b = 0.25 + 0.71 * sr
    this._skyColor.setRGB(r, g, b)
    if (this.scene) this.scene.background = this._skyColor
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
    const nowMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
    this.tickTod(nowMs)
    this.tickDrops(nowMs)
    this.tickClouds(nowMs)
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

  // ---- 天空云层 ----
  private _addClouds() {
    if (!this.scene) return
    this._cloudGroup = new THREE.Group()
    this._cloudGroup.name = 'cloudSky'
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      depthTest: false,
    })
    for (let i = 0; i < 8; i++) {
      const w = 0.8 + Math.random() * 2.5
      const h = 0.25 + Math.random() * 0.6
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
      plane.position.set(
        (Math.random() - 0.5) * 16,
        4.5 + Math.random() * 2,
        (Math.random() - 0.5) * 16,
      )
      plane.rotation.y = Math.random() * Math.PI * 2
      plane.userData.cloudDriftX = 0.02 + Math.random() * 0.06
      plane.userData.cloudDriftZ = 0.01 + Math.random() * 0.03
      this._cloudGroup!.add(plane)
    }
    this.scene.add(this._cloudGroup)
  }

  private tickClouds(_nowMs: number) {
    if (!this._cloudGroup) return
    for (const cloud of this._cloudGroup.children) {
      const ud = (cloud as any).userData
      if (ud?.cloudDriftX) cloud.position.x += ud.cloudDriftX * 16 / 1000
      if (ud?.cloudDriftZ) cloud.position.z += ud.cloudDriftZ * 16 / 1000
      // Wrap around
      if (cloud.position.x > 8) cloud.position.x = -8
      if (cloud.position.z > 8) cloud.position.z = -8
    }
  }
}

export default SceneManager
