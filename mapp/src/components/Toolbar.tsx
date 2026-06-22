// -------- 底部工具栏 — CoverView 简化版 --------

import { Component, PropsWithChildren } from 'react'
import { CoverView, Text } from '@tarojs/components'
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
}

const QUICK_TOOLS = ['grass', 'house', 'tree', 'fence', 'rock', 'bridge', 'crop', 'tuft', 'flower', 'cow']

@inject('store')
@observer
class Toolbar extends Component<PageProps> {
  render() {
    const { editorStore } = this.props.store!
    const { onRaise, onLower, onEraser, onUndo, onRedo } = this.props
    const activeId = editorStore.activeTool?.id

    return (
      <CoverView className='toolbar'>
        {/* 动作行 */}
        <CoverView className='toolbar-row'>
          <CoverView
            className={`tb-btn ${activeId === '__eraser__' ? 'active' : ''}`}
            onClick={onEraser}
          >
            <Text className='tb-icon'>E</Text>
          </CoverView>
          <CoverView className='tb-btn' onClick={onRaise}>
            <Text className='tb-icon'>+</Text>
          </CoverView>
          <CoverView className='tb-btn' onClick={onLower}>
            <Text className='tb-icon'>-</Text>
          </CoverView>
          <CoverView className='tb-sep' />
          <CoverView
            className={`tb-btn ${editorStore.canUndo ? '' : 'disabled'}`}
            onClick={editorStore.canUndo ? onUndo : undefined}
          >
            <Text className='tb-icon'>U</Text>
          </CoverView>
          <CoverView
            className={`tb-btn ${editorStore.canRedo ? '' : 'disabled'}`}
            onClick={editorStore.canRedo ? onRedo : undefined}
          >
            <Text className='tb-icon'>R</Text>
          </CoverView>
        </CoverView>

        {/* 工具行 */}
        <CoverView className='toolbar-row'>
          {QUICK_TOOLS.map(id => {
            const tool = TOOLS.find(t => t.id === id)
            if (!tool) return null
            return (
              <CoverView
                key={id}
                className={`tb-btn ${activeId === id ? 'active' : ''}`}
                onClick={() => {
                  if (activeId === id) editorStore.setActiveTool(null)
                  else editorStore.setActiveTool(tool)
                }}
              >
                <Text className='tb-icon'>{TICONS[id] || '?'}</Text>
              </CoverView>
            )
          })}
        </CoverView>
      </CoverView>
    )
  }
}

const TICONS: Record<string, string> = {
  grass: 'G', path: 'P', dirt: 'D',
  water: 'W', stone: 'S', lava: 'L',
  sand: 'SD', snow: 'SN',
  house: 'H', tree: 'T', fence: 'F',
  rock: 'R', bridge: 'B',
  crop: 'C', corn: 'CN', wheat: 'WH',
  pumpkin: 'PK', carrot: 'CR', sunflower: 'SF',
  tuft: 'TF', flower: 'FL', bush: 'BS',
  cow: 'CW', sheep: 'SH',
}

export default Toolbar
