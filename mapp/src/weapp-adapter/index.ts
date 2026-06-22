/**
 * Minimal weapp-adapter for Three.js r128 in WeChat Mini Program (Taro).
 *
 * WeChat / Taro already provides partial `document` (with read-only
 * createElementNS). We only fill what's MISSING — never override existing
 * read-only DOM properties.
 */

// ---- performance ----
if (typeof (globalThis as any).performance === 'undefined') {
  (globalThis as any).performance = {
    now: () => Date.now(),
    timing: { navigationStart: Date.now() },
  };
}

// ---- navigator ----
if (typeof (globalThis as any).navigator === 'undefined') {
  (globalThis as any).navigator = {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.0',
    platform: 'iPhone',
    language: 'zh-CN',
    appVersion: '5.0 (iPhone; CPU iPhone OS like Mac OS X) AppleWebKit/605.1.15',
  };
}

// ---- location ----
if (typeof (globalThis as any).location === 'undefined') {
  (globalThis as any).location = { href: '', protocol: 'https:', hostname: '', search: '', hash: '' };
}

// ---- window (if missing) ----
if (typeof (globalThis as any).window === 'undefined') {
  const w: any = {
    requestAnimationFrame: (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16),
    cancelAnimationFrame: (id: number) => clearTimeout(id),

    devicePixelRatio: 2,
    innerWidth: 375,
    innerHeight: 667,

    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,

    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,

    matchMedia: () => ({ matches: false, addListener: () => {}, removeListener: () => {} }),
    getComputedStyle: () => ({ getPropertyValue: () => '' }),

    location: (globalThis as any).location,
    navigator: (globalThis as any).navigator,
    document: (globalThis as any).document,
    performance: (globalThis as any).performance,

    __THREE__: undefined,
  };
  w.window = w;
  w.self = w;
  w.top = w;
  w.parent = w;
  (globalThis as any).window = w;
  (globalThis as any).self = w;
  (globalThis as any).top = w;
}

/**
 * Update window dimensions from Taro system info at runtime.
 */
export function updateWindowSize(width: number, height: number, dpr: number) {
  const w = (globalThis as any).window;
  if (w) {
    w.innerWidth = width;
    w.innerHeight = height;
    w.devicePixelRatio = dpr;
  }
}

/**
 * Replace requestAnimationFrame with canvas-native version.
 */
export function adoptCanvasAnimationFrame(canvas: any) {
  const w = (globalThis as any).window;
  if (w && canvas?.requestAnimationFrame) {
    w.requestAnimationFrame = (cb: FrameRequestCallback) => canvas.requestAnimationFrame(cb);
    w.cancelAnimationFrame = (id: number) => canvas.cancelAnimationFrame(id);
  }
}

export default {};
