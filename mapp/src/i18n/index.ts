/**
 * i18n 核心 — 小程序版
 *
 * 用法: import { t, setLocale, getLocale } from '../i18n'
 */

import Taro from '@tarojs/taro'

type LocaleData = Record<string, string>
type AllLocales = Record<string, LocaleData>

const SUPPORTED = ['en', 'zh', 'fr', 'es', 'th'] as const
type LocaleCode = typeof SUPPORTED[number]

const LS_KEY = 'tinyworld:lang'
const DEFAULT: LocaleCode = 'en'

// ---- 内联 locale 数据（小程序不支持动态 import JSON）----
const DATA: AllLocales = {}

function register(code: string, data: LocaleData) {
  DATA[code] = data
}

// ---- 公共 API ----

let _locale: LocaleCode = DEFAULT

/** 翻译 key，支持 {name} 插值 */
export function t(key: string, params?: Record<string, string | number>): string {
  if (key == null) return ''
  const active = DATA[_locale]
  let val = active?.[key]
  if (val === undefined && _locale !== DEFAULT) {
    val = DATA[DEFAULT]?.[key]
  }
  if (val === undefined) val = key
  if (params && val.indexOf('{') >= 0) {
    val = val.replace(/\{(\w+)\}/g, (_, name) =>
      Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : _
    )
  }
  return val
}

/** 检查 key 是否有翻译 */
export function has(key: string): boolean {
  if (key == null) return false
  return !!(DATA[_locale]?.[key] ?? DATA[DEFAULT]?.[key])
}

/** 翻译或返回 fallback */
export function tx(key: string, fallback: string): string {
  return has(key) ? t(key) : fallback
}

/** 获取当前 locale */
export function getLocale(): LocaleCode {
  return _locale
}

/** 设置 locale（持久化并触发 UI 更新） */
export function setLocale(code: string) {
  const norm = normalize(code) || DEFAULT
  _locale = norm
  try { Taro.setStorageSync(LS_KEY, norm) } catch {}
}

/** 获取支持的 locale 列表 */
export function getSupportedLocales(): readonly string[] {
  return SUPPORTED
}

/** 获取 locale 端onym */
export const LOCALE_NAMES: Record<string, string> = {
  en: 'English',
  zh: '中文',
  fr: 'Français',
  es: 'Español',
  th: 'ไทย',
}

// ---- 内部 ----

function normalize(code: string | null | undefined): LocaleCode | null {
  if (!code) return null
  code = code.toLowerCase().trim()
  if ((SUPPORTED as readonly string[]).includes(code)) return code as LocaleCode
  const base = code.split(/[-_]/)[0]
  if ((SUPPORTED as readonly string[]).includes(base)) return base as LocaleCode
  return null
}

function resolveLocale(): LocaleCode {
  // 1. 存储
  try {
    const stored = normalize(Taro.getStorageSync(LS_KEY))
    if (stored) return stored
  } catch {}
  // 2. 系统语言
  try {
    const info = Taro.getSystemInfoSync()
    const lang = info.language || ''
    const auto = normalize(lang)
    if (auto) return auto
  } catch {}
  return DEFAULT
}

// 初始化
_locale = resolveLocale()

// ---- 导出注册函数供 locale 文件使用 ----
export { register, DATA }
