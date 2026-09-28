// 全屏工具：进入/退出浏览器全屏（隐藏窗口与地址栏），兼容不支持的环境静默降级

/** iOS 检测：iPhone/iPad/iPod，或 iPadOS 桌面模式（MacIntel + 触屏） */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

/** 当前是否处于沉浸模式（iOS Safari / Android WebView 等不支持 document 全屏时的兜底方案） */
export function isImmersive(): boolean {
  return typeof document !== 'undefined' && document.body.classList.contains('ios-immersive');
}

/** 进入"沉浸模式"（全终端通用）：隐藏页面非棋盘 UI、收起浏览器工具栏，
 *  配合 .ios-immersive 让浮动棋盘占满可视区，实现浏览器内最佳全屏效果 */
export function enterImmersive(): void {
  document.body.classList.add('ios-immersive');
  try {
    window.scrollTo(0, 0);
    // 触发 Safari 地址栏滚动收起（iOS 15+ 有效，无效时静默）
    const se = document.scrollingElement;
    if (se) {
      se.scrollTop = 1;
      setTimeout(() => { se.scrollTop = 0; }, 80);
    }
  } catch { /* 忽略 */ }
}

export function enterFullscreen(): void {
  if (isIOS()) { enterImmersive(); return; }
  try {
    const el = document.documentElement;
    if (!document.fullscreenElement) {
      if (!el.requestFullscreen) {
        // Android WebView/微信内置浏览器等：无 Fullscreen API → 直接沉浸兜底
        enterImmersive();
        return;
      }
      const p = el.requestFullscreen();
      if (p && typeof p.catch === 'function') p.catch(() => { enterImmersive(); }); // 被拒（手势外/权限）→ 沉浸兜底
    }
  } catch { enterImmersive(); }
}

export function exitFullscreen(): void {
  if (isImmersive()) { document.body.classList.remove('ios-immersive'); }
  try {
    if (document.fullscreenElement) {
      const p = document.exitFullscreen?.();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
  } catch { /* 忽略 */ }
}
