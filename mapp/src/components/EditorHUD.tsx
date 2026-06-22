// -------- 编辑器 HUD：世界名称 + 网格尺寸 + 快捷操作 --------

import { Component, PropsWithChildren } from 'react'
import { View, Text, Picker } from '@tarojs/components'
import { inject, observer } from 'mobx-react'
import { EditorStore } from '../store/editorStore'
import { HOME_GRID_OPTIONS } from '../core/constants'

type PageProps = PropsWithChildren & {
  store?: { editorStore: EditorStore }
  onGridChange?: (size: number) => void
  onReset?: () => void
  onClear?: () => void
  onToggleCamera?: () => void
  onToggleToolbar?: () => void
  onLoadPreset?: () => void
  onSave?: () => void
  onLoad?: () => void
  onExport?: () => void
  onImport?: () => void
}

@inject('store')
@observer
class EditorHUD extends Component<PageProps> {
  private onGridPickerChange = (e: any) => {
    const val = parseInt(e.detail.value, 10)
    if (!isNaN(val) && this.props.onGridChange) {
      this.props.onGridChange(val)
    }
  }

  render() {
    const { editorStore } = this.props.store!
    const { onReset, onClear, onToggleCamera, onToggleToolbar, onSave, onLoad, onExport, onImport } = this.props

    return (
      <View className='editor-hud'>
        {/* 左: 世界名称 + 网格尺寸 */}
        <View className='hud-left'>
          <Text className='hud-worldname'>Tiny World</Text>
          <Picker
            mode='selector'
            range={HOME_GRID_OPTIONS.map(s => `${s}×${s}`)}
            value={HOME_GRID_OPTIONS.indexOf(editorStore.grid)}
            onChange={this.onGridPickerChange}
          >
            <View className='hud-gridsize'>
              <Text className='hud-gridsize-label'>{editorStore.grid}×{editorStore.grid}</Text>
              <Text className='hud-gridsize-arrow'>▼</Text>
            </View>
          </Picker>
        </View>

        {/* 右: 快捷按钮 */}
        <View className='hud-right'>
          <View className='hud-btn' onClick={onToggleCamera}>
            <Text className='hud-btn-icon'>
              {editorStore.cameraMode === 'isometric' ? '◇' : '◈'}
            </Text>
          </View>
          <View className='hud-btn' onClick={onSave}>
            <Text className='hud-btn-icon'>💾</Text>
          </View>
          <View className='hud-btn' onClick={onLoad}>
            <Text className='hud-btn-icon'>📂</Text>
          </View>
          <View className='hud-btn' onClick={onExport}>
            <Text className='hud-btn-icon'>📤</Text>
          </View>
          <View className='hud-btn' onClick={onImport}>
            <Text className='hud-btn-icon'>📥</Text>
          </View>
          <View className='hud-btn' onClick={onClear}>
            <Text className='hud-btn-icon'>⌫</Text>
          </View>
          <View className='hud-btn' onClick={onReset}>
            <Text className='hud-btn-icon'>↺</Text>
          </View>
          <View className='hud-btn' onClick={onLoadPreset}>
            <Text className='hud-btn-icon'>🏘</Text>
          </View>
          <View className='hud-btn hud-btn-tools' onClick={onToggleToolbar}>
            <Text className='hud-btn-icon'>☰</Text>
          </View>
        </View>
      </View>
    )
  }
}

export default EditorHUD
