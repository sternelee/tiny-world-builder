// -------- 底部工具栏 — 普通 View 布局（canvas 之外）--------

import { Component, PropsWithChildren } from 'react'
import { View, Text } from '@tarojs/components'
import { inject, observer } from 'mobx-react'
import { EditorStore } from '../store/editorStore'
import { ToolDef, TOOLS } from '../core/constants'

type PageProps = PropsWithChildren & {
  store?: { editorStore: EditorStore }
  onRaise?: () => void
  onLower?: () => void
  onEraser?: () => void
  onUndo?: () => void
  onRedo?: () => void
  onMore?: () => void
}

const QUICK_TOOLS = ['grass', 'path', 'water', 'house', 'tree', 'fence', 'rock', 'bridge', 'crop', 'flower']

const ICONS: Record<string, string> = {
  grass: 'G', path: 'P', water: 'W',
  house: 'H', tree: 'T', fence: 'F', rock: 'R', bridge: 'B',
  crop: 'C', flower: 'FL',
}

@inject('store')
@observer
class Toolbar extends Component<PageProps> {
  render() {
    const { editorStore } = this.props.store!
    const { onRaise, onLower, onEraser, onUndo, onRedo, onMore } = this.props
    const activeId = editorStore.activeTool?.id
    // 当前选中工具不在 quick 列表里 → 显示在 More 按钮上
    const showInMore = !!activeId && !QUICK_TOOLS.includes(activeId) && activeId !== '__eraser__'

    return (
      <View className='toolbar'>
        <View className='tb-row'>
          <View className={`tb-btn ${activeId === '__eraser__' ? 'active' : ''}`} onClick={onEraser}>
            <Text className='tb-icon'>E</Text>
          </View>
          <View className='tb-btn' onClick={onRaise}><Text className='tb-icon'>+</Text></View>
          <View className='tb-btn' onClick={onLower}><Text className='tb-icon'>-</Text></View>
          <View className='tb-sep' />
          <View className={`tb-btn ${editorStore.canUndo ? '' : 'disabled'}`} onClick={editorStore.canUndo ? onUndo : undefined}>
            <Text className='tb-icon'>U</Text>
          </View>
          <View className={`tb-btn ${editorStore.canRedo ? '' : 'disabled'}`} onClick={editorStore.canRedo ? onRedo : undefined}>
            <Text className='tb-icon'>R</Text>
          </View>
        </View>

        <View className='tb-row'>
          {QUICK_TOOLS.map(id => {
            const tool = TOOLS.find(t => t.id === id)
            if (!tool) return null
            return (
              <View
                key={id}
                className={`tb-btn ${activeId === id ? 'active' : ''}`}
                onClick={() => {
                  if (activeId === id) editorStore.setActiveTool(null)
                  else editorStore.setActiveTool(tool)
                }}
              >
                <Text className='tb-icon'>{ICONS[id] || '?'}</Text>
              </View>
            )
          })}
          <View
            className={`tb-btn more ${showInMore ? 'active' : ''}`}
            onClick={onMore}
          >
            <Text className='tb-icon'>{showInMore ? (activeId!.slice(0, 2).toUpperCase()) : '···'}</Text>
          </View>
        </View>
      </View>
    )
  }
}

export default Toolbar
