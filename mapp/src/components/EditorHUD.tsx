// -------- 编辑器 HUD — 简化 CoverView 版 --------

import { Component, PropsWithChildren } from 'react'
import { CoverView, Text, Picker } from '@tarojs/components'
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
    const { onReset, onClear, onToggleCamera, onToggleToolbar, onSave, onLoad, onExport, onImport, onLoadPreset } = this.props

    return (
      <CoverView>
        <CoverView className='hud-topbar' />
        <Text className='hud-title'>Tiny World</Text>
        <Picker
          mode='selector'
          range={HOME_GRID_OPTIONS.map(s => `${s}×${s}`)}
          value={HOME_GRID_OPTIONS.indexOf(editorStore.grid)}
          onChange={this.onGridPickerChange}
        >
          <CoverView className='hud-gridsize'>
            <Text className='hud-gridsize-label'>{editorStore.grid}×{editorStore.grid}</Text>
          </CoverView>
        </Picker>

        <CoverView className='hud-right'>
          <CoverView className='hud-btn' onClick={onToggleCamera}>
            <Text className='hud-btn-icon'>{editorStore.cameraMode === 'isometric' ? '◇' : '◈'}</Text>
          </CoverView>
          <CoverView className='hud-btn' onClick={onSave}><Text className='hud-btn-icon'>💾</Text></CoverView>
          <CoverView className='hud-btn' onClick={onLoad}><Text className='hud-btn-icon'>📂</Text></CoverView>
          <CoverView className='hud-btn' onClick={onLoadPreset}><Text className='hud-btn-icon'>🏘</Text></CoverView>
        </CoverView>
      </CoverView>
    )
  }
}

export default EditorHUD
