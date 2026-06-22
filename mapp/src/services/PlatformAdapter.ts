/**
 * 平台适配层 — 统一浏览器 API 与微信小程序 API
 *
 * 所有引擎代码通过此层访问平台功能（存储/音频/网络/文件等）。
 * 后续移植浏览器版代码时，把原生的 localStorage/fetch/Audio
 * 调用替换为 twStorage/twFetch/twAudio。
 */

import Taro from '@tarojs/taro'

// ======== 存储 ========
export const twStorage = {
  get<T = string>(key: string): T | null {
    try {
      const raw = Taro.getStorageSync('tinyworld:' + key)
      return raw as unknown as T
    } catch { return null }
  },

  set(key: string, value: any): void {
    try {
      Taro.setStorageSync('tinyworld:' + key, value)
    } catch (e) {
      console.error('[storage] set failed', key, e)
    }
  },

  remove(key: string): void {
    try { Taro.removeStorageSync('tinyworld:' + key) }
    catch { /* ok */ }
  },

  getJSON<T>(key: string): T | null {
    const raw = this.get<string>(key)
    if (!raw) return null
    try { return JSON.parse(raw) as T }
    catch { return null }
  },

  setJSON(key: string, value: any): void {
    this.set(key, JSON.stringify(value))
  },
}

// ======== 窗口信息 ========
export function getWindowInfo() {
  try {
    const info = Taro.getWindowInfo()
    return { width: info.windowWidth, height: info.windowHeight, dpr: info.pixelRatio }
  } catch {
    // fallback
    return { width: 375, height: 667, dpr: 2 }
  }
}

// ======== 网络请求 ========
export async function twFetch(url: string, opts?: Taro.request.Option): Promise<any> {
  return new Promise((resolve, reject) => {
    Taro.request({
      url,
      ...opts,
      success: resolve,
      fail: reject,
    })
  })
}

// ======== 音频 ========
export function twPlaySound(src: string) {
  const ic = Taro.createInnerAudioContext()
  ic.src = src
  ic.play()
  return ic
}

// ======== Toast / 提示 ========
export function twToast(msg: string) {
  Taro.showToast({ title: msg, icon: 'none', duration: 2000 })
}
