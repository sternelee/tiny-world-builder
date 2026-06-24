// -------- 模型库弹窗：图标预览 + AI 修改 + 保存选项目 --------

import { Component, PropsWithChildren } from 'react'
import { View, Text, CoverView } from '@tarojs/components'
import { inject, observer } from 'mobx-react'
import { EditorStore } from '../store/editorStore'
import { TOOLS, ToolDef } from '../core/constants'
import { saveWorld } from '../services/WorldPersistence'
import Taro from '@tarojs/taro'

type PageProps = PropsWithChildren & {
  store?: { editorStore: EditorStore }
  visible: boolean
  onClose: () => void
}

const PREVIEW_TOOLS = ['house', 'tree', 'fence', 'rock', 'bridge', 'crop', 'pumpkin', 'cow', 'sheep', 'tuft', 'flower', 'bush']

const PREVIEW_LABELS: Record<string, string> = {
  house: '房屋 House', tree: '树木 Tree', fence: '围栏 Fence',
  rock: '岩石 Rock', bridge: '桥梁 Bridge', crop: '作物 Crop',
  pumpkin: '南瓜 Pumpkin', cow: '奶牛 Cow', sheep: '绵羊 Sheep',
  tuft: '草簇 Tuft', flower: '花朵 Flower', bush: '灌木 Bush',
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

  private select = (tool: ToolDef) => {
    this.setState({ selected: tool, showPreview: true })
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
                <Text className='ml-title'>模型库</Text>
                <Text className='ml-sub'>选择一个物体预览或放置</Text>
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
                <Text className='ml-title'>选择存档槽位</Text>
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
                <Text className='ml-preview-icon'>{PREVIEW_ICONS[selected.id] || '?'}</Text>
                <Text className='ml-preview-label'>点击画布放置此物体</Text>
                <Text className='ml-preview-label'>类型: {selected.terrain ? `${selected.terrain} 地形` : selected.kind ? `${selected.kind} 物体` : '工具'}</Text>
              </View>
              <View className='ml-actions'>
                <View className='ml-btn primary' onClick={this.placeOnWorld}>
                  <Text className='ml-btn-text'>放置到场景</Text>
                </View>
                <View className='ml-btn' onClick={this.aiModify}>
                  <Text className='ml-btn-text'>AI 修改</Text>
                </View>
                <View className='ml-btn' onClick={this.showSavePicker}>
                  <Text className='ml-btn-text'>保存到项目</Text>
                </View>
                <View className='ml-btn cancel' onClick={this.closePreview}>
                  <Text className='ml-btn-text'>关闭</Text>
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
