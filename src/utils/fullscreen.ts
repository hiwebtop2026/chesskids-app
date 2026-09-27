// 全屏工具：进入/退出浏览器全屏（隐藏窗口与地址栏），兼容不支持的环境静默降级
export function enterFullscreen(): void {
  try {
    const el = document.documentElement;
    if (!document.fullscreenElement) {
      const p = el.requestFullscreen?.();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
  } catch { /* 忽略：非手势调用等被拒时静默 */ }
}

export function exitFullscreen(): void {
  try {
    if (document.fullscreenElement) {
      const p = document.exitFullscreen?.();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
  } catch { /* 忽略 */ }
}
