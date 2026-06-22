// -------- 射线拾取器 — touch → Three.js ray → grid cell --------

import * as THREE from 'three'

interface HitResult {
  x: number
  z: number
  point: THREE.Vector3
  distance: number
}

/**
 * 触摸位置 → 拾取地面格子
 * camera: 当前相机
 * touchX, touchY: 触摸坐标（px）
 * canvasWidth, canvasHeight: canvas 尺寸
 * groundObjects: 可拾取的地面物体列表
 * grid: 网格尺寸
 */
export function raycastCell(
  camera: THREE.Camera,
  touchX: number,
  touchY: number,
  canvasWidth: number,
  canvasHeight: number,
  scene: THREE.Scene,
  grid: number,
): HitResult | null {
  // 归一化坐标
  const nx = (touchX / canvasWidth) * 2 - 1
  const ny = -(touchY / canvasHeight) * 2 + 1

  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2(nx, ny)
  raycaster.setFromCamera(pointer, camera)

  // 拾取所有场景物体
  const meshes: THREE.Object3D[] = []
  scene.traverse(obj => {
    if (obj.isMesh) meshes.push(obj)
  })

  const hits = raycaster.intersectObjects(meshes, false)
  if (hits.length === 0) return null

  const hit = hits[0]
  const p = hit.point

  // 世界坐标 → 格子坐标
  const cx = Math.round(p.x + (grid - 1) / 2 - 0.5)
  const cz = Math.round(p.z + (grid - 1) / 2 - 0.5)

  if (cx < 0 || cx >= grid || cz < 0 || cz >= grid) return null

  return { x: cx, z: cz, point: p, distance: hit.distance }
}

/**
 * 桌面模拟：从世界坐标算格子（无需 raycast）
 */
export function worldToCell(
  worldX: number, worldZ: number,
  grid: number,
): { x: number; z: number } | null {
  const cx = Math.round(worldX + grid / 2 - 0.5)
  const cz = Math.round(worldZ + grid / 2 - 0.5)
  if (cx < 0 || cx >= grid || cz < 0 || cz >= grid) return null
  return { x: cx, z: cz }
}

/**
 * 获取触摸位置的世界射线
 */
export function getTouchRay(
  camera: THREE.Camera,
  touchX: number, touchY: number,
  canvasWidth: number, canvasHeight: number,
): THREE.Ray {
  const nx = (touchX / canvasWidth) * 2 - 1
  const ny = -(touchY / canvasHeight) * 2 + 1
  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera)
  return raycaster.ray
}
