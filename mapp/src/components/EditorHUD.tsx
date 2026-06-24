// -------- 编辑器 HUD — 普通 View 布局（canvas 之外）--------

import { Component, PropsWithChildren } from 'react'
import { View, Text } from '@tarojs/components'
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
  onToggleTime?: () => void
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

  private wrap = (cb?: () => void) => () => {
    cb?.()
    this.setState({ menuOpen: false })
  }

  render() {
    const { editorStore } = this.props.store!
    const { onToggleCamera, onSave, onLoad, onLoadPreset, onNewProject, onLogin, onToggleTime, onOpenLibrary } = this.props
    const { menuOpen } = this.state

    return (
      <View className='hud-bar'>
        <View className='hud-hamburger' onClick={this.toggleMenu}>
          <Text className='hud-hamburger-icon'>☰</Text>
        </View>

        <Text className='hud-title'>Tiny World</Text>

        <View className='hud-gridsize' onClick={this.cycleGrid}>
          <Text className='hud-gridsize-label'>{editorStore.grid}&times;{editorStore.grid}</Text>
        </View>

        {menuOpen && (
          <View className='hud-menu'>
            <View className='hud-menu-item' onClick={this.wrap(onToggleCamera)}>
              <Text className='hud-menu-icon'>◈</Text>
              <Text className='hud-menu-label'>Camera</Text>
            </View>
            <View className='hud-menu-item' onClick={this.wrap(onSave)}>
              <Text className='hud-menu-icon'>S</Text>
              <Text className='hud-menu-label'>Save</Text>
            </View>
            <View className='hud-menu-item' onClick={this.wrap(onLoad)}>
              <Text className='hud-menu-icon'>L</Text>
              <Text className='hud-menu-label'>Load</Text>
            </View>
            <View className='hud-menu-item' onClick={this.wrap(onLoadPreset)}>
              <Text className='hud-menu-icon'>P</Text>
              <Text className='hud-menu-label'>Preset</Text>
            </View>
            <View className='hud-menu-item' onClick={this.wrap(onNewProject)}>
              <Text className='hud-menu-icon'>N</Text>
              <Text className='hud-menu-label'>New</Text>
            </View>
            <View className='hud-menu-item' onClick={this.wrap(onOpenLibrary)}>
              <Text className='hud-menu-icon'>🏗</Text>
              <Text className='hud-menu-label'>Library</Text>
            </View>
            <View className='hud-menu-item' onClick={this.wrap(onLogin)}>
              <Text className='hud-menu-icon'>👤</Text>
              <Text className='hud-menu-label'>Login</Text>
            </View>
            <View className='hud-menu-item' onClick={this.wrap(onToggleTime)}>
              <Text className='hud-menu-icon'>T</Text>
              <Text className='hud-menu-label'>Time</Text>
            </View>
          </View>
        )}
      </View>
    )
  }
}

export default EditorHUD
