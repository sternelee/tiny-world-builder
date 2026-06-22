// -------- 编辑器 HUD — Picker 分离出 CoverView --------

import { Component, PropsWithChildren } from 'react'
import { CoverView, Text } from '@tarojs/components'
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
  private cycleGrid = () => {
    const { editorStore, onGridChange } = this.props
    if (!editorStore || !onGridChange) return
    const idx = HOME_GRID_OPTIONS.indexOf(editorStore.grid)
    const nextIdx = (idx + 1) % HOME_GRID_OPTIONS.length
    onGridChange(HOME_GRID_OPTIONS[nextIdx])
  }

  render() {
    const { editorStore } = this.props.store!
    const { onToggleCamera, onSave, onLoad, onLoadPreset } = this.props

    return (
      <CoverView>
        <CoverView className='hud-bar' />
        <Text className='hud-title'>Tiny World</Text>

        {/* Grid size — CoverView onClick, cycles through options */}
        <CoverView className='hud-gridsize' onClick={this.cycleGrid}>
          <Text className='hud-gridsize-label'>{editorStore.grid}&times;{editorStore.grid}</Text>
        </CoverView>

        {/* Right buttons */}
        <CoverView className='hud-btns'>
          <CoverView className='hud-btn' onClick={onToggleCamera}>
            <Text className='hud-btn-icon'>{editorStore.cameraMode === 'isometric' ? 'I' : 'P'}</Text>
          </CoverView>
          <CoverView className='hud-btn' onClick={onSave}><Text className='hud-btn-icon'>S</Text></CoverView>
          <CoverView className='hud-btn' onClick={onLoad}><Text className='hud-btn-icon'>L</Text></CoverView>
          <CoverView className='hud-btn' onClick={onLoadPreset}><Text className='hud-btn-icon'>P</Text></CoverView>
        </CoverView>
      </CoverView>
    )
  }
}

export default EditorHUD
