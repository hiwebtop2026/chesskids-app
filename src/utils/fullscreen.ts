// 全屏工具：进入/退出浏览器全屏（隐藏窗口与地址栏），兼容不支持的环境静默降级

/** iOS 检测：iPhone/iPad/iPod，或 iPadOS 桌面模式（MacIntel + 触屏） */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

/** iOS Safari 不支持 document 全屏：进入"沉浸模式"——隐藏页面非棋盘 UI、收起地址栏，
 *  配合 .ios-immersive 让浮动棋盘占满可视区，实现浏览器内最佳全屏效果 */
function enterIOSImmersive(): void {
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
  if (isIOS()) { enterIOSImmersive(); return; }
  try {
    const el = document.documentElement;
    if (!document.fullscreenElement) {
      const p = el.requestFullscreen?.();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
  } catch { /* 忽略：非手势调用等被拒时静默 */ }
}

export function exitFullscreen(): void {
  if (isIOS()) { document.body.classList.remove('ios-immersive'); return; }
  try {
    if (document.fullscreenElement) {
      const p = document.exitFullscreen?.();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
  } catch { /* 忽略 */ }
}
