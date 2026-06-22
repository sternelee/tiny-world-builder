// -------- 底部工具栏组件 --------

import { Component, PropsWithChildren } from 'react'
import { View, ScrollView, Text } from '@tarojs/components'
import { inject, observer } from 'mobx-react'
import { EditorStore } from '../store/editorStore'
import { ToolDef, TOOLS, getToolGroups } from '../core/constants'

type PageProps = PropsWithChildren & {
  store?: { editorStore: EditorStore }
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
    const groups = getToolGroups()
    const activeId = editorStore.activeTool?.id

    return (
      <View className='toolbar'>
        <ScrollView scrollX className='toolbar-scroll'>
          {Object.entries(groups).map(([groupName, tools]) => (
            <View key={groupName} className='tool-group'>
              <Text className='tool-group-label'>{groupName}</Text>
              <View className='tool-items'>
                {tools.map(tool => (
                  <View
                    key={tool.id}
                    className={`tool-btn ${activeId === tool.id ? 'active' : ''}`}
                    onClick={() => this.selectTool(tool)}
                  >
                    <Text className='tool-icon'>{toolIcon(tool)}</Text>
                    <Text className='tool-label'>{tool.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    )
  }
}

function toolIcon(tool: ToolDef): string {
  const icons: Record<string, string> = {
    grass: '\u{1F3F4}', path: '\u{2B1D}', dirt: '\u{1F7E5}',
    water: '\u{1F4E7}', stone: '\u{1F7E3}', lava: '\u{1F525}',
    sand: '\u{1F7E8}', snow: '\u{26C4}',
    house: '\u{1F3E0}', tree: '\u{1F333}', fence: '\u{1F9F1}',
    rock: '\u{1FAA8}', bridge: '\u{1F309}',
    crop: '\u{1F33E}', corn: '\u{1F33D}', wheat: '\u{1F33E}',
    pumpkin: '\u{1F383}', carrot: '\u{1F955}', sunflower: '\u{1F33B}',
    tuft: '\u{1F331}', flower: '\u{1F338}', bush: '\u{1FAB4}',
    cow: '\u{1F404}', sheep: '\u{1F411}',
  }
  return icons[tool.id] || '\u{2B55}'
}

export default Toolbar
