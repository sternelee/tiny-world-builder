// -------- 底部工具栏 — 工具 + 动作按钮 --------

import { Component, PropsWithChildren } from 'react'
import { CoverView, ScrollView, Text } from '@tarojs/components'
import { inject, observer } from 'mobx-react'
import { EditorStore } from '../store/editorStore'
import { ToolDef, getToolGroups } from '../core/constants'

type PageProps = PropsWithChildren & {
  store?: { editorStore: EditorStore }
  onRaise?: () => void
  onLower?: () => void
  onEraser?: () => void
  onUndo?: () => void
  onRedo?: () => void
}

@inject('store')
@observer
class Toolbar extends Component<PageProps> {
  private selectTool = (tool: ToolDef) => {
    const { editorStore } = this.props.store!
    if (editorStore.activeTool?.id === tool.id) {
      editorStore.setActiveTool(null)
    } else {
      editorStore.setActiveTool(tool)
    }
  }

  render() {
    const { editorStore } = this.props.store!
    const { onRaise, onLower, onEraser, onUndo, onRedo } = this.props
    const groups = getToolGroups()
    const activeId = editorStore.activeTool?.id

    return (
      <CoverView className='toolbar'>
        <ScrollView scrollX className='toolbar-scroll'>
          {/* 动作按钮组 */}
          <CoverView className='tool-group'>
            <CoverView
              className={`tool-btn action-btn ${activeId === '__eraser__' ? 'active danger' : ''}`}
              onClick={onEraser}
            >
              <Text className='tool-icon'>⊘</Text>
              <Text className='tool-label'>Erase</Text>
            </CoverView>
            <CoverView className='tool-btn action-btn' onClick={onRaise}>
              <Text className='tool-icon'>↑</Text>
              <Text className='tool-label'>Raise</Text>
            </CoverView>
            <CoverView className='tool-btn action-btn' onClick={onLower}>
              <Text className='tool-icon'>↓</Text>
              <Text className='tool-label'>Lower</Text>
            </CoverView>
            <CoverView className='tool-sep' />
            <CoverView
              className={`tool-btn action-btn ${editorStore.canUndo ? '' : 'disabled'}`}
              onClick={editorStore.canUndo ? onUndo : undefined}
            >
              <Text className='tool-icon'>↩</Text>
              <Text className='tool-label'>Undo</Text>
            </CoverView>
            <CoverView
              className={`tool-btn action-btn ${editorStore.canRedo ? '' : 'disabled'}`}
              onClick={editorStore.canRedo ? onRedo : undefined}
            >
              <Text className='tool-icon'>↪</Text>
              <Text className='tool-label'>Redo</Text>
            </CoverView>
          </CoverView>

          <CoverView className='tool-sep-v' />

          {/* 工具分组 */}
          {Object.entries(groups).map(([groupName, tools]) => (
            <CoverView key={groupName} className='tool-group'>
              <Text className='tool-group-label'>{groupName}</Text>
              <CoverView className='tool-items'>
                {tools.map(tool => (
                  <CoverView
                    key={tool.id}
                    className={`tool-btn ${activeId === tool.id ? 'active' : ''}`}
                    onClick={() => this.selectTool(tool)}
                  >
                    <Text className='tool-icon'>{toolIcon(tool)}</Text>
                    <Text className='tool-label'>{tool.label}</Text>
                  </CoverView>
                ))}
              </CoverView>
            </CoverView>
          ))}
        </ScrollView>
      </CoverView>
    )
  }
}

function toolIcon(tool: ToolDef): string {
  const icons: Record<string, string> = {
    grass: '⛰', path: '▬', dirt: '●',
    water: '🌊', stone: '◆', lava: '🔥',
    sand: '◈', snow: '❄',
    house: '🏠', tree: '🌳', fence: '⊞',
    rock: '🪨', bridge: '🌉',
    crop: '🌾', corn: '🌽', wheat: '🌾',
    pumpkin: '🎃', carrot: '🥕', sunflower: '🌻',
    tuft: '🌱', flower: '🌸', bush: '🌿',
    cow: '🐄', sheep: '🐑',
  }
  return icons[tool.id] || '○'
}

export default Toolbar
