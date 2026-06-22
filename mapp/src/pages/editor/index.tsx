/**
 * 编辑器页面 — 主入口
 *
 * 1. 初始化 Taro Canvas (WebGL)
 * 2. 启动 Three.js 场景
 * 3. 挂载 MobX Store
 * 4. touch → raycaster 交互
 */
import { Component, PropsWithChildren } from 'react'
import { Canvas, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { inject, observer } from 'mobx-react'

import { EditorStore } from '../../store/editorStore'
import { SceneManager } from '../../three/SceneManager'
import { getWindowInfo } from '../../services/PlatformAdapter'

import './index.scss'

type PageProps = PropsWithChildren & {
  store?: { editorStore: EditorStore }
}

interface EditorState {
  status: 'loading' | 'ready' | 'error'
  errorMsg: string | null
}

@inject('store')
@observer
class EditorPage extends Component<PageProps, EditorState> {
  private sceneManager = new SceneManager()
  private canvas: any = null

  state: EditorState = { status: 'loading', errorMsg: null }

  componentDidMount() {
    Taro.nextTick(() => this.init())
  }

  componentWillUnmount() {
    this.sceneManager.dispose()
  }

  private async init() {
    try {
      // 1. 获取 canvas
      const canvas = await this.getCanvasNode()
      if (!canvas) {
        this.setState({ status: 'error', errorMsg: 'Canvas 获取失败' })
        return
      }
      this.canvas = canvas

      // 2. 获取窗口信息
      const win = getWindowInfo()

      // 3. 初始化场景
      await this.sceneManager.init(canvas, win.width, win.height, win.dpr)
      this.sceneManager.start()

      // 4. 标记就绪
      const { editorStore } = this.props.store!
      editorStore.ready = true
      this.setState({ status: 'ready' })

    } catch (err: any) {
      console.error('[editor] init error:', err)
      this.setState({ status: 'error', errorMsg: err?.message || String(err) })
    }
  }

  private getCanvasNode(): Promise<any> {
    return new Promise((resolve, reject) => {
      const query = Taro.createSelectorQuery()
      query
        .select('#editor-canvas')
        .node((res: any) => {
          if (res?.node) resolve(res.node)
          else reject(new Error('Canvas node null'))
        })
        .exec()
    })
  }

  // ---- touch 交互 ----
  private touchStart = { x: 0, y: 0 }

  private onTouchStart = (e: any) => {
    const t = e.touches?.[0]
    if (t) {
      this.touchStart = { x: t.clientX || t.x || 0, y: t.clientY || t.y || 0 }
    }
  }

  private onTouchMove = (e: any) => {
    // TODO: camera orbit / raycaster
  }

  private onTouchEnd = () => {
    // TODO: place/select
  }

  render() {
    const { status, errorMsg } = this.state

    return (
      <View className='editor-container'>
        <Canvas
          type='webgl'
          id='editor-canvas'
          className='editor-canvas'
          onTouchStart={this.onTouchStart}
          onTouchMove={this.onTouchMove}
          onTouchEnd={this.onTouchEnd}
          disableScroll
        />

        {status === 'loading' && (
          <View className='editor-loading'>Loading Tiny World...</View>
        )}

        {status === 'error' && (
          <View className='editor-error'>{errorMsg}</View>
        )}
      </View>
    )
  }
}

export default EditorPage
