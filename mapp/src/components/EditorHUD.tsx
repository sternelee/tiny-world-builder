// -------- 编辑器 HUD — Picker 分离出 CoverView --------

import { Component, PropsWithChildren } from 'react'
import { CoverView, Text, Picker, View } from '@tarojs/components'
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
    const { onToggleCamera, onSave, onLoad, onLoadPreset } = this.props
    const gridIdx = Math.max(0, HOME_GRID_OPTIONS.indexOf(editorStore.grid))

    return (
      <CoverView className='hud-bar'>
        {/* Title */}
        <Text className='hud-title'>Tiny World</Text>

        {/* Right buttons */}
        <CoverView className='hud-btns'>
          <CoverView className='hud-btn' onClick={onToggleCamera}>
            <Text className='hud-btn-icon'>{editorStore.cameraMode === 'isometric' ? '◇' : '◈'}</Text>
          </CoverView>
          <CoverView className='hud-btn' onClick={onSave}><Text className='hud-btn-icon'>S</Text></CoverView>
          <CoverView className='hud-btn' onClick={onLoad}><Text className='hud-btn-icon'>L</Text></CoverView>
          <CoverView className='hud-btn' onClick={onLoadPreset}><Text className='hud-btn-icon'>P</Text></CoverView>
        </CoverView>

        {/* Picker must be OUTSIDE CoverView — picker not valid child of cover-view */}
        <View className='hud-picker-wrap'>
          <Picker
            mode='selector'
            range={HOME_GRID_OPTIONS.map(s => `${s}×${s}`)}
            value={gridIdx}
            onChange={this.onGridPickerChange}
          >
            <Text className='hud-gridsize-label'>{editorStore.grid}×{editorStore.grid}</Text>
          </Picker>
        </View>
      </CoverView>
    )
  }
}

export default EditorHUD
