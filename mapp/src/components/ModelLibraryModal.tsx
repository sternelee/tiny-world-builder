// -------- 模型库弹窗：3D 预览 + 放置 --------

import { Component, PropsWithChildren } from 'react'
import { View, Text, Canvas } from '@tarojs/components'
import { inject, observer } from 'mobx-react'
import { EditorStore } from '../store/editorStore'
import { TOOLS, ToolDef } from '../core/constants'
import { saveWorld } from '../services/WorldPersistence'
import { makeObject, CellNeighbors } from '../three/TileRenderer'
import { t } from '../i18n'
import Taro from '@tarojs/taro'
import * as THREE from 'three'

type PageProps = PropsWithChildren & {
  store?: { editorStore: EditorStore }
  visible: boolean
  onClose: () => void
}

const PREVIEW_TOOLS = ['house', 'tree', 'fence', 'rock', 'bridge', 'crop', 'pumpkin', 'cow', 'sheep', 'tuft', 'flower', 'bush']

const PREVIEW_LABELS: Record<string, string> = {
  house: t('obj.house'), tree: t('obj.tree'), fence: t('obj.fence'),
  rock: t('obj.rock'), bridge: t('obj.bridge'), crop: t('obj.crop'),
  pumpkin: t('obj.pumpkin'), cow: t('obj.cow'), sheep: t('obj.sheep'),
  tuft: t('obj.tuft'), flower: t('obj.flower'), bush: t('obj.bush'),
}

const PREVIEW_ICONS: Record<string, string> = {
  house: '🏠', tree: '🌳', fence: '⊞', rock: '🪨', bridge: '🌉',
  crop: '🌾', pumpkin: '🎃', cow: '🐄', sheep: '🐑',
  tuft: '🌱', flower: '🌸', bush: '🌿',
}

interface MCState {
  selected: ToolDef | null
  showPreview: boolean
  showSaveSlot: boolean
}

@inject('store')
@observer
class ModelLibraryModal extends Component<PageProps, MCState> {
  state: MCState = { selected: null, showPreview: false, showSaveSlot: false }

  // 3D 预览渲染器
  private _prevRenderer: THREE.WebGLRenderer | null = null
  private _prevScene: THREE.Scene | null = null
  private _prevCamera: THREE.PerspectiveCamera | null = null
  private _prevReady = false

  private async ensurePreviewRenderer() {
    if (this._prevReady) return
    return new Promise<void>((resolve) => {
      Taro.createSelectorQuery()
        .select('#model-preview-3d')
        .node((res: any) => {
          const canvas = res?.node
          if (!canvas) { resolve(); return }
          const dpr = Taro.getDeviceInfo?.()?.pixelRatio || 2
          canvas.width = 200 * dpr
          canvas.height = 200 * dpr
          this._prevRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
          this._prevRenderer!.setSize(200, 200)
          this._prevRenderer!.setPixelRatio(Math.min(dpr, 2))
          this._prevScene = new THREE.Scene()
          this._prevScene.add(new THREE.HemisphereLight(0x87ceeb, 0x3a7d44, 0.8))
          const sun = new THREE.DirectionalLight(0xffffff, 0.9)
          sun.position.set(3, 5, 4)
          this._prevScene.add(sun)
          this._prevCamera = new THREE.PerspectiveCamera(40, 1, 0.1, 100)
          this._prevCamera.position.set(1.5, 1.2, 1.5)
          this._prevCamera.lookAt(0, 0.15, 0)
          this._prevReady = true
          resolve()
        })
        .exec()
    })
  }

  private renderPreview(tool: ToolDef) {
    if (!this._prevRenderer || !this._prevScene || !this._prevCamera) return
    // 清除旧物体（保留灯光）
    for (const child of [...this._prevScene.children]) {
      if ((child as any).isGroup || (child as any).isMesh) this._prevScene.remove(child)
    }
    const neighbors: CellNeighbors = { n: false, s: false, e: false, w: false }
    const obj = makeObject(tool.kind || tool.id, undefined, neighbors)
    if (obj) {
      this._prevScene.add(obj)
      this._prevRenderer.render(this._prevScene, this._prevCamera)
    }
  }

  private select = async (tool: ToolDef) => {
    this.setState({ selected: tool, showPreview: true })
    await this.ensurePreviewRenderer()
    this.renderPreview(tool)
  }

  private closePreview = () => {
    this.setState({ showPreview: false, showSaveSlot: false })
  }

  private aiModify = () => {
    Taro.showToast({ title: 'AI 修改 — 即将推出', icon: 'none', duration: 1500 })
  }

  private placeOnWorld = () => {
    const { editorStore } = this.props.store!
    const { selected } = this.state
    if (!selected) return
    editorStore.setActiveTool(selected)
    this.props.onClose()
    Taro.showToast({ title: `已选中: ${selected.label}`, icon: 'success', duration: 1200 })
  }

  private showSavePicker = () => {
    this.setState({ showSaveSlot: true })
  }

  private saveToSlot = (slot: number) => {
    const { editorStore } = this.props.store!
    saveWorld(editorStore, slot)
    this.setState({ showSaveSlot: false, showPreview: false })
    Taro.showToast({ title: `已保存到 Slot ${slot + 1}`, icon: 'success', duration: 1500 })
  }

  render() {
    if (!this.props.visible) return null
    const { selected, showPreview, showSaveSlot } = this.state

    return (
      <View className='ml-backdrop' onClick={this.props.onClose}>
        <View className='ml-sheet' catchMove onClick={e => e.stopPropagation()}>
          {!showPreview ? (
            <>
              <View className='ml-grip' />
              <View className='ml-head'>
                <Text className='ml-title'>{t('library.title')}</Text>
                <Text className='ml-sub'>{t('library.subtitle')}</Text>
              </View>
              <View className='ml-grid'>
                {PREVIEW_TOOLS.map(id => {
                  const tool = TOOLS.find(t => t.id === id)
                  if (!tool) return null
                  return (
                    <View key={id} className='ml-card' onClick={() => this.select(tool)}>
                      <Text className='ml-card-icon'>{PREVIEW_ICONS[id] || '?'}</Text>
                      <Text className='ml-card-label'>{PREVIEW_LABELS[id] || tool.label}</Text>
                    </View>
                  )
                })}
              </View>
            </>
          ) : showSaveSlot ? (
            <>
              <View className='ml-head'>
                <Text className='ml-title'>{t('slot.title')}</Text>
              </View>
              <View className='ml-slot-list'>
                {['默认 Default', '世界 1', '世界 2', '世界 3', '世界 4'].map((name, i) => (
                  <View key={i} className='ml-slot' onClick={() => this.saveToSlot(i)}>
                    <Text className='ml-slot-num'>Slot {i + 1}</Text>
                    <Text className='ml-slot-name'>{name}</Text>
                  </View>
                ))}
              </View>
              <View className='ml-back-btn' onClick={this.closePreview}>
                <Text>返回</Text>
              </View>
            </>
          ) : selected && (
            <>
              <View className='ml-head'>
                <Text className='ml-title'>{PREVIEW_LABELS[selected.id] || selected.label}</Text>
              </View>
              <View className='ml-preview'>
                <Canvas
                  type='webgl'
                  id='model-preview-3d'
                  className='ml-preview-3d'
                  style='width:200px;height:200px'
                />
                <Text className='ml-preview-label'>{t('library.tapToPlace')}</Text>
                <Text className='ml-preview-label'>{selected.terrain ? `${t('library.terrain')}: ${selected.terrain}` : selected.kind ? `${t('library.object')}: ${selected.kind}` : ''}</Text>
              </View>
              <View className='ml-actions'>
                <View className='ml-btn primary' onClick={this.placeOnWorld}>
                  <Text className='ml-btn-text'>{t('library.place')}</Text>
                </View>
                <View className='ml-btn' onClick={this.aiModify}>
                  <Text className='ml-btn-text'>{t('library.ai')}</Text>
                </View>
                <View className='ml-btn' onClick={this.showSavePicker}>
                  <Text className='ml-btn-text'>{t('library.save')}</Text>
                </View>
                <View className='ml-btn cancel' onClick={this.closePreview}>
                  <Text className='ml-btn-text'>{t('library.close')}</Text>
                </View>
              </View>
            </>
          )}
        </View>
      </View>
    )
  }
}

export default ModelLibraryModal
