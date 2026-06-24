// -------- 完整工具面板（底部弹出抽屉）--------

import { Component, PropsWithChildren } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import { inject, observer } from 'mobx-react'
import { EditorStore } from '../store/editorStore'
import { TOOLS, ToolDef, getToolGroups } from '../core/constants'

type PageProps = PropsWithChildren & {
  store?: { editorStore: EditorStore }
  visible: boolean
  onClose: () => void
}

const GROUP_LABELS: Record<string, string> = {
  terrain: '地形 Terrain',
  objects: '物体 Objects',
  crops: '作物 Crops',
  plants: '植物 Plants',
  animals: '动物 Animals',
}

const ICONS: Record<string, string> = {
  grass: 'G', path: 'P', dirt: 'D', water: 'W',
  stone: 'S', lava: 'LV', sand: 'SD', snow: 'SN',
  house: 'H', tree: 'T', fence: 'F', rock: 'R', bridge: 'B',
  crop: 'C', corn: 'CN', wheat: 'WH', pumpkin: 'PK',
  carrot: 'CR', sunflower: 'SF',
  tuft: 'TF', flower: 'FL', bush: 'BS',
  cow: 'CW', sheep: 'SH',
}

@inject('store')
@observer
class ToolPaletteModal extends Component<PageProps> {
  private pickTool = (tool: ToolDef) => {
    const { editorStore } = this.props.store!
    editorStore.setActiveTool(tool)
    this.props.onClose()
  }

  render() {
    if (!this.props.visible) return null
    const { editorStore } = this.props.store!
    const activeId = editorStore.activeTool?.id
    const groups = getToolGroups()
    const groupOrder = ['terrain', 'objects', 'crops', 'plants', 'animals']

    return (
      <View className='tp-backdrop' onClick={this.props.onClose}>
        <View className='tp-sheet' catchMove>
          <View className='tp-grip' />
          <View className='tp-head'>
            <Text className='tp-title'>选择工具</Text>
            <View className='tp-close' onClick={this.props.onClose}>
              <Text className='tp-close-icon'>×</Text>
            </View>
          </View>
          <ScrollView scrollY className='tp-scroll'>
            {groupOrder.map(gk => {
              const tools = groups[gk]
              if (!tools?.length) return null
              return (
                <View key={gk} className='tp-group'>
                  <Text className='tp-group-label'>{GROUP_LABELS[gk] || gk}</Text>
                  <View className='tp-tools'>
                    {tools.map(tool => (
                      <View
                        key={tool.id}
                        className={`tp-tool ${activeId === tool.id ? 'active' : ''}`}
                        onClick={() => this.pickTool(tool)}
                      >
                        <Text className='tp-tool-icon'>{ICONS[tool.id] || '?'}</Text>
                        <Text className='tp-tool-label'>{tool.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )
            })}
          </ScrollView>
        </View>
      </View>
    )
  }
}

export default ToolPaletteModal
