/**
 * 独立游戏窗口：把牌桌放到脱离站点外壳的浮层窗口里
 * 通过 ?popup=<kind> 参数让同一应用只渲染游戏本体（无导航栏、无首页）
 */

export type GamePopupKind = 'gd-ai' | 'gd-online';

const POPUP_NAME_PREFIX = 'chesskids-popup';

/** 当前页面是否为独立游戏窗口 */
export function readPopupKind(): GamePopupKind | null {
  try {
    const raw = new URLSearchParams(window.location.search).get('popup');
    return raw === 'gd-ai' || raw === 'gd-online' ? raw : null;
  } catch {
    return null;
  }
}

/**
 * 打开独立游戏窗口（需在用户点击的同步调用里执行，否则会被浏览器拦截）
 * @returns 是否成功打开；被拦截时返回 false
 */
export function openGameWindow(kind: GamePopupKind): boolean {
  if (typeof window === 'undefined') return false;
  const screenW = window.screen?.availWidth ?? 1280;
  const screenH = window.screen?.availHeight ?? 800;
  const width = Math.max(720, Math.min(1440, Math.round(screenW * 0.92)));
  const height = Math.max(560, Math.min(920, Math.round(screenH * 0.92)));
  const left = Math.max(0, Math.round((screenW - width) / 2));
  const top = Math.max(0, Math.round((screenH - height) / 2));
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('popup', kind);
  const features = [
    'popup=yes',
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
    'menubar=no',
    'toolbar=no',
    'location=no',
    'status=no',
    'resizable=yes',
    'scrollbars=no',
  ].join(',');
  let win: Window | null = null;
  try {
    win = window.open(url.toString(), `${POPUP_NAME_PREFIX}-${kind}`, features);
  } catch {
    return false;
  }
  if (!win) return false;
  try {
    win.focus();
  } catch {
    // 部分浏览器禁止聚焦，忽略
  }
  return true;
}
