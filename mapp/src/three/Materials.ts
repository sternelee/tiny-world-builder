// -------- 材质系统 — 从浏览器引擎 03-geometry-materials.js 提取 --------
// 只包含核心材质，后续再扩充

import * as THREE from 'three'

export const M = {
  // ---- terrain ----
  grass:     new THREE.MeshLambertMaterial({ color: 0x6f9e30 }),
  grassEdge: new THREE.MeshLambertMaterial({ color: 0x5c8a2b }),
  grassHi:   new THREE.MeshLambertMaterial({ color: 0x7eab38 }),
  grassFlower: new THREE.MeshLambertMaterial({ color: 0xf2c849 }),

  dirt:      new THREE.MeshLambertMaterial({ color: 0x7d4519 }),
  dirtRich:  new THREE.MeshLambertMaterial({ color: 0x462b15 }),

  path:      new THREE.MeshLambertMaterial({ color: 0xf2d29c }),
  pathTrim:  new THREE.MeshLambertMaterial({ color: 0xd9b780 }),
  pathScuff: new THREE.MeshLambertMaterial({ color: 0xc9aa70 }),

  water:     new THREE.MeshLambertMaterial({ color: 0x3a8fcc }),
  waterDk:   new THREE.MeshLambertMaterial({ color: 0x2f77ad }),
  waterFoam: new THREE.MeshLambertMaterial({ color: 0xeaf7ff }),
  shore:     new THREE.MeshLambertMaterial({ color: 0xd8c18a }),

  stone:     new THREE.MeshLambertMaterial({ color: 0x8f8a82 }),
  stoneDk:   new THREE.MeshLambertMaterial({ color: 0x5e5a52 }),

  lava:      new THREE.MeshLambertMaterial({ color: 0xe7592b, emissive: 0xb02410, emissiveIntensity: 0.8 }),
  lavaCrust: new THREE.MeshLambertMaterial({ color: 0x3a201a }),

  sand:      new THREE.MeshLambertMaterial({ color: 0xe6cc7c }),
  sandDk:    new THREE.MeshLambertMaterial({ color: 0xc6a64b }),

  snow:      new THREE.MeshLambertMaterial({ color: 0xf2f5fa }),
  snowDk:    new THREE.MeshLambertMaterial({ color: 0xc9d1dc }),

  // ---- objects ----
  trunk:     new THREE.MeshLambertMaterial({ color: 0x5c3818 }),
  leaves:    new THREE.MeshLambertMaterial({ color: 0x5f9e28 }),
  leavesDk:  new THREE.MeshLambertMaterial({ color: 0x47781c }),

  rock:      new THREE.MeshLambertMaterial({ color: 0x9b9a8f }),
  rockDk:    new THREE.MeshLambertMaterial({ color: 0x707066 }),
  rockHi:    new THREE.MeshLambertMaterial({ color: 0xc3c0b2 }),

  fence:     new THREE.MeshLambertMaterial({ color: 0x8b7042 }),
  fencePost: new THREE.MeshLambertMaterial({ color: 0x6d5230 }),
  fenceRail: new THREE.MeshLambertMaterial({ color: 0x9a7e4e }),

  bridgeWood:  new THREE.MeshLambertMaterial({ color: 0x8b5a32 }),
  bridgeWoodD: new THREE.MeshLambertMaterial({ color: 0x5f3a20 }),

  // ---- house ----
  wallCream: new THREE.MeshLambertMaterial({ color: 0xf2dfb0 }),
  wallTrim:  new THREE.MeshLambertMaterial({ color: 0xe5cf99 }),
  roofBlue:  new THREE.MeshLambertMaterial({ color: 0x2a6dd1 }),
  roofBlueD: new THREE.MeshLambertMaterial({ color: 0x1d4d9c }),
  door:      new THREE.MeshLambertMaterial({ color: 0x7a4a2e }),
  woodTrim:  new THREE.MeshLambertMaterial({ color: 0x5c3818 }),
  windowB:   new THREE.MeshLambertMaterial({ color: 0x2a6dd1 }),
  chimney:   new THREE.MeshLambertMaterial({ color: 0xc9c4ba }),
  step:      new THREE.MeshLambertMaterial({ color: 0xa9a49a }),

  // ---- animals ----
  cowWhite:  new THREE.MeshLambertMaterial({ color: 0xf5f0e8 }),
  cowSpot:   new THREE.MeshLambertMaterial({ color: 0x2a2018 }),
  cowPink:   new THREE.MeshLambertMaterial({ color: 0xd98a8a }),
  sheepWhite: new THREE.MeshLambertMaterial({ color: 0xf8f5ee }),
  sheepFace: new THREE.MeshLambertMaterial({ color: 0xd4caba }),

  // ---- crop ----
  cropGreen: new THREE.MeshLambertMaterial({ color: 0x5fa828 }),
  cropYellow: new THREE.MeshLambertMaterial({ color: 0xd4b830 }),
  pumpkin:   new THREE.MeshLambertMaterial({ color: 0xe87220 }),
  pumpkinStem: new THREE.MeshLambertMaterial({ color: 0x3a6030 }),
  carrotTop: new THREE.MeshLambertMaterial({ color: 0x4a8a28 }),
  carrotBody: new THREE.MeshLambertMaterial({ color: 0xe89030 }),
  sunflowerCenter: new THREE.MeshLambertMaterial({ color: 0x5a3018 }),
  sunflowerPetal: new THREE.MeshLambertMaterial({ color: 0xf0c82a }),
  flower:    new THREE.MeshLambertMaterial({ color: 0xe8478a }),
  flowerCenter: new THREE.MeshLambertMaterial({ color: 0xe8c82a }),
  bush:      new THREE.MeshLambertMaterial({ color: 0x4a8a30 }),

  // ---- selection ----
  selectHighlight: new THREE.MeshBasicMaterial({
    color: 0x3a72c8, transparent: true, opacity: 0.35, depthWrite: false,
  }),
  hoverHighlight: new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false,
  }),
} as const

export type MaterialKey = keyof typeof M

/** 根据地形名获取材质组 */
export function terrainVoxelMaterials(terrain: string) {
  const m = M as Record<string, THREE.Material>
  if (terrain === 'path') return { base: m.path, hi: m.path, low: m.pathTrim, edge: m.pathTrim, scuff: m.pathScuff }
  if (terrain === 'water') return { base: m.water, hi: m.water, low: m.waterDk, edge: m.waterFoam, scuff: m.waterDk }
  if (terrain === 'dirt') return { base: m.dirtRich, hi: m.dirtRich, low: m.dirtRich, edge: m.dirt, scuff: m.dirt }
  if (terrain === 'stone') return { base: m.stone, hi: m.stone, low: m.stoneDk, edge: m.stoneDk, scuff: m.stone }
  if (terrain === 'lava') return { base: m.lava, hi: m.lava, low: m.lavaCrust, edge: m.lavaCrust, scuff: m.lavaCrust }
  if (terrain === 'sand') return { base: m.sand, hi: m.sand, low: m.sandDk, edge: m.sandDk, scuff: m.sandDk }
  if (terrain === 'snow') return { base: m.snow, hi: m.snow, low: m.snowDk, edge: m.snowDk, scuff: m.snowDk }
  return { base: m.grass, hi: m.grassHi, low: m.grass, edge: m.grassEdge, scuff: m.grass }
}
