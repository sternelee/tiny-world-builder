// -------- 编辑器 HUD — 汉堡菜单（折叠）--------

import { Component, PropsWithChildren } from 'react'
import { CoverView, Text } from '@tarojs/components'
import { inject, observer } from 'mobx-react'
import { EditorStore } from '../store/editorStore'
import { HOME_GRID_OPTIONS } from '../core/constants'

type PageProps = PropsWithChildren & {
  store?: { editorStore: EditorStore }
  onGridChange?: (size: number) => void
  onToggleCamera?: () => void
  onSave?: () => void
  onLoad?: () => void
  onLoadPreset?: () => void
  onNewProject?: () => void
  onLogin?: () => void
}

interface HUDState {
  menuOpen: boolean
}

@inject('store')
@observer
class EditorHUD extends Component<PageProps, HUDState> {
  state: HUDState = { menuOpen: false }

  private cycleGrid = () => {
    const { editorStore, onGridChange } = this.props
    if (!editorStore || !onGridChange) return
    const idx = HOME_GRID_OPTIONS.indexOf(editorStore.grid)
    const nextIdx = (idx + 1) % HOME_GRID_OPTIONS.length
    onGridChange(HOME_GRID_OPTIONS[nextIdx])
  }

  private toggleMenu = () => {
    this.setState(s => ({ menuOpen: !s.menuOpen }))
  }

  render() {
    const { editorStore } = this.props.store!
    const { onToggleCamera, onSave, onLoad, onLoadPreset, onNewProject, onLogin } = this.props
    const { menuOpen } = this.state

    return (
      <CoverView>
        {/* 顶栏背景 */}
        <CoverView className='hud-bar' />

        {/* 汉堡按钮 */}
        <CoverView className='hud-hamburger' onClick={this.toggleMenu}>
          <Text className='hud-hamburger-icon'>☰</Text>
        </CoverView>

        {/* 标题 */}
        <Text className='hud-title'>Tiny World</Text>

        {/* 网格尺寸 */}
        <CoverView className='hud-gridsize' onClick={this.cycleGrid}>
          <Text className='hud-gridsize-label'>{editorStore.grid}&times;{editorStore.grid}</Text>
        </CoverView>

        {/* 汉堡菜单面板 */}
        {menuOpen && (
          <CoverView className='hud-menu' onClick={this.toggleMenu}>
            <CoverView className='hud-menu-item' onClick={onToggleCamera}>
              <Text className='hud-menu-icon'>P</Text>
              <Text className='hud-menu-label'>Camera</Text>
            </CoverView>
            <CoverView className='hud-menu-item' onClick={onSave}>
              <Text className='hud-menu-icon'>S</Text>
              <Text className='hud-menu-label'>Save</Text>
            </CoverView>
            <CoverView className='hud-menu-item' onClick={onLoad}>
              <Text className='hud-menu-icon'>L</Text>
              <Text className='hud-menu-label'>Load</Text>
            </CoverView>
            <CoverView className='hud-menu-item' onClick={onLoadPreset}>
              <Text className='hud-menu-icon'>P</Text>
              <Text className='hud-menu-label'>Preset</Text>
            </CoverView>
            <CoverView className='hud-menu-item' onClick={onNewProject}>
              <Text className='hud-menu-icon'>N</Text>
              <Text className='hud-menu-label'>New</Text>
            </CoverView>
            <CoverView className='hud-menu-item' onClick={onLogin}>
              <Text className='hud-menu-icon'>L</Text>
              <Text className='hud-menu-label'>Login</Text>
            </CoverView>
          </CoverView>
        )}
      </CoverView>
    )
  }
}

export default EditorHUD
